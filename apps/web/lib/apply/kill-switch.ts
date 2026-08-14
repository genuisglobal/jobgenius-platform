// ============================================================
// Automation kill switches (migration 108).
//
// When an ATS starts hard-blocking, a board threatens accounts, or
// something is wrong platform-wide, the admin needs applying to STOP
// NOW — not after a deploy. Switches are rows in automation_policies
// (missing row = enabled); every claim/start path checks them, so a
// flipped switch takes effect on the next poll. Running runs are
// never interrupted — stopping mid-wizard risks a half-submitted
// application, which is worse than finishing the one in flight.
// ============================================================

export const GLOBAL_APPLY_KEY = "GLOBAL_APPLY";

export function atsPolicyKey(atsType: unknown): string {
  return `ATS:${String(atsType ?? "").trim().toUpperCase()}`;
}

export type PolicyRow = { key: string; enabled: boolean };

export type HaltVerdict =
  | { halted: false }
  | { halted: true; reason: "AUTOMATION_HALTED" | "ATS_HALTED"; key: string };

/** Pure evaluation over loaded rows. */
export function evaluatePolicies(
  rows: PolicyRow[],
  atsType?: string | null
): HaltVerdict {
  const disabled = new Set(rows.filter((r) => !r.enabled).map((r) => r.key));
  if (disabled.has(GLOBAL_APPLY_KEY)) {
    return { halted: true, reason: "AUTOMATION_HALTED", key: GLOBAL_APPLY_KEY };
  }
  if (atsType) {
    const key = atsPolicyKey(atsType);
    if (disabled.has(key)) {
      return { halted: true, reason: "ATS_HALTED", key };
    }
  }
  return { halted: false };
}

/**
 * Load disabled switches (one small indexed query). Fails OPEN on read
 * errors: a broken policy table must not halt all applying — the switch is
 * for deliberate stops, not accidental ones.
 */
export async function getDisabledPolicyKeys(): Promise<Set<string>> {
  try {
    const { supabaseServer } = await import("@/lib/supabase/server");
    const { data, error } = await supabaseServer
      .from("automation_policies")
      .select("key")
      .eq("enabled", false);
    if (error) return new Set();
    return new Set((data ?? []).map((r) => r.key as string));
  } catch {
    return new Set();
  }
}

/** Convenience: is applying halted globally or for `atsType`? */
export async function checkAutomationHalt(
  atsType?: string | null
): Promise<HaltVerdict> {
  const disabled = await getDisabledPolicyKeys();
  return evaluatePolicies(
    Array.from(disabled).map((key) => ({ key, enabled: false })),
    atsType
  );
}
