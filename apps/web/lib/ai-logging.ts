import crypto from "crypto";
import { supabaseAdmin } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { getOpenAIClient, OPENAI_MODEL } from "@/lib/openai";
import type OpenAI from "openai";

// ============================================================
// AI call logging — persists every OpenAI call to ai_call_logs
// (migration 078) so we can build cost guards, quality dashboards,
// and per-route observability.
//
// Use chatWithLogging() instead of getOpenAIClient().chat.completions.create()
// in new code. Existing callers keep working unchanged; they can opt in
// over time, or call logAiCall() manually around their own client usage.
// ============================================================

const log = createLogger("ai");

// Rough USD/1K-token pricing for cost estimation. Update when pricing changes.
// These are deliberately conservative (slightly higher than published) so we
// over-estimate spend rather than under-estimate.
const PRICING_USD_PER_1K: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 0.005, output: 0.015 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4-turbo": { input: 0.01, output: 0.03 },
  "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
};

export type AiCallStatus = "success" | "error" | "fallback";

export interface AiCallLogInput {
  route?: string | null;
  functionName: string;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs: number;
  status: AiCallStatus;
  error?: string | null;
  promptHash?: string | null;
  seekerId?: string | null;
  amId?: string | null;
  meta?: Record<string, unknown>;
}

function estimateCostUsd(model: string, input?: number | null, output?: number | null): number | null {
  const pricing = PRICING_USD_PER_1K[model];
  if (!pricing) return null;
  const inUsd = ((input ?? 0) / 1000) * pricing.input;
  const outUsd = ((output ?? 0) / 1000) * pricing.output;
  return Math.round((inUsd + outUsd) * 1_000_000) / 1_000_000;
}

export function hashPrompt(prompt: unknown): string {
  const serialized = typeof prompt === "string" ? prompt : JSON.stringify(prompt);
  return crypto.createHash("sha256").update(serialized).digest("hex").slice(0, 32);
}

// ─── Daily cost guard ───────────────────────────────────────
//
// OPENAI_DAILY_USD_CAP (env, optional): rolling-24h ceiling in USD. When the
// summed cost_usd from ai_call_logs reaches the cap, every chatWithLogging
// call throws CostCapExceededError until the rolling sum drops below it.
//
// The cap is queried at most once per cache TTL to avoid hammering the DB.
// Set to 0 or unset to disable.

const COST_CACHE_TTL_MS = 60_000;
let costCache: { checkedAt: number; totalUsd: number } | null = null;

export class CostCapExceededError extends Error {
  constructor(public readonly currentUsd: number, public readonly capUsd: number) {
    super(
      `AI daily cost cap reached: $${currentUsd.toFixed(2)} of $${capUsd.toFixed(
        2
      )} cap. Set OPENAI_DAILY_USD_CAP=0 to disable.`
    );
    this.name = "CostCapExceededError";
  }
}

function readDailyCapUsd(): number {
  const raw = Number(process.env.OPENAI_DAILY_USD_CAP);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

async function getRolling24hCostUsd(): Promise<number> {
  if (costCache && Date.now() - costCache.checkedAt < COST_CACHE_TTL_MS) {
    return costCache.totalUsd;
  }
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("ai_call_logs")
    .select("cost_usd")
    .gte("created_at", since)
    .not("cost_usd", "is", null);
  if (error) {
    // Fail open on a query error so we don't block AI traffic on a DB hiccup.
    log.warn("cost guard query failed", { error: error.message });
    return 0;
  }
  const total = (data ?? []).reduce(
    (sum, row) => sum + (Number(row.cost_usd) || 0),
    0
  );
  costCache = { checkedAt: Date.now(), totalUsd: total };
  return total;
}

/**
 * Throws CostCapExceededError when the rolling-24h cost has reached the cap.
 * No-op when OPENAI_DAILY_USD_CAP is unset/0.
 */
export async function assertUnderDailyCostCap(): Promise<void> {
  const cap = readDailyCapUsd();
  if (cap <= 0) return;
  const current = await getRolling24hCostUsd();
  if (current >= cap) {
    throw new CostCapExceededError(current, cap);
  }
}

/**
 * Force the cost cache to refresh on the next call. Useful when an admin
 * raises the cap and wants the gate to lift immediately.
 */
export function invalidateCostCache(): void {
  costCache = null;
}

/**
 * Insert a row into ai_call_logs. Non-blocking — never throws.
 */
export async function logAiCall(input: AiCallLogInput): Promise<void> {
  const totalTokens =
    (input.inputTokens ?? 0) + (input.outputTokens ?? 0) || null;
  const costUsd = estimateCostUsd(input.model, input.inputTokens, input.outputTokens);

  try {
    const { error } = await supabaseAdmin.from("ai_call_logs").insert({
      route: input.route ?? null,
      function_name: input.functionName,
      model: input.model,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      total_tokens: totalTokens,
      latency_ms: input.latencyMs,
      status: input.status,
      error: input.error ?? null,
      prompt_hash: input.promptHash ?? null,
      seeker_id: input.seekerId ?? null,
      am_id: input.amId ?? null,
      cost_usd: costUsd,
      meta: input.meta ?? {},
    });
    if (error) {
      log.warn("ai_call_logs insert failed", {
        function: input.functionName,
        error: error.message,
      });
    }
  } catch (err) {
    log.warn("ai_call_logs insert threw", {
      function: input.functionName,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface ChatWithLoggingOptions {
  /** Identifies the calling function, e.g. "tailorResume" or "buildInterviewPrep". */
  functionName: string;
  /** Optional route, e.g. "/api/am/resume-tailor". */
  route?: string;
  /** Optional seeker/AM context for per-actor cost attribution. */
  seekerId?: string | null;
  amId?: string | null;
  /** Extra metadata captured in ai_call_logs.meta. */
  meta?: Record<string, unknown>;
}

/**
 * Wrapper around openai.chat.completions.create that records the call to
 * ai_call_logs. Identical to the underlying API; pass standard params.
 *
 * Errors are logged then re-thrown, so existing error handling still works.
 */
export async function chatWithLogging(
  params: OpenAI.ChatCompletionCreateParamsNonStreaming,
  context: ChatWithLoggingOptions
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  await assertUnderDailyCostCap();

  const client = getOpenAIClient();
  const startedAt = Date.now();
  const model = params.model || OPENAI_MODEL;
  const promptHash = hashPrompt(params.messages);

  try {
    const result = await client.chat.completions.create(params);
    const latencyMs = Date.now() - startedAt;
    void logAiCall({
      route: context.route,
      functionName: context.functionName,
      model,
      inputTokens: result.usage?.prompt_tokens ?? null,
      outputTokens: result.usage?.completion_tokens ?? null,
      latencyMs,
      status: "success",
      promptHash,
      seekerId: context.seekerId ?? null,
      amId: context.amId ?? null,
      meta: context.meta,
    });
    return result;
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    void logAiCall({
      route: context.route,
      functionName: context.functionName,
      model,
      latencyMs,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      promptHash,
      seekerId: context.seekerId ?? null,
      amId: context.amId ?? null,
      meta: context.meta,
    });
    throw err;
  }
}
