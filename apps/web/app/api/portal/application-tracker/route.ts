import { requireJobSeeker, supabaseAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * Seeker-facing application progress tracker.
 * Returns real-time status of all applications with step details.
 */
export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status ?? 401 });
  }

  const seekerId = auth.user.id;

  // Get all queue items with runs and screenshots
  const { data: queueItems } = await supabaseAdmin
    .from("application_queue")
    .select(`
      id, status, category, created_at, updated_at,
      job_posts (id, title, company, location, url)
    `)
    .eq("job_seeker_id", seekerId)
    .order("created_at", { ascending: false })
    .limit(100);

  // Get all runs with step events
  const { data: runs } = await supabaseAdmin
    .from("application_runs")
    .select(`
      id, status, ats_type, current_step, last_error, attempt_count,
      created_at, updated_at,
      job_posts (id, title, company, url)
    `)
    .eq("job_seeker_id", seekerId)
    .order("updated_at", { ascending: false })
    .limit(100);

  // Get step events for active runs
  const activeRunIds = (runs ?? [])
    .filter((r) => ["RUNNING", "READY", "RETRYING"].includes(r.status))
    .map((r) => r.id);

  let stepEvents: { run_id: string; step: string; event_type: string; message: string; created_at: string }[] = [];
  if (activeRunIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("application_step_events")
      .select("run_id, step, event_type, message, created_at")
      .in("run_id", activeRunIds)
      .order("created_at", { ascending: false })
      .limit(200);
    stepEvents = (data ?? []) as typeof stepEvents;
  }

  // Get completion proof screenshots (successful runs only)
  const appliedRunIds = (runs ?? [])
    .filter((r) => r.status === "APPLIED")
    .map((r) => r.id);

  let proofScreenshots: { run_id: string; screenshot_path: string; step: string; created_at: string }[] = [];
  if (appliedRunIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("apply_run_screenshots")
      .select("run_id, screenshot_path, step, created_at")
      .in("run_id", appliedRunIds)
      .eq("reason", "confirmation")
      .limit(50);
    proofScreenshots = (data ?? []) as typeof proofScreenshots;
  }

  // Summary stats
  const totalApplied = (runs ?? []).filter((r) => r.status === "APPLIED").length;
  const totalFailed = (runs ?? []).filter((r) => r.status === "FAILED").length;
  const totalInProgress = (runs ?? []).filter((r) => ["RUNNING", "READY", "RETRYING"].includes(r.status)).length;
  const totalQueued = (queueItems ?? []).filter((q) => q.status === "QUEUED").length;

  // Build timeline per application
  const applications = (queueItems ?? []).map((qi) => {
    const job = qi.job_posts as unknown as { id: string; title: string; company: string; location: string; url: string } | null;
    const relatedRuns = (runs ?? []).filter(
      (r) => {
        const rJob = r.job_posts as unknown as { id: string } | null;
        return rJob?.id === job?.id;
      }
    );

    const latestRun = relatedRuns[0] ?? null;
    const events = latestRun
      ? stepEvents.filter((e) => e.run_id === latestRun.id)
      : [];
    const proof = latestRun
      ? proofScreenshots.find((s) => s.run_id === latestRun.id)
      : null;

    return {
      queue_id: qi.id,
      status: latestRun?.status ?? qi.status,
      category: qi.category,
      job,
      current_step: latestRun?.current_step ?? null,
      ats_type: latestRun?.ats_type ?? null,
      attempt_count: latestRun?.attempt_count ?? 0,
      timeline: events.map((e) => ({
        step: e.step,
        event: e.event_type,
        message: e.message,
        at: e.created_at,
      })),
      proof_screenshot: proof?.screenshot_path ?? null,
      queued_at: qi.created_at,
      updated_at: latestRun?.updated_at ?? qi.updated_at,
    };
  });

  return NextResponse.json({
    summary: {
      total: (queueItems ?? []).length,
      queued: totalQueued,
      in_progress: totalInProgress,
      applied: totalApplied,
      failed: totalFailed,
    },
    applications,
  });
}
