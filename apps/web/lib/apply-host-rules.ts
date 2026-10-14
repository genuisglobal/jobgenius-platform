import { resolveJobTargetUrl } from "@/lib/job-url";
import { supabaseAdmin } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

// ============================================================
// Per-host apply-flow rules.
//
// Backed by host_automation_rules (migration 081). Cached in module
// memory for 5 minutes. Falls back to the static FALLBACK_HOST_RULES
// array on DB unavailability so the apply pipeline never breaks.
//
// Async callers (lib/apply-learning.ts) use resolveHostAutomationRuleAsync
// for fresh data. Sync callers (lib/auto-apply-preflight.ts) use
// resolveHostAutomationRule, which reads whatever's already in cache and
// falls back to the static set on a cold start.
//
// To invalidate after an admin edit, call invalidateHostRulesCache().
// ============================================================

const log = createLogger("apply-host-rules");

export type ResolvedHostAutomationRule = {
  rule_id: string | null;
  url_host: string | null;
  apply_entry_hints: string[];
  submit_hints: string[];
  requires_apply_entry: boolean;
  prefer_popup_handoff: boolean;
};

export type HostAutomationRule = {
  id: string;
  hosts: string[];
  applyEntryHints?: string[];
  submitHints?: string[];
  requiresApplyEntry?: boolean;
  preferPopupHandoff?: boolean;
};

// Static fallback — used when the DB is unreachable or the table is empty.
// Kept in sync with the seed in migration 081.
const FALLBACK_HOST_RULES: HostAutomationRule[] = [
  { id: "INDEED_LISTING", hosts: ["indeed.com"],
    applyEntryHints: ["apply now","apply on company site","apply on company website","continue application","continue applying","continue to application","view application","visit employer site"],
    submitHints: ["continue application","continue to application","review application","submit application"],
    requiresApplyEntry: true, preferPopupHandoff: true },
  { id: "LEVER", hosts: ["lever.co"],
    applyEntryHints: ["apply for this job","apply now","apply"],
    submitHints: ["submit application","submit","apply","next","continue"],
    requiresApplyEntry: true },
  { id: "SMARTRECRUITERS", hosts: ["smartrecruiters.com"],
    applyEntryHints: ["i'm interested","apply now","apply"],
    submitHints: ["next","continue","review","submit application","submit"],
    requiresApplyEntry: true },
  { id: "ICIMS", hosts: ["icims.com"],
    applyEntryHints: ["apply now","apply for this job online","apply for this position","continue to apply"],
    submitHints: ["next","continue","submit application","submit"],
    requiresApplyEntry: true },
  { id: "JOBVITE", hosts: ["jobvite.com"],
    applyEntryHints: ["apply now","apply","start application"],
    submitHints: ["next","continue","review","submit application","submit"],
    requiresApplyEntry: true },
  { id: "WORKABLE", hosts: ["workable.com"],
    applyEntryHints: ["apply for this job","apply now","apply"],
    submitHints: ["next","continue","submit application","submit"],
    requiresApplyEntry: true },
  { id: "BAMBOOHR", hosts: ["bamboohr.com"],
    applyEntryHints: ["apply for job","apply now","apply"],
    submitHints: ["next","continue","submit application","submit"],
    requiresApplyEntry: true },
];

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { rules: HostAutomationRule[]; loadedAt: number } | null = null;

type HostRuleRow = {
  rule_id: string;
  hosts: string[];
  apply_entry_hints: string[] | null;
  submit_hints: string[] | null;
  requires_apply_entry: boolean | null;
  prefer_popup_handoff: boolean | null;
};

function rowToRule(row: HostRuleRow): HostAutomationRule {
  return {
    id: row.rule_id,
    hosts: Array.isArray(row.hosts) ? row.hosts : [],
    applyEntryHints: row.apply_entry_hints ?? [],
    submitHints: row.submit_hints ?? [],
    requiresApplyEntry: Boolean(row.requires_apply_entry),
    preferPopupHandoff: Boolean(row.prefer_popup_handoff),
  };
}

async function loadFromDb(): Promise<HostAutomationRule[] | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("host_automation_rules")
      .select("rule_id, hosts, apply_entry_hints, submit_hints, requires_apply_entry, prefer_popup_handoff")
      .eq("status", "active")
      .order("priority", { ascending: false })
      .order("rule_id", { ascending: true });
    if (error) {
      log.warn("host_automation_rules load failed", { error: error.message });
      return null;
    }
    return (data ?? []).map((row) => rowToRule(row as HostRuleRow));
  } catch (err) {
    log.warn("host_automation_rules load threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function ensureCacheLoaded(): Promise<HostAutomationRule[]> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.rules;
  }
  const dbRules = await loadFromDb();
  if (dbRules && dbRules.length > 0) {
    cache = { rules: dbRules, loadedAt: Date.now() };
    return dbRules;
  }
  // DB unreachable or empty — populate cache with fallback so subsequent
  // sync calls don't keep hitting the fallback path either.
  cache = { rules: FALLBACK_HOST_RULES, loadedAt: Date.now() };
  return FALLBACK_HOST_RULES;
}

/** Force the next async call to re-query the DB. Call after admin edits. */
export function invalidateHostRulesCache(): void {
  cache = null;
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

function getUrlHost(rawUrl: string | null) {
  if (!rawUrl) {
    return null;
  }
  const resolved = resolveJobTargetUrl(rawUrl) || rawUrl;
  try {
    return new URL(resolved).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function matchesHost(host: string, pattern: string) {
  return host === pattern || host.endsWith(`.${pattern}`);
}

function resolveFromRules(
  rules: HostAutomationRule[],
  jobUrl: string | null
): ResolvedHostAutomationRule {
  const urlHost = getUrlHost(jobUrl);
  if (!urlHost) {
    return {
      rule_id: null,
      url_host: null,
      apply_entry_hints: [],
      submit_hints: [],
      requires_apply_entry: false,
      prefer_popup_handoff: false,
    };
  }
  const rule =
    rules.find((candidate) =>
      candidate.hosts.some((pattern) => matchesHost(urlHost, pattern))
    ) ?? null;
  return {
    rule_id: rule?.id ?? null,
    url_host: urlHost,
    apply_entry_hints: uniqueTexts(rule?.applyEntryHints ?? []),
    submit_hints: uniqueTexts(rule?.submitHints ?? []),
    requires_apply_entry: Boolean(rule?.requiresApplyEntry),
    prefer_popup_handoff: Boolean(rule?.preferPopupHandoff),
  };
}

/**
 * Synchronous lookup. Uses whatever's in cache; falls back to the static
 * FALLBACK_HOST_RULES array on cold start. Sync callers should accept that
 * brand-new DB rules may not be reflected until the cache warms up via an
 * async call.
 */
export function resolveHostAutomationRule(
  jobUrl: string | null
): ResolvedHostAutomationRule {
  const rules = cache?.rules ?? FALLBACK_HOST_RULES;
  return resolveFromRules(rules, jobUrl);
}

/**
 * Async lookup. Refreshes the cache from the DB if stale, then resolves.
 * Use this from any async caller that wants fresh rules.
 */
export async function resolveHostAutomationRuleAsync(
  jobUrl: string | null
): Promise<ResolvedHostAutomationRule> {
  const rules = await ensureCacheLoaded();
  return resolveFromRules(rules, jobUrl);
}
