import { getOutreachAdapter } from "@/lib/email/adapter";
import { requireAMAccessToSeeker } from "@/lib/am-access";
import { assertOutreachConsent, getRecruiterOptOut } from "@/lib/outreach-consent";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  context: { params: { id: string } }
) {
  const draftId = context.params.id;
  if (!draftId) {
    return Response.json(
      { success: false, error: "Missing draft id." },
      { status: 400 }
    );
  }

  const { data: draft, error: draftError } = await supabaseServer
    .from("outreach_drafts")
    .select(
      "id, job_seeker_id, job_post_id, subject, body, status, outreach_contacts (email), job_seekers (email)"
    )
    .eq("id", draftId)
    .single();

  if (draftError || !draft) {
    return Response.json(
      { success: false, error: "Draft not found." },
      { status: 404 }
    );
  }

  const access = await requireAMAccessToSeeker(request.headers, draft.job_seeker_id);
  if (!access.ok) return access.response;

  const consentCheck = await assertOutreachConsent(draft.job_seeker_id);
  if (!consentCheck.ok) {
    return Response.json(
      { success: false, error: consentCheck.error },
      { status: 412 }
    );
  }

  const contact = Array.isArray(draft.outreach_contacts)
    ? draft.outreach_contacts[0]
    : draft.outreach_contacts;
  const jobSeeker = Array.isArray(draft.job_seekers)
    ? draft.job_seekers[0]
    : draft.job_seekers;

  if (!contact?.email) {
    return Response.json(
      { success: false, error: "Draft contact is missing an email address." },
      { status: 400 }
    );
  }

  if (!jobSeeker?.email) {
    return Response.json(
      { success: false, error: "Job seeker email is missing." },
      { status: 400 }
    );
  }

  const { data: existingRecruiter } = await supabaseServer
    .from("recruiters")
    .select("id")
    .eq("email", contact.email)
    .maybeSingle();

  if (existingRecruiter?.id) {
    const optOutStatus = await getRecruiterOptOut(existingRecruiter.id);
    if (optOutStatus.optedOut) {
      return Response.json(
        { success: false, error: "Recruiter opted out from outreach automation." },
        { status: 409 }
      );
    }
  }

  const { adapter: outreachAdapter, fromEmail, provider: outreachProvider } =
    await getOutreachAdapter(draft.job_seeker_id);

  const result = await outreachAdapter.sendEmail({
    from: fromEmail,
    to: [contact.email],
    subject: draft.subject ?? "",
    text: draft.body ?? "",
    replyTo: jobSeeker.email ?? undefined,
  });

  const nowIso = new Date().toISOString();

  if (!result.ok) {
    await supabaseServer.from("apply_outbox").insert({
      job_seeker_id: draft.job_seeker_id,
      job_post_id: draft.job_post_id,
      draft_id: draft.id,
      provider: result.provider,
      status: "FAILED",
      request_payload: {
        to: contact.email,
        subject: draft.subject ?? "",
      },
      response_payload: { detail: result.detail ?? null },
      updated_at: nowIso,
    });

    await supabaseServer
      .from("outreach_drafts")
      .update({ status: "FAILED", last_error: result.detail ?? "Send failed.", updated_at: nowIso })
      .eq("id", draft.id);

    return Response.json(
      { success: false, error: result.detail ?? "Send failed." },
      { status: 500 }
    );
  }

  await supabaseServer.from("apply_outbox").insert({
    job_seeker_id: draft.job_seeker_id,
    job_post_id: draft.job_post_id,
    draft_id: draft.id,
    provider: result.provider,
    status: "SENT",
    request_payload: {
      to: contact.email,
      subject: draft.subject ?? "",
    },
    response_payload: { message_id: result.provider_message_id ?? null },
    updated_at: nowIso,
    sent_at: nowIso,
  });

  await supabaseServer
    .from("outreach_drafts")
    .update({ status: "SENT", sent_at: nowIso, updated_at: nowIso, last_error: null })
    .eq("id", draft.id);

  return Response.json({ success: true, provider: result.provider, message_id: result.provider_message_id ?? null });
}
