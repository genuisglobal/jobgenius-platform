import { recordRecruiterOptOut } from "@/lib/outreach-consent";
import { scoreReplySentiment, sentimentLabel } from "@/lib/outreach-intelligence";
import { canTransitionOutreachState, type OutreachMessageState } from "@/lib/outreach-state";
import { classifyReply, generateDraftReply } from "@/lib/outreach-reply-classifier";
import { detectSchedulingLink } from "@/lib/interview-link-detector";
import { supabaseServer } from "@/lib/supabase/server";
import { verifySvixSignature } from "@/lib/webhooks/svix-signature";

/**
 * Verify the inbound Resend webhook.
 *
 * Preferred: Svix HMAC signature (svix-id / svix-timestamp / svix-signature
 * headers) verified against OUTREACH_WEBHOOK_SECRET. Resend signs webhooks
 * via Svix; this is the standard.
 *
 * Legacy: a plain string compare against OUTREACH_WEBHOOK_LEGACY_SECRET
 * for the x-webhook-secret header. Kept ONLY during transition; set the
 * env var to remove the legacy path entirely.
 *
 * If neither env var is set we allow the request (matching prior behaviour)
 * but log a warning so this never silently degrades in production.
 */
async function authenticateResendWebhook(
  request: Request
): Promise<{ ok: true; rawBody: string } | { ok: false; status: number; reason: string }> {
  const rawBody = await request.text();

  const svixSecret = process.env.OUTREACH_WEBHOOK_SECRET;
  if (svixSecret) {
    const result = verifySvixSignature({
      rawBody,
      headers: request.headers,
      secret: svixSecret,
    });
    if (result.valid) {
      return { ok: true, rawBody };
    }
    // Fall through to legacy only if explicitly enabled.
  }

  const legacySecret = process.env.OUTREACH_WEBHOOK_LEGACY_SECRET;
  if (legacySecret) {
    const provided = request.headers.get("x-webhook-secret");
    if (provided && provided === legacySecret) {
      return { ok: true, rawBody };
    }
  }

  if (!svixSecret && !legacySecret) {
    console.warn(
      "[resend-webhook] Neither OUTREACH_WEBHOOK_SECRET nor OUTREACH_WEBHOOK_LEGACY_SECRET set; accepting unauthenticated webhook."
    );
    return { ok: true, rawBody };
  }

  return { ok: false, status: 401, reason: "Unauthorized." };
}

function resolveMessageId(payload: Record<string, unknown>) {
  const data = (payload.data ?? payload) as Record<string, unknown>;
  return (
    (data?.email_id as string | undefined) ??
    (data?.message_id as string | undefined) ??
    (data?.id as string | undefined) ??
    null
  );
}

function mapStatus(type?: string | null): OutreachMessageState | null {
  const normalized = (type ?? "").toLowerCase();
  if (normalized.includes("delivered")) return "DELIVERED";
  if (normalized.includes("opened")) return "OPENED";
  if (normalized.includes("bounced")) return "BOUNCED";
  if (normalized.includes("replied")) return "REPLIED";
  if (normalized.includes("complain")) return "OPTED_OUT";
  if (normalized.includes("spam")) return "OPTED_OUT";
  if (normalized.includes("unsubscribe")) return "OPTED_OUT";
  if (normalized.includes("opt_out")) return "OPTED_OUT";
  return null;
}

function extractReplyText(payload: Record<string, unknown>) {
  const data = (payload.data ?? payload) as Record<string, unknown>;
  const reply = data.reply as Record<string, unknown> | undefined;

  const candidates = [
    reply?.text,
    data.reply_text,
    data.text,
    data.body,
    payload.reply_text,
    payload.text,
    payload.body,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

export async function POST(request: Request) {
  const auth = await authenticateResendWebhook(request);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.reason }, { status: auth.status });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(auth.rawBody) as Record<string, unknown>;
  } catch {
    return Response.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const messageId = resolveMessageId(payload);
  if (!messageId) {
    return Response.json({ success: false, error: "Missing message id." }, { status: 400 });
  }

  const eventType = String(payload.type ?? payload.event ?? "");
  const nextStatus = mapStatus(eventType);
  if (!nextStatus) {
    return Response.json({ success: true, ignored: true });
  }

  const { data: message, error: messageError } = await supabaseServer
    .from("outreach_messages")
    .select("id, recruiter_thread_id, status, to_email, subject")
    .eq("provider_message_id", messageId)
    .maybeSingle();

  if (messageError || !message) {
    return Response.json({ success: true, ignored: true });
  }

  if (!canTransitionOutreachState(message.status, nextStatus)) {
    return Response.json({
      success: true,
      ignored: true,
      detail: `Transition ${message.status} -> ${nextStatus} is not allowed.`,
    });
  }

  const nowIso = new Date().toISOString();
  const updates: Record<string, unknown> = {
    status: nextStatus,
    meta: payload,
    updated_at: nowIso,
  };

  if (nextStatus === "OPENED") updates.opened_at = nowIso;
  if (nextStatus === "BOUNCED") updates.bounced_at = nowIso;
  if (nextStatus === "REPLIED") updates.replied_at = nowIso;

  await supabaseServer.from("outreach_messages").update(updates).eq("id", message.id);

  const { data: thread } = await supabaseServer
    .from("recruiter_threads")
    .select("id, recruiter_id, job_seeker_id")
    .eq("id", message.recruiter_thread_id)
    .maybeSingle();

  if (!thread?.id || !thread.recruiter_id || !thread.job_seeker_id) {
    return Response.json({ success: true });
  }

  if (nextStatus === "BOUNCED") {
    await supabaseServer
      .from("recruiter_threads")
      .update({
        thread_status: "CLOSED",
        last_message_direction: "OUTBOUND",
        close_reason: "BOUNCED",
        closed_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", thread.id);

    await supabaseServer
      .from("recruiters")
      .update({
        status: "CLOSED",
        updated_at: nowIso,
      })
      .eq("id", thread.recruiter_id);

    await supabaseServer.from("attention_items").insert({
      queue_id: null,
      status: "OPEN",
      reason: "OUTREACH_BOUNCE",
    });
  }

  if (nextStatus === "REPLIED") {
    const replyText = extractReplyText(payload);
    const replySentimentScore = scoreReplySentiment(replyText);
    const label = sentimentLabel(replySentimentScore);

    await supabaseServer
      .from("recruiter_threads")
      .update({
        thread_status: "ACTIVE",
        last_message_direction: "INBOUND",
        last_reply_at: nowIso,
        reply_sentiment_score: replySentimentScore,
        updated_at: nowIso,
      })
      .eq("id", thread.id);

    await supabaseServer
      .from("recruiters")
      .update({
        status: replySentimentScore >= 20 ? "ENGAGED" : "CONTACTED",
        updated_at: nowIso,
      })
      .eq("id", thread.recruiter_id);

    await supabaseServer.from("outreach_plans").upsert(
      {
        recruiter_thread_id: thread.id,
        recruiter_id: thread.recruiter_id,
        job_seeker_id: thread.job_seeker_id,
        preferred_tone: "CONCISE",
        company_signal: null,
        personalization: {
          reply_sentiment_label: label,
          reply_excerpt: replyText ? replyText.slice(0, 200) : null,
        },
        ghosting_risk_score: 0,
        next_action: "AM_HANDOFF",
        plan_version: "v1",
        generated_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "recruiter_thread_id" }
    );

    // Classify reply and generate AI draft response
    const replyClassification = classifyReply(message.subject ?? "", replyText ?? "");
    const schedulingLink = detectSchedulingLink(replyText ?? "");
    const { data: seeker } = await supabaseServer
      .from("job_seekers")
      .select("full_name")
      .eq("id", thread.job_seeker_id)
      .single();

    const { data: recruiter } = await supabaseServer
      .from("recruiters")
      .select("name, company")
      .eq("id", thread.recruiter_id)
      .single();

    const aiDraft = generateDraftReply({
      classification: replyClassification,
      seekerName: seeker?.full_name ?? "the candidate",
      company: recruiter?.company ?? "",
      recruiterName: recruiter?.name ?? "there",
    });

    // Update the inbound message with classification and draft
    await supabaseServer
      .from("outreach_messages")
      .update({
        reply_classification: replyClassification,
        ai_draft_reply: aiDraft,
        ai_draft_status: aiDraft ? "generated" : "none",
        detected_scheduling_link: schedulingLink?.url ?? null,
        detected_scheduling_provider: schedulingLink?.provider ?? null,
        scheduling_link_status: schedulingLink ? "PENDING" : null,
      })
      .eq("id", message.id);

    if (replySentimentScore <= -20) {
      await supabaseServer.from("attention_items").insert({
        queue_id: null,
        status: "OPEN",
        reason: "OUTREACH_NEGATIVE_REPLY",
      });
    }
  }

  if (nextStatus === "OPTED_OUT") {
    await recordRecruiterOptOut({
      recruiterId: thread.recruiter_id,
      recruiterThreadId: thread.id,
      email: message.to_email,
      reason: String(payload.type ?? payload.event ?? "opt_out"),
      source: "resend_webhook",
    });

    await supabaseServer
      .from("recruiter_threads")
      .update({
        thread_status: "CLOSED",
        close_reason: "OPT_OUT",
        closed_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", thread.id);

    await supabaseServer
      .from("recruiters")
      .update({
        status: "CLOSED",
        updated_at: nowIso,
      })
      .eq("id", thread.recruiter_id);

    await supabaseServer
      .from("outreach_messages")
      .update({
        status: "OPTED_OUT",
        updated_at: nowIso,
      })
      .eq("recruiter_thread_id", thread.id)
      .in("status", ["QUEUED", "SENT", "DELIVERED", "OPENED", "FOLLOWUP_DUE"]);
  }

  return Response.json({ success: true });
}
