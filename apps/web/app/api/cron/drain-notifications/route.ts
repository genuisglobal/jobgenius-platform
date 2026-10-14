import { supabaseAdmin } from "@/lib/auth";
import { resolveRecipientEmail } from "@/lib/notify";
import { sendAndLogEmail } from "@/lib/messaging/send-and-log";
import { createLogger } from "@/lib/logger";

const log = createLogger("cron.drain-notifications");
const BATCH_LIMIT = 20;

/**
 * GET /api/cron/drain-notifications
 *
 * Sends email/both notifications whose status is still 'pending'.
 * - Auth: x-vercel-cron header OR Authorization: Bearer CRON_SECRET.
 * - In_app rows skip this drain entirely (they're inserted as 'sent').
 * - Failures are recorded as status='failed' with the error captured;
 *   they are NOT retried automatically in PR-J (kept simple — a future
 *   PR adds retry/backoff once we have signal on failure modes).
 */

function isAuthorized(request: Request): boolean {
  if (request.headers.get("x-vercel-cron") === "1") return true;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth === `Bearer ${cronSecret}`) return true;
  }
  if (process.env.NODE_ENV !== "production") {
    const host = new URL(request.url).hostname;
    if (host === "localhost" || host === "127.0.0.1") return true;
  }
  return false;
}

function htmlBodyFor(subject: string, body: string | null, linkUrl: string | null): string {
  const safeBody = (body ?? "").replace(/\n/g, "<br/>");
  const cta = linkUrl
    ? `<p style="margin-top:24px;"><a href="${linkUrl}" style="display:inline-block;padding:10px 18px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Open</a></p>`
    : "";
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;color:#111827;max-width:560px;margin:0 auto;padding:24px;">
    <h2 style="font-size:18px;margin-bottom:12px;">${subject}</h2>
    <div style="font-size:14px;line-height:1.55;color:#374151;">${safeBody}</div>
    ${cta}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 12px;" />
    <p style="font-size:12px;color:#6b7280;">JobGenius — automated notification</p>
  </body></html>`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: pendingRaw, error } = await supabaseAdmin
    .from("notifications")
    .select("id, user_id, user_type, channel, category, subject, body, link_url")
    .eq("status", "pending")
    .in("channel", ["email", "both"])
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const pending = pendingRaw ?? [];
  if (pending.length === 0) {
    return Response.json({ ok: true, processed: 0, idle: true });
  }

  let sent = 0;
  let failed = 0;

  for (const row of pending) {
    const recipient = await resolveRecipientEmail(
      row.user_id as string,
      row.user_type as "am" | "job_seeker"
    );

    if (!recipient) {
      await supabaseAdmin
        .from("notifications")
        .update({
          status: "failed",
          error: "No recipient email on file.",
        })
        .eq("id", row.id);
      failed += 1;
      continue;
    }

    const result = await sendAndLogEmail({
      to: recipient,
      subject: row.subject ?? "JobGenius update",
      html: htmlBodyFor(
        row.subject ?? "JobGenius update",
        (row.body as string | null) ?? null,
        (row.link_url as string | null) ?? null
      ),
      text: (row.body as string | null) ?? row.subject ?? "JobGenius update",
      template_key: `notify:${row.category}`,
      meta: { notification_id: row.id, category: row.category },
    }).catch((err) => ({
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    }));

    if (result.ok) {
      await supabaseAdmin
        .from("notifications")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", row.id);
      sent += 1;
    } else {
      await supabaseAdmin
        .from("notifications")
        .update({
          status: "failed",
          error: ("detail" in result ? result.detail : null) ?? "send failed",
        })
        .eq("id", row.id);
      failed += 1;
      log.warn("notification send failed", { id: row.id, category: row.category });
    }
  }

  return Response.json({
    ok: true,
    processed: sent + failed,
    sent,
    failed,
  });
}
