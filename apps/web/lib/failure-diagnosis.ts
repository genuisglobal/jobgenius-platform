import { supabaseAdmin } from "@/lib/auth";
import { chatWithLogging, CostCapExceededError } from "@/lib/ai-logging";
import { OPENAI_MODEL, isOpenAIConfigured } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { applyProposedRule } from "@/lib/host-rule-proposals";

// ============================================================
// Failure diagnosis (failure_diagnoses, migration 083).
//
// Given a failed application_run, fetches the latest screenshot +
// error context and asks a Vision LLM to classify the blocker and
// (when possible) propose a host_automation_rules patch.
//
// Output is strict JSON. Persisted to failure_diagnoses for the
// admin review surface. Cost-cap respected via chatWithLogging.
//
// Triggered from /api/background/run on the DIAGNOSE_FAILURE job.
// ============================================================

const log = createLogger("failure-diagnosis");

const DIAGNOSIS_MODEL = process.env.FAILURE_DIAGNOSIS_MODEL || OPENAI_MODEL;
const SCREENSHOT_SIGNED_URL_TTL_SECONDS = 5 * 60;
const AUTO_PROMOTE_CONFIDENCE_THRESHOLD = Number(
  process.env.DIAGNOSIS_AUTO_PROMOTE_THRESHOLD ?? 0.8
);

export const ROOT_CAUSES = [
  "captcha",
  "required_field_missing",
  "overlay",
  "selector_changed",
  "auth_expired",
  "popup_handoff_needed",
  "rate_limit",
  "layout_drift",
  "unknown",
] as const;
export type RootCause = (typeof ROOT_CAUSES)[number];

export const PROPOSED_ACTIONS = [
  "retry_same",
  "rotate_session",
  "skip_optional",
  "simplified_fields",
  "alt_resume",
  "add_host_rule",
  "human_review",
] as const;
export type ProposedAction = (typeof PROPOSED_ACTIONS)[number];

export interface DiagnosisResult {
  id: string | null;
  rootCause: RootCause;
  proposedAction: ProposedAction;
  proposedRule: Record<string, unknown> | null;
  confidence: number;
  reasoning: string;
}

export interface DiagnoseInput {
  runId: string;
}

const SYSTEM_PROMPT = `You are a senior automation engineer reviewing why a job-application bot failed on this attempt.

You will see:
- A screenshot of the page where the bot stopped.
- The ATS type, the URL host, the failed step, and the last error message.

Your job is to classify the blocker and propose a recovery action. Be specific: the engineer reading your output will act on it.

Output STRICT JSON with these fields (no markdown, no extra keys):
{
  "root_cause": one of [${ROOT_CAUSES.join(", ")}],
  "proposed_action": one of [${PROPOSED_ACTIONS.join(", ")}],
  "proposed_rule": null OR an object that fits the host_automation_rules schema. Use this ONLY when the blocker is a fixable UI pattern on this host (e.g., the "Submit" label changed, or the host needs a popup handoff). Fields you may include: rule_id, hosts (array), apply_entry_hints (array of lowercase strings), submit_hints (array), requires_apply_entry (bool), prefer_popup_handoff (bool), notes.
  "confidence": number 0-1,
  "reasoning": one sentence — what you saw on the screenshot that drove the classification.
}

Rules:
- If you see a CAPTCHA widget (reCAPTCHA, hCaptcha, Turnstile) -> root_cause "captcha", proposed_action "rotate_session", proposed_rule null.
- If the page is asking for a form field with no obvious error -> "required_field_missing", proposed_action "skip_optional".
- If a modal/cookie banner is visible blocking the flow -> "overlay", proposed_action "retry_same", proposed_rule may include extra submit_hints if a "dismiss" button is shown.
- If the page is a login screen -> "auth_expired", proposed_action "rotate_session".
- If the Submit button is missing or renamed AND you can see the new label -> "selector_changed", proposed_action "add_host_rule", proposed_rule with submit_hints set to a SHORT array including the new label, all lowercase.
- If a popup window/handoff is needed to continue -> "popup_handoff_needed", proposed_action "add_host_rule", proposed_rule with prefer_popup_handoff true.
- If you see "too many requests" / 429 / rate-limit copy -> "rate_limit", proposed_action "rotate_session".
- If the page is clearly a different layout from the ATS's usual one -> "layout_drift", proposed_action "human_review".
- If you cannot tell -> "unknown", proposed_action "human_review", confidence <= 0.4.`;

interface RunContext {
  id: string;
  ats_type: string | null;
  last_error: string | null;
  last_error_code: string | null;
  current_step: string | null;
  last_seen_url: string | null;
  job_post_id: string | null;
}

interface ScreenshotRow {
  screenshot_path: string;
  step: string | null;
  reason: string | null;
  url: string | null;
  created_at: string;
}

async function loadRunContext(runId: string): Promise<RunContext | null> {
  const { data } = await supabaseAdmin
    .from("application_runs")
    .select(
      "id, ats_type, last_error, last_error_code, current_step, last_seen_url, job_post_id"
    )
    .eq("id", runId)
    .maybeSingle();
  return (data as RunContext | null) ?? null;
}

async function loadLatestScreenshot(runId: string): Promise<ScreenshotRow | null> {
  const { data } = await supabaseAdmin
    .from("apply_run_screenshots")
    .select("screenshot_path, step, reason, url, created_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ScreenshotRow | null) ?? null;
}

async function signScreenshotUrl(path: string): Promise<string | null> {
  const { data } = await supabaseAdmin.storage
    .from("runner-screenshots")
    .createSignedUrl(path, SCREENSHOT_SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

function clampConfidence(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof value !== "string") return fallback;
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function asProposedRule(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  // Trust the model's keys but ensure they're a flat object.
  return value as Record<string, unknown>;
}

/**
 * Diagnose a failed run end-to-end. Returns null on any failure path
 * (missing screenshot, cost cap reached, LLM error) — non-blocking by
 * design.
 */
export async function diagnoseRunFailure(input: DiagnoseInput): Promise<DiagnosisResult | null> {
  if (!isOpenAIConfigured()) {
    log.warn("OPENAI_API_KEY missing — skipping diagnosis", { runId: input.runId });
    return null;
  }

  const run = await loadRunContext(input.runId);
  if (!run) {
    log.warn("run not found", { runId: input.runId });
    return null;
  }

  const screenshot = await loadLatestScreenshot(input.runId);
  if (!screenshot?.screenshot_path) {
    log.warn("no screenshot for run — cannot diagnose", { runId: input.runId });
    return null;
  }

  const signedUrl = await signScreenshotUrl(screenshot.screenshot_path);
  if (!signedUrl) {
    log.warn("failed to sign screenshot URL", {
      runId: input.runId,
      path: screenshot.screenshot_path,
    });
    return null;
  }

  let urlHost: string | null = null;
  if (run.last_seen_url) {
    try {
      urlHost = new URL(run.last_seen_url).hostname.toLowerCase();
    } catch {
      urlHost = null;
    }
  }

  const contextLines = [
    `ATS type: ${run.ats_type ?? "UNKNOWN"}`,
    `URL host: ${urlHost ?? "unknown"}`,
    `Failed step: ${run.current_step ?? screenshot.step ?? "unknown"}`,
    `Error code: ${run.last_error_code ?? "n/a"}`,
    `Error message: ${run.last_error ?? screenshot.reason ?? "n/a"}`,
  ].join("\n");

  let parsed: Record<string, unknown>;
  try {
    const response = await chatWithLogging(
      {
        model: DIAGNOSIS_MODEL,
        temperature: 0.1,
        max_tokens: 600,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: contextLines },
              {
                type: "image_url",
                image_url: { url: signedUrl, detail: "low" },
              },
            ],
          },
        ],
      },
      {
        functionName: "diagnoseRunFailure",
        route: "background/run",
        meta: { run_id: input.runId, ats_type: run.ats_type, url_host: urlHost },
      }
    );
    const content = response.choices[0]?.message?.content;
    if (!content) {
      log.warn("empty diagnosis response", { runId: input.runId });
      return null;
    }
    parsed = JSON.parse(content);
  } catch (err) {
    if (err instanceof CostCapExceededError) {
      log.warn("cost cap reached — skipping diagnosis", { runId: input.runId });
      return null;
    }
    log.warn("diagnosis LLM call failed", {
      runId: input.runId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  const rootCause = asEnum<RootCause>(parsed.root_cause, ROOT_CAUSES, "unknown");
  const proposedAction = asEnum<ProposedAction>(
    parsed.proposed_action,
    PROPOSED_ACTIONS,
    "human_review"
  );
  const proposedRule = asProposedRule(parsed.proposed_rule);
  const confidence = clampConfidence(parsed.confidence);
  const reasoning =
    typeof parsed.reasoning === "string" ? parsed.reasoning.slice(0, 800) : "";

  const { data: inserted, error } = await supabaseAdmin
    .from("failure_diagnoses")
    .insert({
      run_id: input.runId,
      screenshot_path: screenshot.screenshot_path,
      dom_excerpt: null, // populated by L2.2 when we capture DOM hints here
      root_cause: rootCause,
      proposed_action: proposedAction,
      proposed_rule: proposedRule,
      confidence,
      reasoning,
      model: DIAGNOSIS_MODEL,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    log.warn("failure_diagnoses insert failed", {
      runId: input.runId,
      error: error.message,
    });
    return {
      id: null,
      rootCause,
      proposedAction,
      proposedRule,
      confidence,
      reasoning,
    };
  }

  const diagnosisId = inserted.id as string;

  // Auto-promote eligible diagnoses to host_automation_rules as
  // pending_review. The proposed rule still requires admin approval
  // before going active; this just stages it so the admin sees a
  // "1 pending review" badge on the Host Rules page instead of having
  // to paste the JSON manually.
  if (
    proposedAction === "add_host_rule" &&
    proposedRule &&
    confidence >= AUTO_PROMOTE_CONFIDENCE_THRESHOLD
  ) {
    void (async () => {
      const result = await applyProposedRule({
        proposed: proposedRule,
        fallbackHost: urlHost,
        source: `diagnosis:${diagnosisId.slice(0, 8)}:auto`,
        reviewerId: null,
        autoApprove: false,
      });
      if (result.ok) {
        await supabaseAdmin
          .from("failure_diagnoses")
          .update({
            status: "applied",
            decided_at: new Date().toISOString(),
            applied_rule_id: result.hostRuleId,
          })
          .eq("id", diagnosisId);
      } else {
        log.warn("auto-promote failed", { diagnosisId, reason: result.reason });
      }
    })();
  }

  return {
    id: diagnosisId,
    rootCause,
    proposedAction,
    proposedRule,
    confidence,
    reasoning,
  };
}
