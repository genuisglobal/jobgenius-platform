import { supabaseAdmin } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

// ============================================================
// Learned ranker (ranker_models + match_features, migration 090).
//
// Logistic-regression on the heuristic's 7 component scores.
// Pure Node (no external ML deps) — gradient descent at training,
// sigmoid at inference. Designed for offline batch training of a
// few hundred to ~10k labelled rows; per-call inference is O(features).
//
// Phase 4 PR-Y stands up the loop:
//   - recordMatchFeatures()  → snapshot at match time
//   - updateMatchOutcome()   → stamp realised outcome
//   - trainLogisticRegression() → fit a new model from labelled data
//   - applyLearnedScore()    → run inference with the active model
//
// PR-Y.2 (future) flips live ranking. For now applyLearnedScore is
// for shadow logging + admin "what would have happened" analysis.
// ============================================================

const log = createLogger("learned-ranker");

export const FEATURE_KEYS = [
  "skills",
  "title",
  "experience",
  "salary",
  "location",
  "company_fit",
  "penalties",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type MatchFeatures = Record<FeatureKey, number>;

export interface RankerWeights {
  intercept: number;
  skills: number;
  title: number;
  experience: number;
  salary: number;
  location: number;
  company_fit: number;
  penalties: number;
}

export interface RankerModel {
  id: string;
  family: string;
  version: number;
  weights: RankerWeights;
  status: "pending" | "active" | "archived" | "rolled_back";
  metrics: Record<string, unknown>;
  trainingSize: number | null;
  promotedAt: string | null;
  createdAt: string;
}

export type MatchOutcome = "applied" | "interview" | "offer" | "rejection" | "ghosted";

// ─── Math primitives ───────────────────────────────────────

function sigmoid(z: number): number {
  // Clamp to avoid Infinity in exp(-z)
  const clamped = Math.max(-50, Math.min(50, z));
  return 1 / (1 + Math.exp(-clamped));
}

function dotPlusBias(weights: RankerWeights, x: MatchFeatures): number {
  return (
    weights.intercept +
    weights.skills * x.skills +
    weights.title * x.title +
    weights.experience * x.experience +
    weights.salary * x.salary +
    weights.location * x.location +
    weights.company_fit * x.company_fit +
    weights.penalties * x.penalties
  );
}

/** Run inference with the given weights. Returns probability 0..1. */
export function applyLearnedScore(
  weights: RankerWeights,
  features: MatchFeatures
): number {
  return sigmoid(dotPlusBias(weights, features));
}

/**
 * Blend the learned score into the heuristic.
 *   final = heuristic * (1 - alpha) + (learnedScore * 100) * alpha
 *
 * alpha=0 returns the heuristic untouched (default behaviour).
 * alpha=1 means pure learned. Caller passes alpha; production reads
 * RANKER_BLEND_ALPHA from env at the call site.
 */
export function blendScore(args: {
  heuristic: number;
  features: MatchFeatures;
  weights: RankerWeights;
  alpha: number;
}): number {
  const a = Math.max(0, Math.min(1, args.alpha));
  if (a === 0) return args.heuristic;
  const learnedPct = applyLearnedScore(args.weights, args.features) * 100;
  return Math.max(0, Math.min(100, args.heuristic * (1 - a) + learnedPct * a));
}

/**
 * Read the env-tunable blend alpha. Returns 0 when unset/invalid so
 * shipping the wiring without setting RANKER_BLEND_ALPHA is a no-op.
 */
export function readBlendAlpha(): number {
  const raw = Number(process.env.RANKER_BLEND_ALPHA);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(1, raw));
}

// ─── Cache the active model in-process ─────────────────────

const ACTIVE_MODEL_TTL_MS = 5 * 60 * 1000;
let cachedActive: { model: RankerModel | null; loadedAt: number } | null = null;

export function invalidateActiveModelCache(): void {
  cachedActive = null;
}

interface RankerModelRow {
  id: string;
  family: string;
  version: number;
  weights: RankerWeights;
  status: RankerModel["status"];
  metrics: Record<string, unknown> | null;
  training_size: number | null;
  promoted_at: string | null;
  created_at: string;
}

function rowToModel(row: RankerModelRow): RankerModel {
  return {
    id: row.id,
    family: row.family,
    version: row.version,
    weights: row.weights,
    status: row.status,
    metrics: row.metrics ?? {},
    trainingSize: row.training_size,
    promotedAt: row.promoted_at,
    createdAt: row.created_at,
  };
}

export async function getActiveModel(
  family = "logistic_regression"
): Promise<RankerModel | null> {
  if (cachedActive && Date.now() - cachedActive.loadedAt < ACTIVE_MODEL_TTL_MS) {
    return cachedActive.model;
  }
  const { data, error } = await supabaseAdmin
    .from("ranker_models")
    .select(
      "id, family, version, weights, status, metrics, training_size, promoted_at, created_at"
    )
    .eq("family", family)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    log.warn("getActiveModel failed", { error: error.message });
    return cachedActive?.model ?? null;
  }
  const model = data ? rowToModel(data as RankerModelRow) : null;
  cachedActive = { model, loadedAt: Date.now() };
  return model;
}

// ─── Feature capture ───────────────────────────────────────

function clamp01(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeFeatures(input: Partial<Record<FeatureKey, number>>): MatchFeatures {
  return {
    skills: clamp01(input.skills),
    title: clamp01(input.title),
    experience: clamp01(input.experience),
    salary: clamp01(input.salary),
    location: clamp01(input.location),
    company_fit: clamp01(input.company_fit),
    penalties: clamp01(input.penalties),
  };
}

// ─── Helpers to translate scorer breakdowns into features ──

export interface ScoringWeightsShape {
  skills: number;
  title: number;
  experience: number;
  salary: number;
  location: number;
  company_fit: number;
  max_penalty: number;
}

export interface ComponentScoreShape {
  score: number;
}

export interface MatchBreakdownShape {
  skills: ComponentScoreShape;
  title: ComponentScoreShape;
  experience: ComponentScoreShape;
  salary: ComponentScoreShape;
  location: ComponentScoreShape;
  company_fit: ComponentScoreShape;
  penalties: ComponentScoreShape;
}

const DEFAULT_SCORING_WEIGHTS: ScoringWeightsShape = {
  skills: 35,
  title: 20,
  experience: 10,
  salary: 10,
  location: 15,
  company_fit: 10,
  max_penalty: 15,
};

/**
 * Normalize scorer component scores into 0..1 ranker features.
 * Pass the same weights given to computeMatchScore; defaults assumed
 * if omitted. `penalties` is flipped to absolute (higher = worse).
 */
export function featuresFromBreakdown(
  breakdown: MatchBreakdownShape,
  weights: ScoringWeightsShape = DEFAULT_SCORING_WEIGHTS
): MatchFeatures {
  const safe = (raw: number, cap: number) => {
    if (cap <= 0) return 0;
    return clamp01(raw / cap);
  };
  return {
    skills: safe(breakdown.skills.score, weights.skills),
    title: safe(breakdown.title.score, weights.title),
    experience: safe(breakdown.experience.score, weights.experience),
    salary: safe(breakdown.salary.score, weights.salary),
    location: safe(breakdown.location.score, weights.location),
    company_fit: safe(breakdown.company_fit.score, weights.company_fit),
    penalties: safe(Math.abs(breakdown.penalties.score), weights.max_penalty),
  };
}

export interface RecordMatchFeaturesInput {
  jobSeekerId: string;
  jobPostId: string;
  matchId?: string | null;
  heuristicScore?: number | null;
  features: Partial<Record<FeatureKey, number>>;
}

/**
 * Upsert per-(seeker, job_post) features. Outcome is null on insert and
 * gets stamped later via updateMatchOutcome().
 */
export async function recordMatchFeatures(
  input: RecordMatchFeaturesInput
): Promise<void> {
  try {
    const normalized = normalizeFeatures(input.features);
    const { error } = await supabaseAdmin
      .from("match_features")
      .upsert(
        {
          job_seeker_id: input.jobSeekerId,
          job_post_id: input.jobPostId,
          match_id: input.matchId ?? null,
          heuristic_score:
            typeof input.heuristicScore === "number" ? input.heuristicScore : null,
          features: normalized,
        },
        {
          onConflict: "job_seeker_id,job_post_id",
          ignoreDuplicates: false,
        }
      );
    if (error) {
      log.warn("recordMatchFeatures insert failed", { error: error.message });
    }
  } catch (err) {
    log.warn("recordMatchFeatures threw", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function updateMatchOutcome(args: {
  jobSeekerId: string;
  jobPostId: string;
  outcome: MatchOutcome;
}): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from("match_features")
      .update({
        outcome: args.outcome,
        outcome_at: new Date().toISOString(),
      })
      .eq("job_seeker_id", args.jobSeekerId)
      .eq("job_post_id", args.jobPostId);
    if (error) {
      log.warn("updateMatchOutcome failed", { error: error.message });
    }
  } catch (err) {
    log.warn("updateMatchOutcome threw", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Trainer ───────────────────────────────────────────────

// Outcome → label. Ambiguous outcomes ('applied' alone) are skipped at training time.
function outcomeToLabel(outcome: string | null): 1 | 0 | null {
  if (outcome === "interview" || outcome === "offer") return 1;
  if (outcome === "rejection" || outcome === "ghosted") return 0;
  return null;
}

export interface TrainingExample {
  features: MatchFeatures;
  label: 0 | 1;
}

export interface TrainOptions {
  epochs?: number;
  learningRate?: number;
  l2?: number;          // L2 regularization (ridge)
  holdoutFraction?: number;
}

export interface TrainResult {
  weights: RankerWeights;
  trainingSize: number;
  positive: number;
  negative: number;
  metrics: {
    log_loss: number;
    accuracy: number;
    holdout_accuracy: number;
    auc_approx: number;
  };
}

function shuffle<T>(arr: T[], seed = 42): T[] {
  // Deterministic shuffle for reproducible runs.
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i -= 1) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function logLossOn(examples: TrainingExample[], w: RankerWeights): number {
  if (examples.length === 0) return 0;
  let total = 0;
  for (const ex of examples) {
    const p = sigmoid(dotPlusBias(w, ex.features));
    const eps = 1e-9;
    const pp = Math.max(eps, Math.min(1 - eps, p));
    total += ex.label === 1 ? -Math.log(pp) : -Math.log(1 - pp);
  }
  return total / examples.length;
}

function accuracyOn(examples: TrainingExample[], w: RankerWeights, threshold = 0.5): number {
  if (examples.length === 0) return 0;
  let correct = 0;
  for (const ex of examples) {
    const p = sigmoid(dotPlusBias(w, ex.features));
    const pred = p >= threshold ? 1 : 0;
    if (pred === ex.label) correct += 1;
  }
  return correct / examples.length;
}

function rocAuc(examples: TrainingExample[], w: RankerWeights): number {
  // Pairwise approximation: probability a random positive scores higher
  // than a random negative.
  const positives: number[] = [];
  const negatives: number[] = [];
  for (const ex of examples) {
    const p = sigmoid(dotPlusBias(w, ex.features));
    if (ex.label === 1) positives.push(p);
    else negatives.push(p);
  }
  if (positives.length === 0 || negatives.length === 0) return 0.5;
  let wins = 0;
  let total = 0;
  for (const p of positives) {
    for (const n of negatives) {
      total += 1;
      if (p > n) wins += 1;
      else if (p === n) wins += 0.5;
    }
  }
  return total === 0 ? 0.5 : wins / total;
}

/**
 * Plain mini-batch gradient descent. No external ML libraries.
 * Returns the fit weights + headline metrics.
 */
export function trainLogisticRegression(
  examples: TrainingExample[],
  options: TrainOptions = {}
): TrainResult {
  const epochs = Math.max(1, options.epochs ?? 200);
  const lr = Math.max(0.001, options.learningRate ?? 0.1);
  const l2 = Math.max(0, options.l2 ?? 0.001);
  const holdoutFraction = Math.max(0, Math.min(0.5, options.holdoutFraction ?? 0.2));

  // Initial weights (small random — deterministic via seed).
  let w: RankerWeights = {
    intercept: 0,
    skills: 0,
    title: 0,
    experience: 0,
    salary: 0,
    location: 0,
    company_fit: 0,
    penalties: 0,
  };

  const shuffled = shuffle(examples);
  const holdoutCount = Math.floor(shuffled.length * holdoutFraction);
  const holdout = shuffled.slice(0, holdoutCount);
  const train = shuffled.slice(holdoutCount);

  // Gradient descent.
  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const grad: RankerWeights = {
      intercept: 0,
      skills: 0,
      title: 0,
      experience: 0,
      salary: 0,
      location: 0,
      company_fit: 0,
      penalties: 0,
    };

    for (const ex of train) {
      const p = sigmoid(dotPlusBias(w, ex.features));
      const err = p - ex.label;
      grad.intercept += err;
      grad.skills += err * ex.features.skills;
      grad.title += err * ex.features.title;
      grad.experience += err * ex.features.experience;
      grad.salary += err * ex.features.salary;
      grad.location += err * ex.features.location;
      grad.company_fit += err * ex.features.company_fit;
      grad.penalties += err * ex.features.penalties;
    }

    const n = Math.max(1, train.length);
    // Apply gradient + L2 regularization (don't regularize intercept).
    w = {
      intercept: w.intercept - (lr * grad.intercept) / n,
      skills: w.skills - (lr * grad.skills) / n - lr * l2 * w.skills,
      title: w.title - (lr * grad.title) / n - lr * l2 * w.title,
      experience: w.experience - (lr * grad.experience) / n - lr * l2 * w.experience,
      salary: w.salary - (lr * grad.salary) / n - lr * l2 * w.salary,
      location: w.location - (lr * grad.location) / n - lr * l2 * w.location,
      company_fit: w.company_fit - (lr * grad.company_fit) / n - lr * l2 * w.company_fit,
      penalties: w.penalties - (lr * grad.penalties) / n - lr * l2 * w.penalties,
    };
  }

  const positive = examples.filter((e) => e.label === 1).length;
  const negative = examples.length - positive;

  return {
    weights: w,
    trainingSize: examples.length,
    positive,
    negative,
    metrics: {
      log_loss: logLossOn(train, w),
      accuracy: accuracyOn(train, w),
      holdout_accuracy: holdoutCount > 0 ? accuracyOn(holdout, w) : 0,
      auc_approx: rocAuc(holdout.length > 0 ? holdout : train, w),
    },
  };
}

// ─── Convenience: pull labelled examples from match_features ─

export async function loadLabelledExamples(limit = 10_000): Promise<TrainingExample[]> {
  const { data, error } = await supabaseAdmin
    .from("match_features")
    .select("features, outcome")
    .not("outcome", "is", null)
    .order("outcome_at", { ascending: false })
    .limit(limit);
  if (error) {
    log.warn("loadLabelledExamples failed", { error: error.message });
    return [];
  }

  const out: TrainingExample[] = [];
  for (const row of data ?? []) {
    const label = outcomeToLabel(row.outcome as string | null);
    if (label === null) continue;
    const features = row.features as Partial<Record<FeatureKey, number>> | null;
    if (!features) continue;
    out.push({
      features: normalizeFeatures(features),
      label,
    });
  }
  return out;
}
