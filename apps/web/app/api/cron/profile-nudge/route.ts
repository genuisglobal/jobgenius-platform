import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { profileCompletionNudgeEmail } from "@/lib/email-templates/profile-completion-nudge";
import { sendAndLogEmail } from "@/lib/messaging/send-and-log";

// GET /api/cron/profile-nudge
// Daily cron at 10:00 UTC — emails seekers with profile_completion < 80%
// who have not received a nudge email in the last 7 days.
export async function GET(req: NextRequest) {
  // Auth: CRON_SECRET or vercel cron header
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";

  if (!isVercelCron && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const portalUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.jobgenius.ai";
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Find active seekers with profile_completion < 80
  const { data: seekers, error } = await supabaseAdmin
    .from("job_seekers")
    .select("id, full_name, email, profile_completion")
    .eq("status", "active")
    .lt("profile_completion", 80)
    .not("email", "is", null);

  if (error || !seekers || seekers.length === 0) {
    const { error: cronLogError } = await supabaseAdmin.from("cron_runs").insert({
      job_name: "profile-nudge",
      triggered_by: "cron",
      status: "success",
      summary: { seekers_found: 0, nudges_sent: 0 },
    });

    if (cronLogError) {
      console.error("[cron:profile-nudge] failed to log cron run:", cronLogError);
    }
    return NextResponse.json({ sent: 0 });
  }

  // Filter: skip seekers emailed in last 7 days with this template
  const seekerIds = seekers.map((s) => s.id);
  const { data: recentLogs } = await supabaseAdmin
    .from("email_logs")
    .select("job_seeker_id")
    .in("job_seeker_id", seekerIds)
    .eq("template_key", "profile_completion_nudge")
    .gte("created_at", sevenDaysAgo);

  const recentlySent = new Set((recentLogs ?? []).map((r) => r.job_seeker_id));
  const toNudge = seekers.filter((s) => !recentlySent.has(s.id));

  let sent = 0;
  const errors: string[] = [];

  for (const seeker of toNudge) {
    if (!seeker.email) continue;
    try {
      const { subject, html, text } = profileCompletionNudgeEmail({
        seekerName: seeker.full_name ?? "there",
        completionPercent: seeker.profile_completion ?? 0,
        portalUrl,
      });

      const result = await sendAndLogEmail({
        to: seeker.email,
        subject,
        html,
        text,
        template_key: "profile_completion_nudge",
        job_seeker_id: seeker.id,
      });

      if (result.ok) sent++;
    } catch (e) {
      errors.push(`${seeker.id}: ${String(e)}`);
    }
  }

  const { error: cronLogError2 } = await supabaseAdmin.from("cron_runs").insert({
    job_name: "profile-nudge",
    triggered_by: "cron",
    status: errors.length > 0 ? "partial" : "success",
    summary: {
      seekers_found: seekers.length,
      eligible: toNudge.length,
      nudges_sent: sent,
      errors: errors.length > 0 ? errors : undefined,
    },
  });

  if (cronLogError2) {
    console.error("[cron:profile-nudge] failed to log cron run:", cronLogError2);
  }

  return NextResponse.json({ sent, eligible: toNudge.length, total_found: seekers.length });
}
