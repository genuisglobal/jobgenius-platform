import { supabaseAdmin } from "@/lib/auth";
import { getInitialStep } from "@/lib/apply";
import { createLogger } from "@/lib/logger";
import type { AutoApplyPreflightDecision } from "@/lib/auto-apply-preflight";

// ============================================================
// Mode 3 → autonomous graduation.
//
// A GENERIC host with no trusted automation rule is normally rejected by the
// auto-apply preflight (HOST_UNSUPPORTED). But once interactive Mode 3 autofill
// has filled that host's forms enough times — accumulating high-trust learned
// field rules and a low correction rate — we can trust the autonomous runner to
// handle it. That's "graduation": the frontier a human worked pushes into the
// automated zone.
//
// This is OFF by default (MODE3_HOST_GRADUATION=1 to enable) and only relaxes
// the HOST_UNSUPPORTED gate — every other preflight gate (ATS allow-list, match
// block, popup-handoff, auth session) still applies.
// ============================================================

const log = createLogger("host-graduation");

const ENABLED = process.env.MODE3_HOST_GRADUATION === "1";
const MIN_CONFIRMED_RULES = Number(process.env.MODE3_GRADUATION_MIN_RULES ?? 3);
const MIN_EVENTS = Number(process.env.MODE3_GRADUATION_MIN_EVENTS ?? 8);
const MAX_CORRECTION_RATE = Number(process.env.MODE3_GRADUATION_MAX_CORRECTION_RATE ?? 0.25);

// High-trust learned-rule sources: human-confirmed or promoted/curated.
const TRUSTED_SOURCES = ["user_confirmed", "promoted", "rule"];

/**
 * Whether a host has been proven safe for autonomous apply by Mode 3 usage.
 * Requires: enough high-trust learned rules AND a low share of "corrected"
 * events (humans rarely had to fix our fills). Best-effort; never throws.
 */
export async function isHostGraduated(host: string | null | undefined): Promise<boolean> {
  if (!ENABLED) return false;
  const normalized = (host ?? "").trim().toLowerCase();
  if (!normalized) return false;

  try {
    const { count: confirmedRules, error: rulesError } = await supabaseAdmin
      .from("learned_field_rules")
      .select("id", { count: "exact", head: true })
      .eq("url_host", normalized)
      .in("source", TRUSTED_SOURCES);

    if (rulesError) {
      log.warn("graduation rules lookup failed", { host: normalized, error: rulesError.message });
      return false;
    }
    if ((confirmedRules ?? 0) < MIN_CONFIRMED_RULES) return false;

    const { data: events, error: eventsError } = await supabaseAdmin
      .from("learned_field_events")
      .select("outcome")
      .eq("url_host", normalized)
      .order("created_at", { ascending: false })
      .limit(200);

    if (eventsError) {
      log.warn("graduation events lookup failed", { host: normalized, error: eventsError.message });
      return false;
    }

    const total = events?.length ?? 0;
    if (total < MIN_EVENTS) return false;

    // Note: the runner only emits corrected/filled_blank (never "accepted"), so
    // this is the share of events where a human had to FIX a value we set. A low
    // share means we're rarely wrong; blank-fills become learned rules over time.
    const corrected = (events ?? []).filter((e) => e.outcome === "corrected").length;
    const correctionRate = total > 0 ? corrected / total : 1;
    return correctionRate <= MAX_CORRECTION_RATE;
  } catch (err) {
    log.warn("isHostGraduated threw", {
      host: normalized,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * If the preflight rejected a host purely because it's unsupported (GENERIC +
 * no host rule), promote it to eligible when Mode 3 has graduated the host.
 * All other rejection reasons are left untouched.
 */
export async function applyHostGraduation(
  preflight: AutoApplyPreflightDecision
): Promise<AutoApplyPreflightDecision> {
  if (preflight.eligible) return preflight;
  if (preflight.reasonCode !== "HOST_UNSUPPORTED" || !preflight.targetHost) {
    return preflight;
  }
  if (!(await isHostGraduated(preflight.targetHost))) {
    return preflight;
  }

  log.info("host graduated to autonomous apply", { host: preflight.targetHost });
  return {
    ...preflight,
    eligible: true,
    reasonCode: null,
    message: "Host graduated to autonomous apply via Mode 3 learning.",
    initialStep: getInitialStep(
      preflight.atsType as Parameters<typeof getInitialStep>[0]
    ),
  };
}
