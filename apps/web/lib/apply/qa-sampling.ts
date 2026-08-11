// ============================================================
// QA sampling for auto-submitted applications (migration 106).
//
// Reviewing 100% of applications would recreate the manual work the
// automation exists to remove; reviewing 0% means quality is whatever
// the automation did. The policy:
//   * 100% of each seeker's FIRST 3 completed runs — new automation on
//     a new profile is where errors cluster, and early trust is when a
//     client decides whether the service is real, and
//   * QA_SAMPLE_RATE (default 5%) of everything else, seeded-random so
//     a rerun of the same nightly window picks the same runs
//     (idempotent alongside the unique(run_id) guard).
// ============================================================

import crypto from "crypto";

export type SampleCandidate = {
  run_id: string;
  job_seeker_id: string;
  /** 1-based position of this run among the seeker's completed runs. */
  seeker_run_number: number;
};

export type SampleDecision = {
  run_id: string;
  job_seeker_id: string;
  sampled_reason: "NEW_SEEKER_FIRST_RUNS" | "RANDOM_SAMPLE";
};

export const DEFAULT_SAMPLE_RATE = 0.05;
export const FIRST_RUNS_ALWAYS_SAMPLED = 3;

export function readSampleRate(): number {
  const raw = Number(process.env.QA_SAMPLE_RATE);
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) return DEFAULT_SAMPLE_RATE;
  return raw;
}

/**
 * Deterministic per-run coin flip: hash the run id into [0, 1). Reruns of
 * the same window make identical decisions, so a crashed nightly job can
 * simply run again.
 */
export function runHashFraction(runId: string): number {
  const digest = crypto.createHash("sha256").update(runId).digest();
  return digest.readUInt32BE(0) / 0x100000000;
}

/** Pure selection over a window of completed-run candidates. */
export function selectRunsForReview(
  candidates: SampleCandidate[],
  sampleRate: number = DEFAULT_SAMPLE_RATE
): SampleDecision[] {
  const decisions: SampleDecision[] = [];
  for (const candidate of candidates) {
    if (candidate.seeker_run_number <= FIRST_RUNS_ALWAYS_SAMPLED) {
      decisions.push({
        run_id: candidate.run_id,
        job_seeker_id: candidate.job_seeker_id,
        sampled_reason: "NEW_SEEKER_FIRST_RUNS",
      });
      continue;
    }
    if (runHashFraction(candidate.run_id) < sampleRate) {
      decisions.push({
        run_id: candidate.run_id,
        job_seeker_id: candidate.job_seeker_id,
        sampled_reason: "RANDOM_SAMPLE",
      });
    }
  }
  return decisions;
}

/**
 * Sample the last `windowHours` of COMPLETED runs into qa_reviews.
 * Idempotent: unique(run_id) + upsert-ignore means reruns add nothing.
 */
export async function sampleCompletedRuns(
  windowHours = 26 // daily cron + slack so a late run can't fall between windows
): Promise<{ scanned: number; sampled: number; firstRuns: number; random: number }> {
  const { supabaseServer } = await import("@/lib/supabase/server");

  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  const { data: recentRuns, error } = await supabaseServer
    .from("application_runs")
    .select("id, job_seeker_id, updated_at")
    .eq("status", "COMPLETED")
    .gte("updated_at", since)
    .order("updated_at", { ascending: true })
    .limit(1000);
  if (error || !recentRuns || recentRuns.length === 0) {
    return { scanned: 0, sampled: 0, firstRuns: 0, random: 0 };
  }

  // Rank each run among its seeker's completed runs (all-time), so "first 3"
  // means first three EVER, not first three of the window.
  const seekerIds = Array.from(new Set(recentRuns.map((r) => r.job_seeker_id as string)));
  const { data: allCompleted } = await supabaseServer
    .from("application_runs")
    .select("id, job_seeker_id, updated_at")
    .eq("status", "COMPLETED")
    .in("job_seeker_id", seekerIds)
    .order("updated_at", { ascending: true });

  const runNumber = new Map<string, number>();
  const counters = new Map<string, number>();
  for (const run of allCompleted ?? []) {
    const seeker = run.job_seeker_id as string;
    const n = (counters.get(seeker) ?? 0) + 1;
    counters.set(seeker, n);
    runNumber.set(run.id as string, n);
  }

  const candidates: SampleCandidate[] = recentRuns.map((run) => ({
    run_id: run.id as string,
    job_seeker_id: run.job_seeker_id as string,
    seeker_run_number: runNumber.get(run.id as string) ?? Number.MAX_SAFE_INTEGER,
  }));

  const decisions = selectRunsForReview(candidates, readSampleRate());
  if (decisions.length === 0) {
    return { scanned: candidates.length, sampled: 0, firstRuns: 0, random: 0 };
  }

  // upsert-ignore on run_id: already-sampled runs stay untouched.
  const { data: inserted } = await supabaseServer
    .from("qa_reviews")
    .upsert(
      decisions.map((d) => ({
        run_id: d.run_id,
        job_seeker_id: d.job_seeker_id,
        sampled_reason: d.sampled_reason,
        status: "PENDING",
      })),
      { onConflict: "run_id", ignoreDuplicates: true }
    )
    .select("id, sampled_reason");

  const rows = inserted ?? [];
  return {
    scanned: candidates.length,
    sampled: rows.length,
    firstRuns: rows.filter((r) => r.sampled_reason === "NEW_SEEKER_FIRST_RUNS").length,
    random: rows.filter((r) => r.sampled_reason === "RANDOM_SAMPLE").length,
  };
}
