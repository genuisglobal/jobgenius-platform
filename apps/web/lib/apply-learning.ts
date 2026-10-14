import { supabaseServer } from "@/lib/supabase/server";
import {
  resolveHostAutomationRuleAsync,
  type ResolvedHostAutomationRule,
} from "@/lib/apply-host-rules";
import { shouldCircuitBreak } from "@/lib/adapter-health";

type BuildAutomationHintsArgs = {
  atsType: string | null;
  jobUrl: string | null;
};

type ErrorSignatureRow = {
  error_code: string | null;
  step: string | null;
};

type BlockerSummary = {
  error_code: string;
  count: number;
};

export type ApplyAutomationHints = {
  ats: string;
  rule_id: string | null;
  url_host: string | null;
  max_auto_advance_steps: number;
  max_no_progress_rounds: number;
  button_hints: string[];
  apply_entry_hints: string[];
  requires_apply_entry: boolean;
  prefer_popup_handoff: boolean;
  blockers: BlockerSummary[];
  // Circuit breaker: when the adapter has failed repeatedly, the runner should
  // pause instead of burning another attempt. Folded in here so callers get it
  // from the same run-start fetch as the rest of the hints.
  circuit_breaker: { blocked: boolean; reason?: string };
  generated_at: string;
};

const BASE_BUTTON_HINTS: Record<string, string[]> = {
  LINKEDIN: ["next", "continue", "review", "submit application", "submit"],
  GREENHOUSE: ["next", "continue", "review", "submit application", "submit"],
  WORKDAY: [
    "next",
    "continue",
    "save and continue",
    "review",
    "submit application",
    "submit",
  ],
  GENERIC: [
    "next",
    "continue",
    "save and continue",
    "proceed",
    "review",
    "submit application",
    "submit",
    "apply",
  ],
  UNKNOWN: ["next", "continue", "review", "submit", "apply"],
};

function normalizeAtsType(atsType: string | null) {
  const value = (atsType ?? "").trim().toUpperCase();
  return value || "UNKNOWN";
}

function uniqueTexts(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function summarizeBlockers(rows: ErrorSignatureRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = (row.error_code ?? "UNKNOWN").trim().toUpperCase();
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const blockers = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([errorCode, count]) => ({ error_code: errorCode, count }));

  return { blockers, counts };
}

function deriveButtonHints(
  ats: string,
  counts: Map<string, number>,
  hostRule: ResolvedHostAutomationRule
) {
  const defaults = BASE_BUTTON_HINTS[ats] ?? BASE_BUTTON_HINTS.UNKNOWN;
  const hints = [...defaults, ...hostRule.submit_hints];

  const submitMissingCount = counts.get("SUBMIT_BUTTON_MISSING") ?? 0;
  const reviewMissingCount = counts.get("REQUIRES_REVIEW") ?? 0;
  const noProgressCount = counts.get("NO_PROGRESS") ?? 0;

  if (submitMissingCount >= 2 || reviewMissingCount >= 2) {
    hints.push(
      "continue application",
      "save and continue",
      "next step",
      "proceed",
      "review and submit"
    );
  }

  if (noProgressCount >= 2) {
    hints.push("skip", "confirm", "continue to next step");
  }

  return uniqueTexts(hints);
}

function deriveMaxAdvance(counts: Map<string, number>) {
  const submitMissingCount = counts.get("SUBMIT_BUTTON_MISSING") ?? 0;
  const reviewMissingCount = counts.get("REQUIRES_REVIEW") ?? 0;
  const requiredFieldsCount = counts.get("REQUIRED_FIELDS") ?? 0;

  const frictionScore = submitMissingCount + reviewMissingCount + requiredFieldsCount;
  if (frictionScore >= 10) return 10;
  if (frictionScore >= 5) return 8;
  return 7;
}

function deriveNoProgressRounds(counts: Map<string, number>) {
  const noProgressCount = counts.get("NO_PROGRESS") ?? 0;
  return noProgressCount >= 3 ? 1 : 2;
}

async function loadSignatures(ats: string, urlHost: string | null) {
  const byHostQuery = supabaseServer
    .from("apply_error_signatures")
    .select("error_code, step")
    .eq("ats_type", ats)
    .order("created_at", { ascending: false })
    .limit(250);

  const scopedQuery = urlHost ? byHostQuery.eq("url_host", urlHost) : byHostQuery;
  const { data: hostRows, error: hostError } = await scopedQuery;

  if (!hostError && (hostRows?.length ?? 0) > 0) {
    return (hostRows ?? []) as ErrorSignatureRow[];
  }

  const { data: fallbackRows } = await supabaseServer
    .from("apply_error_signatures")
    .select("error_code, step")
    .eq("ats_type", ats)
    .order("created_at", { ascending: false })
    .limit(250);

  return (fallbackRows ?? []) as ErrorSignatureRow[];
}

export async function buildApplyAutomationHints(
  args: BuildAutomationHintsArgs
): Promise<ApplyAutomationHints> {
  const ats = normalizeAtsType(args.atsType);
  const hostRule = await resolveHostAutomationRuleAsync(args.jobUrl);
  const urlHost = hostRule.url_host;
  const signatures = await loadSignatures(ats, urlHost);
  const { blockers, counts } = summarizeBlockers(signatures);
  const circuitBreaker = await shouldCircuitBreak(ats);

  return {
    ats,
    rule_id: hostRule.rule_id,
    url_host: urlHost,
    max_auto_advance_steps: deriveMaxAdvance(counts),
    max_no_progress_rounds: deriveNoProgressRounds(counts),
    button_hints: deriveButtonHints(ats, counts, hostRule),
    apply_entry_hints: hostRule.apply_entry_hints,
    requires_apply_entry: hostRule.requires_apply_entry,
    prefer_popup_handoff: hostRule.prefer_popup_handoff,
    blockers: blockers.slice(0, 5),
    circuit_breaker: circuitBreaker,
    generated_at: new Date().toISOString(),
  };
}
