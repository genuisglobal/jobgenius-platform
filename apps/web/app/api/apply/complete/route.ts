import { buildContactSuggestions, buildDraftEmail } from "@/lib/outreach";
import { buildInterviewPrepContent } from "@/lib/interview-prep";
import { fetchCompanyInfo } from "@/lib/company-info";
import { getActorFromHeaders } from "@/lib/actor";
import { requireAMAccessToSeeker } from "@/lib/am-access";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { supabaseServer } from "@/lib/supabase/server";
import { sendAndLogEmail } from "@/lib/messaging/send-and-log";
import { applicationAckEmail } from "@/lib/email-templates/application-ack";
import { recordAdapterEvent } from "@/lib/adapter-health";
import { logActivity } from "@/lib/feedback-loop";
import { transitionRun } from "@/lib/runState";
import { findLatestPendingTrialForRun, recordOutcome } from "@/lib/bandit";
import { isActiveClient } from "@/lib/intake";
import { updateMatchOutcome } from "@/lib/learned-ranker";
import { writeOutcomeEvent } from "@/lib/outcomes-server";

type CompletePayload = {
  run_id?: string;
  claim_token?: string;
  note?: string;
  last_seen_url?: string;
};

function requiresClaimToken(headers: Headers) {
  const runner = (headers.get("x-runner") ?? "").toLowerCase();
  return runner === "extension" || runner === "cloud";
}

export async function POST(request: Request) {
  let payload: CompletePayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.run_id) {
    return Response.json(
      { success: false, error: "Missing run_id." },
      { status: 400 }
    );
  }

  const { data: run, error: runError } = await supabaseServer
    .from("application_runs")
    .select(
      "id, queue_id, job_seeker_id, job_post_id, ats_type, current_step, claim_token, status"
    )
    .eq("id", payload.run_id)
    .single();

  if (runError || !run) {
    return Response.json(
      { success: false, error: "Run not found." },
      { status: 404 }
    );
  }

  const access = await requireAMAccessToSeeker(request.headers, run.job_seeker_id);
  if (!access.ok) return access.response;

  if (!(await isActiveClient(run.job_seeker_id))) {
    return Response.json(
      {
        success: false,
        error: "Live applications are only allowed for active clients.",
      },
      { status: 409 }
    );
  }

  if (requiresClaimToken(request.headers)) {
    if (!payload.claim_token) {
      return Response.json(
        { success: false, error: "Missing claim_token." },
        { status: 400 }
      );
    }
    if (!run.claim_token || run.claim_token !== payload.claim_token) {
      return Response.json(
        { success: false, error: "Claim token mismatch." },
        { status: 409 }
      );
    }
  }

  const transition = transitionRun(run.status, "COMPLETE");
  if (!transition.ok) {
    return Response.json(
      { success: false, error: transition.reason, current_status: run.status },
      { status: 409 }
    );
  }

  const nowIso = new Date().toISOString();

  const { error } = await supabaseServer
    .from("application_runs")
    .update({
      status: transition.to,
      needs_attention_reason: null,
      last_seen_url: payload.last_seen_url ?? null,
      locked_at: null,
      locked_by: null,
      claim_token: null,
      updated_at: nowIso,
    })
    .eq("id", run.id)
    .eq("status", transition.from); // race guard

  if (error) {
    return Response.json(
      { success: false, error: "Failed to complete run." },
      { status: 500 }
    );
  }

  if (run.queue_id) {
    const { error: queueError } = await supabaseServer
      .from("application_queue")
      .update({ status: "APPLIED", category: "applied", updated_at: nowIso })
      .eq("id", run.queue_id);

    if (queueError) {
      console.error("[apply:complete] failed to update queue status:", queueError);
    }
  }

  const { error: stepError } = await supabaseServer.from("application_step_events").insert({
    run_id: run.id,
    step: run.current_step,
    event_type: "APPLIED",
    message: payload.note ?? "Marked applied.",
  });

  if (stepError) {
    console.error("[apply:complete] failed to insert step event:", stepError);
  }

  const actor = getActorFromHeaders(request.headers);
  const outcomeSourceChannel = actor === "AM_UI" ? "am_portal" : "application_runner";

  const { error: runEventError } = await supabaseServer.from("apply_run_events").insert({
    run_id: run.id,
    level: "INFO",
    event_type: "APPLIED",
    actor,
    payload: { note: payload.note ?? null },
  });

  if (runEventError) {
    console.error("[apply:complete] failed to insert run event:", runEventError);
  }

  const { data: jobPost } = await supabaseServer
    .from("job_posts")
    .select("id, title, company, company_website, description_text, location")
    .eq("id", run.job_post_id)
    .single();

  const { data: jobSeeker } = await supabaseServer
    .from("job_seekers")
    .select("id, full_name, email, seniority, work_type")
    .eq("id", run.job_seeker_id)
    .single();

  if (jobPost && jobSeeker) {
    let scrapedEmails: string[] = [];
    if (jobPost.company_website) {
      const info = await fetchCompanyInfo(jobPost.company_website);
      scrapedEmails = info.emails;
      if (info.emails.length > 0 || info.pagesVisited.length > 0) {
        const { error: companyInfoError } = await supabaseServer.from("company_info").insert({
          company_website: jobPost.company_website,
          emails: info.emails,
          pages_visited: info.pagesVisited,
        });

        if (companyInfoError) {
          console.error("[apply:complete] failed to insert company_info:", companyInfoError);
        }
      }
    }

    const rolePriority = [
      "Hiring Manager",
      "Recruiter/TA",
      "Department Head",
      "Team Lead/Manager",
    ];
    const suggestions = buildContactSuggestions({
      companyName: jobPost.company,
      companyWebsite: jobPost.company_website,
    });

    const scrapedContacts = scrapedEmails.slice(0, 2).map((email, index) => ({
      job_seeker_id: jobSeeker.id,
      job_post_id: jobPost.id,
      company_name: jobPost.company ?? null,
      role: rolePriority[index] ?? "Recruiter/TA",
      full_name: null,
      email,
      source: "scraped",
    }));

    const contactRows =
      scrapedContacts.length > 0
        ? scrapedContacts
        : suggestions.map((suggestion) => ({
            job_seeker_id: jobSeeker.id,
            job_post_id: jobPost.id,
            company_name: jobPost.company ?? null,
            role: suggestion.role,
            full_name: suggestion.full_name,
            email: suggestion.email,
            source: "generated",
          }));

    const { data: createdContacts } = await supabaseServer
      .from("outreach_contacts")
      .insert(contactRows)
      .select("id, role");

    const nowIsoInner = new Date().toISOString();
    const draftRows = (createdContacts ?? []).map((contact) => {
      const draft = buildDraftEmail({
        jobTitle: jobPost.title,
        companyName: jobPost.company,
        jobSeekerName: jobSeeker.full_name,
        contactRole: contact.role,
      });

      return {
        job_seeker_id: jobSeeker.id,
        job_post_id: jobPost.id,
        contact_id: contact.id,
        subject: draft.subject,
        body: draft.body,
        status: "DRAFT",
        updated_at: nowIsoInner,
      };
    });

    if (draftRows.length > 0) {
      const { error: draftUpsertError } = await supabaseServer
        .from("outreach_drafts")
        .upsert(draftRows, { onConflict: "job_seeker_id,job_post_id,contact_id" });

      if (draftUpsertError) {
        console.error("[apply:complete] failed to upsert outreach drafts:", draftUpsertError);
      }
    }

    if (draftRows.length > 0) {
      const { error: outboxError } = await supabaseServer.from("apply_outbox").insert(
        draftRows.map((draft) => ({
          job_seeker_id: draft.job_seeker_id,
          job_post_id: draft.job_post_id,
          draft_id: null,
          provider: process.env.EMAIL_SEND_PROVIDER ?? "stub",
          status: "PENDING",
          request_payload: {
            subject: draft.subject,
          },
          updated_at: nowIsoInner,
        }))
      );

      if (outboxError) {
        console.error("[apply:complete] failed to insert apply_outbox entries:", outboxError);
      }
    }

    if (draftRows.length > 0) {
      const contactIds = (createdContacts ?? []).map((contact) => contact.id);
      enqueueBackgroundJob("AUTO_OUTREACH", {
        job_seeker_id: jobSeeker.id,
        job_post_id: jobPost.id,
        ...(contactIds.length > 0 ? { contact_ids: contactIds } : {}),
      }).catch(() => {
        // Non-blocking: outreach scheduling should not break completion flow
      });
    }

    const prepContent = buildInterviewPrepContent({
      jobTitle: jobPost.title,
      companyName: jobPost.company,
      descriptionText: jobPost.description_text,
      location: jobPost.location,
      seniority: jobSeeker.seniority,
      workType: jobSeeker.work_type,
    });

    const { error: prepError } = await supabaseServer.from("interview_prep").upsert(
      {
        job_seeker_id: jobSeeker.id,
        job_post_id: jobPost.id,
        content: prepContent,
        updated_at: nowIsoInner,
      },
      { onConflict: "job_seeker_id,job_post_id" }
    );

    if (prepError) {
      console.error("[apply:complete] failed to upsert interview_prep:", prepError);
    }

    // Send application acknowledgement email to the job seeker
    if (jobSeeker.email) {
      const ackTemplate = applicationAckEmail({
        candidateName: jobSeeker.full_name ?? "Candidate",
        jobTitle: jobPost.title,
        company: jobPost.company,
      });

      await sendAndLogEmail({
        to: jobSeeker.email,
        subject: ackTemplate.subject,
        html: ackTemplate.html,
        text: ackTemplate.text,
        template_key: "application_ack",
        job_seeker_id: jobSeeker.id,
        job_post_id: jobPost.id,
        application_queue_id: run.queue_id ?? undefined,
      }).catch((err) => console.error("[apply:complete] completion email failed:", err));
    }
  }

  // Record adapter health event (non-blocking)
  recordAdapterEvent({
    atsType: run.ats_type ?? "UNKNOWN",
    runId: run.id,
    outcome: "success",
    step: run.current_step ?? undefined,
  }).catch((err) => console.error("[apply:complete] adapter health event failed:", err));

  // Close the bandit loop: if this run had a pending retry trial, mark it
  // a success so the next pickArm has fresh signal.
  findLatestPendingTrialForRun(run.id, "retry:")
    .then((trial) => trial && recordOutcome({ trialId: trial.trialId, outcome: "success" }))
    .catch((err) => console.error("[apply:complete] bandit outcome failed:", err));

  // Stamp the learned-ranker outcome on the (seeker, job_post) feature row.
  // 'applied' is a positive-leaning signal; interview/offer events upgrade it later.
  void updateMatchOutcome({
    jobSeekerId: run.job_seeker_id,
    jobPostId: run.job_post_id,
    outcome: "applied",
  });

  // Log to seeker activity feed (non-blocking)
  logActivity(run.job_seeker_id, {
    eventType: "application_applied",
    title: "Application submitted",
    description: jobPost
      ? `Applied to ${jobPost.title} at ${jobPost.company}`
      : "Application completed",
    meta: { run_id: run.id, ats_type: run.ats_type, job_post_id: run.job_post_id },
    refType: "application_runs",
    refId: run.id,
  }).catch((err) => console.error("[apply:complete] activity log failed:", err));

  try {
    await writeOutcomeEvent({
      eventType: "application_submitted",
      occurredAt: nowIso,
      jobSeekerId: run.job_seeker_id,
      applicationRunId: run.id,
      actorUserId: access.amId,
      actorAccountManagerId: access.amId,
      sourceChannel: outcomeSourceChannel,
      sourceRecordType: "application_run",
      sourceRecordId: run.id,
      metadata: {
        actor,
        ats_type: run.ats_type,
        queue_id: run.queue_id ?? null,
        job_post_id: run.job_post_id,
        current_step: run.current_step,
        note: payload.note ?? null,
      },
    });
  } catch (error) {
    console.error("[outcomes] application completion shadow write failed:", error);
  }

  return Response.json({
    success: true,
    run_id: run.id,
    status: "APPLIED",
  });
}
