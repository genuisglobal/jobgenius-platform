import { getAccountManagerFromRequest } from "@/lib/am-access";
import { requireOpsAuth } from "@/lib/ops-auth";
import { supabaseServer } from "@/lib/supabase/server";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { sendAndLogEmail } from "@/lib/messaging/send-and-log";
import { interviewInviteEmail } from "@/lib/email-templates/interview-invite";
import { interviewConfirmedEmail } from "@/lib/email-templates/interview-confirmed";
import { buildIcsEvent, icsToDataUri } from "@/lib/interviews/ics-builder";
import { logActivity } from "@/lib/feedback-loop";

type CreatePayload = {
  application_queue_id?: string;
  job_post_id: string;
  job_seeker_id: string;
  account_manager_id?: string;
  interview_type?: "phone" | "video" | "in_person";
  duration_min?: number;
  meeting_link?: string;
  phone_number?: string;
  address?: string;
  notes_for_candidate?: string;
  notes_internal?: string;
  slot_ids?: string[];
  scheduled_at?: string;
};

export async function POST(request: Request) {
  const auth = requireOpsAuth(request.headers, request.url);
  let amId: string | null = null;

  if (!auth.ok) {
    const amResult = await getAccountManagerFromRequest(request.headers);
    if ("error" in amResult) {
      return Response.json({ success: false, error: amResult.error }, { status: 401 });
    }
    amId = amResult.accountManager.id;
  }

  let body: CreatePayload;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.job_post_id || !body.job_seeker_id) {
    return Response.json(
      { success: false, error: "Missing required fields: job_post_id, job_seeker_id." },
      { status: 400 }
    );
  }

  const managerId = amId ?? body.account_manager_id;
  if (!managerId) {
    return Response.json(
      { success: false, error: "Missing account_manager_id." },
      { status: 400 }
    );
  }

  const hasSlots = body.slot_ids && body.slot_ids.length > 0;
  const hasDirect = !!body.scheduled_at;

  if (!hasSlots && !hasDirect) {
    return Response.json(
      { success: false, error: "Provide slot_ids[] or scheduled_at." },
      { status: 400 }
    );
  }

  const status = hasSlots ? "pending_candidate" : "confirmed";

  const { data: interview, error: insertError } = await supabaseServer
    .from("interviews")
    .insert({
      application_queue_id: body.application_queue_id ?? null,
      job_post_id: body.job_post_id,
      job_seeker_id: body.job_seeker_id,
      account_manager_id: managerId,
      interview_type: body.interview_type ?? "video",
      duration_min: body.duration_min ?? 30,
      meeting_link: body.meeting_link ?? null,
      phone_number: body.phone_number ?? null,
      address: body.address ?? null,
      notes_for_candidate: body.notes_for_candidate ?? null,
      notes_internal: body.notes_internal ?? null,
      status,
      scheduled_at: hasDirect ? body.scheduled_at : null,
      confirmed_at: hasDirect ? new Date().toISOString() : null,
    })
    .select("*")
    .single();

  if (insertError || !interview) {
    return Response.json(
      { success: false, error: insertError?.message ?? "Failed to create interview." },
      { status: 500 }
    );
  }

  // Log to activity feed (non-blocking)
  logActivity(body.job_seeker_id, {
    eventType: "interview_scheduled",
    title: "Interview scheduled",
    description: `${body.interview_type ?? "Video"} interview${body.scheduled_at ? ` on ${new Date(body.scheduled_at).toLocaleDateString()}` : " — awaiting candidate confirmation"}`,
    meta: { interview_id: interview.id, job_post_id: body.job_post_id, type: body.interview_type },
    refType: "interviews",
    refId: interview.id,
  }).catch((err) => console.error("[interviews] activity log failed:", err));

  // Insert slot offers if slot_ids provided
  if (hasSlots && body.slot_ids) {
    const offers = body.slot_ids.map((slotId) => ({
      interview_id: interview.id,
      slot_id: slotId,
    }));

    await supabaseServer.from("interview_slot_offers").insert(offers);
  }

  // Lookup job seeker and job post for emails
  const { data: seeker } = await supabaseServer
    .from("job_seekers")
    .select("full_name, email")
    .eq("id", body.job_seeker_id)
    .single();

  const { data: jobPost } = await supabaseServer
    .from("job_posts")
    .select("title, company")
    .eq("id", body.job_post_id)
    .single();

  if (seeker?.email && jobPost) {
    const candidateName = seeker.full_name ?? "Candidate";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    if (hasSlots) {
      // Fetch offered slots for summary
      const { data: slots } = await supabaseServer
        .from("interview_slots")
        .select("start_at, end_at, duration_min")
        .in("id", body.slot_ids!);

      const slotSummaries = (slots ?? []).map((s) => {
        const d = new Date(s.start_at);
        return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} (${s.duration_min} min)`;
      });

      const confirmUrl = `${appUrl}/interview-confirm/${interview.candidate_token}`;
      const template = interviewInviteEmail({
        candidateName,
        jobTitle: jobPost.title,
        company: jobPost.company,
        interviewType: interview.interview_type,
        notesForCandidate: interview.notes_for_candidate,
        confirmUrl,
        slotSummaries,
      });

      await sendAndLogEmail({
        to: seeker.email,
        subject: template.subject,
        html: template.html,
        text: template.text,
        template_key: "interview_invite",
        job_seeker_id: body.job_seeker_id,
        job_post_id: body.job_post_id,
        interview_id: interview.id,
      });
    } else {
      // Direct schedule — send confirmed email
      const ics = buildIcsEvent({
        summary: `Interview: ${jobPost.title} at ${jobPost.company ?? "Company"}`,
        description: `${interview.interview_type.replace("_", "-")} interview for ${jobPost.title}`,
        startAt: interview.scheduled_at,
        durationMin: interview.duration_min,
        location: interview.address,
        meetingLink: interview.meeting_link,
      });

      const template = interviewConfirmedEmail({
        recipientName: candidateName,
        jobTitle: jobPost.title,
        company: jobPost.company,
        interviewType: interview.interview_type,
        scheduledAt: interview.scheduled_at,
        duration: interview.duration_min,
        meetingLink: interview.meeting_link,
        phoneNumber: interview.phone_number,
        address: interview.address,
        icsDataUri: icsToDataUri(ics),
      });

      await sendAndLogEmail({
        to: seeker.email,
        subject: template.subject,
        html: template.html,
        text: template.text,
        template_key: "interview_confirmed",
        job_seeker_id: body.job_seeker_id,
        job_post_id: body.job_post_id,
        interview_id: interview.id,
      });
    }
  }

  if (hasDirect) {
    try {
      await enqueueBackgroundJob("INTERVIEW_PREP_READY", {
        job_seeker_id: body.job_seeker_id,
        job_post_id: body.job_post_id,
        interview_id: interview.id,
      });
    } catch (err) {
      console.error("Failed to enqueue interview prep job:", err);
    }
  }

  return Response.json({ success: true, interview });
}

export async function GET(request: Request) {
  const auth = requireOpsAuth(request.headers, request.url);
  let amId: string | null = null;

  if (!auth.ok) {
    const amResult = await getAccountManagerFromRequest(request.headers);
    if ("error" in amResult) {
      return Response.json({ success: false, error: amResult.error }, { status: 401 });
    }
    amId = amResult.accountManager.id;
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const upcoming = url.searchParams.get("upcoming");

  let query = supabaseServer
    .from("interviews")
    .select(
      "*, job_posts (title, company), job_seekers (full_name, email)"
    )
    .order("scheduled_at", { ascending: true, nullsFirst: false });

  if (amId) query = query.eq("account_manager_id", amId);
  if (status) query = query.eq("status", status);
  if (upcoming === "true") {
    query = query
      .in("status", ["pending_candidate", "confirmed"])
      .gte("scheduled_at", new Date().toISOString());
  }

  const { data: interviews, error } = await query;

  if (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }

  return Response.json({ success: true, interviews: interviews ?? [] });
}
