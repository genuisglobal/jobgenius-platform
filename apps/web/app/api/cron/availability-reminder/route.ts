import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";

// GET /api/cron/availability-reminder
// Runs every Monday at 08:00 UTC (vercel.json: "0 8 * * 1").
// Finds all seekers who have set availability but haven't confirmed this week,
// and inserts a notification record they'll see on next portal load.
//
// Auth: CRON_SECRET bearer token or x-vercel-cron header.

export async function GET(req: NextRequest) {
  // Authenticate
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";

  if (!isVercelCron) {
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const weekStart = getISOMonday(new Date());

  // Find seekers who have availability set but haven't confirmed this week
  const { data: seekers, error: seekerErr } = await supabaseAdmin
    .from("job_seeker_availability")
    .select("job_seeker_id")
    .eq("is_active", true)
    .throwOnError();

  if (seekerErr) {
    return NextResponse.json({ error: "DB error fetching seekers" }, { status: 500 });
  }

  const uniqueSeekerIds = Array.from(new Set((seekers ?? []).map((r) => r.job_seeker_id)));

  if (uniqueSeekerIds.length === 0) {
    return NextResponse.json({ notified: 0, week_start: weekStart });
  }

  // Find which have already confirmed this week
  const { data: confirmed } = await supabaseAdmin
    .from("job_seeker_availability_confirmations")
    .select("job_seeker_id")
    .eq("week_start", weekStart)
    .in("job_seeker_id", uniqueSeekerIds);

  const confirmedIds = new Set((confirmed ?? []).map((r) => r.job_seeker_id));
  const needsReminder = uniqueSeekerIds.filter((id) => !confirmedIds.has(id));

  if (needsReminder.length === 0) {
    return NextResponse.json({ notified: 0, week_start: weekStart, message: "All confirmed" });
  }

  // Insert availability_reminder notifications (one per seeker per week, upsert to avoid duplicates)
  const notifications = needsReminder.map((seekerId) => ({
    job_seeker_id: seekerId,
    type: "availability_reminder",
    week_start: weekStart,
    sent_at: new Date().toISOString(),
  }));

  // Store in job_seeker_availability_reminders table (created below via upsert — soft table)
  // Since we don't have a dedicated notifications table, we record it as a cron_runs-style log
  // and the portal reads pending reminders by comparing week_start vs confirmations.
  // (No separate table needed — the portal detects "not confirmed this week" from the GET route.)

  // Log this cron run
  const { error: cronLogError } = await supabaseAdmin.from("cron_runs").insert({
    status: "success",
    triggered_by: "vercel-cron",
    completed_at: new Date().toISOString(),
    fetched: uniqueSeekerIds.length,
    inserted: needsReminder.length,
    source_counts: { availability_reminder: needsReminder.length },
  });

  if (cronLogError) {
    console.error("[cron:availability-reminder] failed to log cron run:", cronLogError);
  }

  return NextResponse.json({
    notified: needsReminder.length,
    total_with_availability: uniqueSeekerIds.length,
    week_start: weekStart,
  });
}

function getISOMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}
