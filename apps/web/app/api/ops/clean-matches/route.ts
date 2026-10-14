import { supabaseAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";
import { enforceOpsRateLimit } from "@/lib/rate-limit-presets";

const OPS_API_KEY = process.env.OPS_API_KEY;

// A run reaching one of these means the client already applied to that job.
const APPLIED_STATUSES = ["APPLIED", "COMPLETED", "SUBMITTED"];
// A job actively being worked right now — never remove its match mid-flight.
const ACTIVE_QUEUE_STATUSES = ["QUEUED", "READY", "RUNNING", "RETRYING"];

/**
 * POST /api/ops/clean-matches?max_age_days=7&dry_run=true
 *
 * Weekly client match cleaner. Removes (soft-archives) matched jobs older than
 * one week from each client's matched list. Before removing an APPLIED job's
 * match, the job is saved into the job bank (saved_jobs) so its assets — the
 * tailored resume and application record (both keyed by job_post_id) — remain
 * available for future reuse. Jobs that are actively in-flight are preserved.
 *
 * Auth: OPS_API_KEY via the x-ops-key header (cron-friendly), same as the
 * existing /api/ops/archive-stale-matches endpoint.
 */
export async function POST(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;

  const key = request.headers.get("x-ops-key") ?? "";
  if (!OPS_API_KEY || key !== OPS_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const maxAgeDays = parseInt(searchParams.get("max_age_days") ?? "7");
  const dryRun = searchParams.get("dry_run") === "true";
  const cutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString();

  // 1. Stale, still-visible matches.
  const { data: staleMatches, error: fetchErr } = await supabaseAdmin
    .from("job_match_scores")
    .select("id, job_post_id, job_seeker_id, created_at")
    .is("archived_at", null)
    .lt("created_at", cutoff)
    .limit(2000);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!staleMatches || staleMatches.length === 0) {
    return NextResponse.json({ cleaned: 0, message: "No matches older than the cutoff." });
  }

  const jobPostIds = Array.from(
    new Set(staleMatches.map((m) => m.job_post_id).filter(Boolean))
  ) as string[];
  const seekerIds = Array.from(
    new Set(staleMatches.map((m) => m.job_seeker_id).filter(Boolean))
  ) as string[];

  // 2. Which (seeker, job) pairs were applied to.
  const { data: appliedRuns } = await supabaseAdmin
    .from("application_runs")
    .select("job_seeker_id, job_post_id, status")
    .in("job_seeker_id", seekerIds)
    .in("job_post_id", jobPostIds)
    .in("status", APPLIED_STATUSES);
  const appliedPairs = new Set(
    (appliedRuns ?? []).map((r) => `${r.job_seeker_id}:${r.job_post_id}`)
  );

  // 3. Jobs actively in-flight (preserve their match).
  const { data: activeQueued } = await supabaseAdmin
    .from("application_queue")
    .select("job_post_id")
    .in("job_post_id", jobPostIds)
    .in("status", ACTIVE_QUEUE_STATUSES);
  const activeJobPostIds = new Set((activeQueued ?? []).map((q) => q.job_post_id));

  // 4. Removable = everything stale that isn't actively in-flight.
  const removable = staleMatches.filter((m) => !activeJobPostIds.has(m.job_post_id));
  const appliedRemovable = removable.filter((m) =>
    appliedPairs.has(`${m.job_seeker_id}:${m.job_post_id}`)
  );
  const preservedActive = staleMatches.length - removable.length;

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      max_age_days: maxAgeDays,
      would_remove: removable.length,
      applied_to_save: Array.from(new Set(appliedRemovable.map((m) => m.job_post_id))).length,
      preserved_active: preservedActive,
    });
  }

  // 5. Save applied jobs into the job bank so their assets survive the cleanup.
  const appliedJobPostIds = Array.from(
    new Set(appliedRemovable.map((m) => m.job_post_id))
  ) as string[];
  let savedForAssets = 0;
  if (appliedJobPostIds.length > 0) {
    const { data: posts } = await supabaseAdmin
      .from("job_posts")
      .select("title, company, location, url, description_text")
      .in("id", appliedJobPostIds);
    const rows = (posts ?? [])
      .filter((p) => p.url && p.title)
      .map((p) => ({
        title: p.title,
        company: p.company ?? null,
        location: p.location ?? null,
        description: p.description_text ?? null,
        url: p.url,
        source: "applied",
      }));
    if (rows.length > 0) {
      const { error: saveErr } = await supabaseAdmin
        .from("saved_jobs")
        .upsert(rows, { onConflict: "url" });
      if (saveErr) {
        console.error("clean-matches: saving applied jobs failed:", saveErr);
      } else {
        savedForAssets = rows.length;
      }
    }
  }

  // 6. Remove (soft-archive) the stale matches from the clients' lists.
  const nowIso = new Date().toISOString();
  const { error: updateErr } = await supabaseAdmin
    .from("job_match_scores")
    .update({
      archived_at: nowIso,
      archive_reason: `Weekly cleaner: match older than ${maxAgeDays} days`,
    })
    .in(
      "id",
      removable.map((m) => m.id)
    );

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    cleaned: removable.length,
    saved_for_assets: savedForAssets,
    preserved_active: preservedActive,
    max_age_days: maxAgeDays,
  });
}
