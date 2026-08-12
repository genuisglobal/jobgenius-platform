import { supabaseAdmin } from "@/lib/auth";
import { resolveHostAutomationRuleAsync } from "@/lib/apply-host-rules";
import { createLogger } from "@/lib/logger";

// ============================================================
// Canary probes (canary_runs, migration 086).
//
// A canary is a SHALLOW health check per ATS:
//   1. Resolve the host automation rule for a known-good probe URL.
//   2. Fetch the URL (HEAD first, GET fallback).
//   3. Check the response body contains at least one of the
//      apply-entry hints OR the host responded with a 2xx-3xx status.
//
// We intentionally do NOT exercise the full pre-submit flow here —
// browser automation is expensive and risky as a daily probe. This
// catches the most common drift signal: the host went down, the URL
// shape changed, or the apply-entry copy changed enough that none of
// our hints match.
// ============================================================

const log = createLogger("canary");

const HTTP_TIMEOUT_MS = 12_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; JobGeniusCanary/1.0; +https://jobgenius.com/canary)";

export type CanaryOutcome = "pass" | "fail" | "degraded" | "skipped";

export interface CanaryProbeSpec {
  atsType: string;
  probeUrl: string;
}

export interface CanaryProbeResult {
  atsType: string;
  probeUrl: string;
  outcome: CanaryOutcome;
  durationMs: number;
  httpStatus: number | null;
  details: Record<string, unknown>;
  error: string | null;
}

// Default probes — one stable public listing per ATS. Tune per environment.
// Maintainers: pick URLs that are unlikely to be deleted.
const DEFAULT_PROBES: CanaryProbeSpec[] = [
  { atsType: "GREENHOUSE", probeUrl: "https://boards.greenhouse.io/airbnb" },
  { atsType: "LEVER", probeUrl: "https://jobs.lever.co/figma" },
  { atsType: "WORKDAY", probeUrl: "https://workday.wd5.myworkdayjobs.com/Workday" },
  { atsType: "ASHBY", probeUrl: "https://jobs.ashbyhq.com/openai" },
  { atsType: "SMARTRECRUITERS", probeUrl: "https://careers.smartrecruiters.com/SmartRecruiters" },
  { atsType: "WORKABLE", probeUrl: "https://apply.workable.com/" },
];

export function getDefaultProbes(): CanaryProbeSpec[] {
  const override = process.env.CANARY_PROBES;
  if (!override) return DEFAULT_PROBES;
  try {
    const parsed = JSON.parse(override) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((p): p is CanaryProbeSpec => {
          return (
            typeof p === "object" &&
            p !== null &&
            typeof (p as CanaryProbeSpec).atsType === "string" &&
            typeof (p as CanaryProbeSpec).probeUrl === "string"
          );
        })
        .map((p) => ({ atsType: p.atsType.toUpperCase(), probeUrl: p.probeUrl }));
    }
  } catch {
    log.warn("CANARY_PROBES env var is not valid JSON; using defaults");
  }
  return DEFAULT_PROBES;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function bodyContainsAnyHint(body: string, hints: string[]): string | null {
  const lower = body.toLowerCase();
  for (const hint of hints) {
    if (!hint) continue;
    if (lower.includes(hint.toLowerCase())) return hint;
  }
  return null;
}

export async function runCanaryProbe(spec: CanaryProbeSpec): Promise<CanaryProbeResult> {
  const startedAt = Date.now();
  try {
    const hostRule = await resolveHostAutomationRuleAsync(spec.probeUrl);
    const hints = [
      ...(hostRule.apply_entry_hints ?? []),
      ...(hostRule.submit_hints ?? []),
    ];

    // HEAD first — cheap; fall back to GET if the host doesn't support it.
    let response: Response;
    try {
      response = await fetchWithTimeout(spec.probeUrl, {
        method: "HEAD",
        headers: { "User-Agent": USER_AGENT },
        redirect: "follow",
      });
      if (response.status === 405 || response.status === 501) {
        throw new Error(`HEAD not supported (${response.status})`);
      }
    } catch {
      response = await fetchWithTimeout(spec.probeUrl, {
        method: "GET",
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
        redirect: "follow",
      });
    }

    const status = response.status;
    const ok = response.ok || (status >= 200 && status < 400);

    let hintHit: string | null = null;
    let bodySize: number | null = null;
    if (ok && response.headers.get("content-type")?.includes("text")) {
      const body = await response.text();
      bodySize = body.length;
      if (hints.length > 0) {
        hintHit = bodyContainsAnyHint(body, hints);
      }
    }

    const durationMs = Date.now() - startedAt;
    if (!ok) {
      return {
        atsType: spec.atsType,
        probeUrl: spec.probeUrl,
        outcome: "fail",
        durationMs,
        httpStatus: status,
        details: { reason: `non-2xx/3xx ${status}` },
        error: `HTTP ${status}`,
      };
    }
    if (hints.length > 0 && hintHit === null && bodySize !== null && bodySize > 0) {
      return {
        atsType: spec.atsType,
        probeUrl: spec.probeUrl,
        outcome: "degraded",
        durationMs,
        httpStatus: status,
        details: { hint_count: hints.length, body_size: bodySize },
        error: "No apply-entry hint matched body",
      };
    }
    return {
      atsType: spec.atsType,
      probeUrl: spec.probeUrl,
      outcome: "pass",
      durationMs,
      httpStatus: status,
      details: { hint_hit: hintHit, body_size: bodySize, hint_count: hints.length },
      error: null,
    };
  } catch (err) {
    return {
      atsType: spec.atsType,
      probeUrl: spec.probeUrl,
      outcome: "fail",
      durationMs: Date.now() - startedAt,
      httpStatus: null,
      details: {},
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Persist a canary probe result. Best-effort; never throws. */
export async function persistCanaryResult(result: CanaryProbeResult): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("canary_runs").insert({
      ats_type: result.atsType,
      probe_url: result.probeUrl,
      outcome: result.outcome,
      duration_ms: result.durationMs,
      http_status: result.httpStatus,
      details: result.details,
      error: result.error,
    });
    if (error) {
      log.warn("canary_runs insert failed", { error: error.message });
    }
  } catch (err) {
    log.warn("canary_runs insert threw", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
