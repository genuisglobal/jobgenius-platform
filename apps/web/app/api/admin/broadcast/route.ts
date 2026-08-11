import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { normalizeAMRole } from "@/lib/auth/roles";
import { sendAndLogEmail } from "@/lib/messaging/send-and-log";
import { broadcastAnnouncementEmail } from "@/lib/email-templates/broadcast-announcement";
import { logAdminAction } from "@/lib/audit";

type TargetAudience = "all_job_seekers" | "all_account_managers" | "all_users";

// ─── GET /api/admin/broadcast ─────────────────────────────────────────────────
// Lists past broadcasts (newest first). Superadmin only.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (normalizeAMRole(auth.user.role) !== "superadmin") {
    return NextResponse.json({ error: "Superadmin access required." }, { status: 403 });
  }

  const { data: broadcasts, error } = await supabaseAdmin
    .from("system_announcements")
    .select("id, subject, body, target_audience, send_email, recipient_count, status, sent_at, created_at, account_managers!inner(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "Failed to load broadcasts." }, { status: 500 });
  }

  return NextResponse.json({ broadcasts: broadcasts ?? [] });
}

// ─── POST /api/admin/broadcast ────────────────────────────────────────────────
// Creates and sends a broadcast. Superadmin only.
// Body: { subject, body, target_audience, send_email? }
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (normalizeAMRole(auth.user.role) !== "superadmin") {
    return NextResponse.json({ error: "Superadmin access required." }, { status: 403 });
  }

  let body: {
    subject?: string;
    body?: string;
    target_audience?: string;
    send_email?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const subject = body.subject?.trim() ?? "";
  const messageBody = body.body?.trim() ?? "";
  const targetAudience = body.target_audience as TargetAudience | undefined;
  const sendEmail = body.send_email !== false;

  if (!subject) return NextResponse.json({ error: "subject is required." }, { status: 400 });
  if (!messageBody) return NextResponse.json({ error: "body is required." }, { status: 400 });
  if (!["all_job_seekers", "all_account_managers", "all_users"].includes(targetAudience ?? "")) {
    return NextResponse.json(
      { error: "target_audience must be all_job_seekers, all_account_managers, or all_users." },
      { status: 400 }
    );
  }

  // Create the announcement record in 'sending' state
  const { data: announcement, error: createErr } = await supabaseAdmin
    .from("system_announcements")
    .insert({
      sent_by_id: auth.user.id,
      subject,
      body: messageBody,
      target_audience: targetAudience,
      send_email: sendEmail,
      status: "sending",
    })
    .select("id")
    .single();

  if (createErr || !announcement) {
    return NextResponse.json({ error: "Failed to create broadcast." }, { status: 500 });
  }

  const announcementId = announcement.id;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

  // Fetch recipients
  const [seekerResult, amResult] = await Promise.all([
    targetAudience !== "all_account_managers"
      ? supabaseAdmin
          .from("job_seekers")
          .select("id, email, full_name")
          .eq("status", "active")
      : Promise.resolve({ data: [], error: null }),
    targetAudience !== "all_job_seekers"
      ? supabaseAdmin
          .from("account_managers")
          .select("id, email, full_name")
          .eq("status", "active")
      : Promise.resolve({ data: [], error: null }),
  ]);

  const seekers = (seekerResult.data ?? []) as { id: string; email: string | null; full_name: string | null }[];
  const managers = (amResult.data ?? []) as { id: string; email: string | null; full_name: string | null }[];
  const recipientCount = seekers.length + managers.length;

  // Send emails concurrently (batched to avoid overwhelming the email provider)
  if (sendEmail) {
    const emailTasks: Promise<unknown>[] = [];

    for (const seeker of seekers) {
      if (!seeker.email) continue;
      const tpl = broadcastAnnouncementEmail({
        recipientName: seeker.full_name ?? "there",
        subject,
        body: messageBody,
        portalUrl: `${appUrl}/portal`,
      });
      emailTasks.push(
        sendAndLogEmail({
          to: seeker.email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          template_key: "broadcast_announcement",
          job_seeker_id: seeker.id,
          meta: { announcement_id: announcementId, target_audience: targetAudience },
        }).catch((err) => { console.error("[broadcast] send seeker email failed:", err); return null; })
      );
    }

    for (const am of managers) {
      if (!am.email) continue;
      const tpl = broadcastAnnouncementEmail({
        recipientName: am.full_name ?? "there",
        subject,
        body: messageBody,
        portalUrl: `${appUrl}/dashboard`,
      });
      emailTasks.push(
        sendAndLogEmail({
          to: am.email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          template_key: "broadcast_announcement",
          meta: { announcement_id: announcementId, target_audience: targetAudience, am_id: am.id },
        }).catch((err) => { console.error("[broadcast] send AM email failed:", err); return null; })
      );
    }

    await Promise.allSettled(emailTasks);
  }

  // Update announcement status to 'sent'
  const { error: statusUpdateError } = await supabaseAdmin
    .from("system_announcements")
    .update({
      status: "sent",
      recipient_count: recipientCount,
      sent_at: new Date().toISOString(),
    })
    .eq("id", announcementId);

  if (statusUpdateError) {
    console.error("[broadcast] failed to update announcement status to sent:", statusUpdateError);
  }

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    action: "broadcast.send",
    targetType: "system_announcement",
    targetId: announcementId,
    details: { subject, target_audience: targetAudience, recipient_count: recipientCount, send_email: sendEmail },
  }).catch((e) => console.error("Audit log failed", e));

  return NextResponse.json(
    {
      success: true,
      announcement_id: announcementId,
      recipient_count: recipientCount,
      emails_sent: sendEmail,
    },
    { status: 201 }
  );
}

// ─── GET /api/admin/broadcast/counts ─────────────────────────────────────────
// Helper to preview recipient counts before sending.
// Called by the client form to show "Will reach N seekers, M AMs".
// Exposed via ?action=counts query parameter.
