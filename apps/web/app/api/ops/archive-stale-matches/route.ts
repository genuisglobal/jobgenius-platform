import { supabaseAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";
import { enforceOpsRateLimit } from "@/lib/rate-limit-presets";

const OPS_API_KEY = process.env.OPS_API_KEY;

/**
 * Archive stale job matches older than 30 days where the job
 * has no active queue items or runs.
 */
export async function POST(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;

  const key = request.headers.get("x-ops-key") ?? "";
  if (!OPS_API_KEY || key !== OPS_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const maxAgeDays = parseInt(searchParams.get("max_age_days") ?? "30");
  const dryRun = searchParams.get("dry_run") === "true";

  const cutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString();

  // Find stale matches: old, not archived, no active queue or runs
  const { data: staleMatches, error: fetchErr } = await supabaseAdmin
    .from("job_match_scores")
    .select("id, job_post_id, job_seeker_id, score, created_at")
    .is("archived_at", null)
    .lt("created_at", cutoff)
    .limit(500);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!staleMatches || staleMatches.length === 0) {
    return NextResponse.json({ archived: 0, message: "No stale matches found" });
  }

  // Check which have active queue items
  const jobPostIds = Array.from(new Set(staleMatches.map((m) => m.job_post_id)));
  const { data: activeQueued } = await supabaseAdmin
    .from("application_queue")
    .select("job_post_id")
    .in("job_post_id", jobPostIds)
    .in("status", ["QUEUED", "READY", "RUNNING"]);

  const activeJobPostIds = new Set((activeQueued ?? []).map((q) => q.job_post_id));

  const toArchive = staleMatches.filter((m) => !activeJobPostIds.has(m.job_post_id));

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      would_archive: toArchive.length,
      skipped_active: staleMatches.length - toArchive.length,
    });
  }

  if (toArchive.length === 0) {
    return NextResponse.json({ archived: 0, message: "All stale matches have active queue items" });
  }

  const archiveIds = toArchive.map((m) => m.id);
  const nowIso = new Date().toISOString();

  const { error: updateErr } = await supabaseAdmin
    .from("job_match_scores")
    .update({ archived_at: nowIso, archive_reason: `Stale: older than ${maxAgeDays} days` })
    .in("id", archiveIds);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Refresh materialized view for adapter health dashboard
  try {
    await supabaseAdmin.rpc("refresh_adapter_health_summary");
  } catch (e) {
    console.error("Failed to refresh adapter_health_summary:", e);
  }

  return NextResponse.json({
    archived: archiveIds.length,
    skipped_active: staleMatches.length - toArchive.length,
    adapter_health_refreshed: true,
  });
}
