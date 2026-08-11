import { supabaseAdmin } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

// ============================================================
// Epsilon-greedy bandit on top of policy_experiments (migration 085).
//
// Usage:
//   const arm = await pickArm({
//     key: "retry:GREENHOUSE:REQUIRED_FIELDS",
//     arms: ["same", "skip_optional", "simplified_fields"],
//     runId, context: { attempt: 2 },
//   });
//   // ... do the work using `arm` ...
//   await recordOutcome({ trialId: arm.trialId, outcome: "success", reward: 1 });
//
// Behaviour:
//   - With probability epsilon (default 0.1) we EXPLORE — pick a random arm.
//   - Otherwise we EXPLOIT — pick the arm with the highest mean reward.
//   - Until each arm has been tried MIN_TRIALS_PER_ARM times, we keep exploring
//     so the empirical mean has any signal.
//   - pickArm always inserts a row (outcome=null) so the caller can record
//     the outcome later via the returned trialId.
// ============================================================

const log = createLogger("bandit");

const DEFAULT_EPSILON = 0.1;
const MIN_TRIALS_PER_ARM = 5;
const STATS_LOOKBACK_DAYS = 60;

export type BanditOutcome = "success" | "failure" | "partial";

export interface PickArmInput {
  /** Stable bandit key, e.g. "retry:GREENHOUSE:REQUIRED_FIELDS". */
  key: string;
  /** Candidate arms — must be non-empty and stable across calls. */
  arms: string[];
  /** Optional run linkage so we can reconcile outcomes by run later. */
  runId?: string | null;
  /** Free-form context recorded with the trial. */
  context?: Record<string, unknown>;
  /** 0..1 explore probability. Defaults to 0.1. */
  epsilon?: number;
}

export interface PickArmResult {
  arm: string;
  trialId: string | null;       // null on insert failure — caller's behaviour unchanged
  decision: "explore" | "exploit" | "cold_start";
  /** Arm stats at the time of the pick (for telemetry). */
  stats: Record<string, { trials: number; meanReward: number }>;
}

export interface RecordOutcomeInput {
  trialId: string;
  outcome: BanditOutcome;
  /** 0..1. Defaults: success=1, partial=0.5, failure=0. */
  reward?: number;
}

function rewardForOutcome(outcome: BanditOutcome, explicit?: number): number {
  if (typeof explicit === "number" && Number.isFinite(explicit)) {
    return Math.max(0, Math.min(1, explicit));
  }
  if (outcome === "success") return 1;
  if (outcome === "partial") return 0.5;
  return 0;
}

async function loadArmStats(
  key: string,
  arms: string[]
): Promise<Record<string, { trials: number; meanReward: number }>> {
  const stats: Record<string, { trials: number; meanReward: number }> = {};
  for (const arm of arms) {
    stats[arm] = { trials: 0, meanReward: 0 };
  }
  const since = new Date(Date.now() - STATS_LOOKBACK_DAYS * 86400000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("policy_experiments")
    .select("arm, reward")
    .eq("key", key)
    .gte("trial_at", since)
    .not("outcome", "is", null);
  if (error) {
    log.warn("loadArmStats failed", { key, error: error.message });
    return stats;
  }
  const sums: Record<string, { n: number; total: number }> = {};
  for (const row of data ?? []) {
    const arm = row.arm as string;
    if (!sums[arm]) sums[arm] = { n: 0, total: 0 };
    sums[arm].n += 1;
    sums[arm].total += Number(row.reward) || 0;
  }
  for (const arm of arms) {
    const s = sums[arm];
    if (s && s.n > 0) {
      stats[arm] = { trials: s.n, meanReward: s.total / s.n };
    }
  }
  return stats;
}

export async function pickArm(input: PickArmInput): Promise<PickArmResult> {
  const arms = (input.arms ?? []).filter((a) => typeof a === "string" && a.length > 0);
  if (arms.length === 0) {
    throw new Error("pickArm requires at least one arm");
  }
  const epsilon =
    typeof input.epsilon === "number" && input.epsilon >= 0 && input.epsilon <= 1
      ? input.epsilon
      : DEFAULT_EPSILON;

  const stats = await loadArmStats(input.key, arms);

  // Cold-start: any arm with fewer than MIN_TRIALS_PER_ARM gets picked first.
  const undertested = arms.filter((a) => stats[a].trials < MIN_TRIALS_PER_ARM);

  let chosen: string;
  let decision: "explore" | "exploit" | "cold_start";

  if (undertested.length > 0) {
    chosen = undertested[Math.floor(Math.random() * undertested.length)];
    decision = "cold_start";
  } else if (Math.random() < epsilon) {
    chosen = arms[Math.floor(Math.random() * arms.length)];
    decision = "explore";
  } else {
    // Greedy on mean reward; tiebreak on more trials.
    const sorted = [...arms].sort((a, b) => {
      const ra = stats[a].meanReward;
      const rb = stats[b].meanReward;
      if (rb !== ra) return rb - ra;
      return stats[b].trials - stats[a].trials;
    });
    chosen = sorted[0];
    decision = "exploit";
  }

  let trialId: string | null = null;
  try {
    const { data, error } = await supabaseAdmin
      .from("policy_experiments")
      .insert({
        key: input.key,
        arm: chosen,
        run_id: input.runId ?? null,
        context: {
          decision,
          stats_at_pick: stats,
          ...(input.context ?? {}),
        },
      })
      .select("id")
      .single();
    if (error) {
      log.warn("pickArm insert failed", { key: input.key, error: error.message });
    } else if (data) {
      trialId = data.id as string;
    }
  } catch (err) {
    log.warn("pickArm insert threw", {
      key: input.key,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { arm: chosen, trialId, decision, stats };
}

export async function recordOutcome(input: RecordOutcomeInput): Promise<boolean> {
  if (!input.trialId) return false;
  const reward = rewardForOutcome(input.outcome, input.reward);
  try {
    const { error } = await supabaseAdmin
      .from("policy_experiments")
      .update({
        outcome: input.outcome,
        reward,
        decided_at: new Date().toISOString(),
      })
      .eq("id", input.trialId)
      .is("outcome", null);
    if (error) {
      log.warn("recordOutcome failed", { trialId: input.trialId, error: error.message });
      return false;
    }
    return true;
  } catch (err) {
    log.warn("recordOutcome threw", {
      trialId: input.trialId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Find a recent pending trial for a run (used by apply/complete +
 * apply/fail to close the loop without callers having to thread the
 * trialId through their state).
 */
export async function findLatestPendingTrialForRun(
  runId: string,
  keyPrefix?: string
): Promise<{ trialId: string; key: string; arm: string } | null> {
  let query = supabaseAdmin
    .from("policy_experiments")
    .select("id, key, arm")
    .eq("run_id", runId)
    .is("outcome", null)
    .order("trial_at", { ascending: false })
    .limit(1);
  if (keyPrefix) {
    query = query.like("key", `${keyPrefix}%`);
  }
  const { data } = await query.maybeSingle();
  if (!data) return null;
  return {
    trialId: data.id as string,
    key: data.key as string,
    arm: data.arm as string,
  };
}

/**
 * Stable retry-bandit key for an (ats, error_class) pair. Used by
 * apply/retry. Centralized so apply/complete and apply/fail can rebuild
 * the same key if needed.
 */
export function retryBanditKey(atsType: string | null, errorClass: string | null): string {
  const ats = (atsType ?? "UNKNOWN").toUpperCase();
  const klass = (errorClass ?? "GENERIC").toUpperCase();
  return `retry:${ats}:${klass}`;
}
