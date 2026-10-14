import { supabaseAdmin } from "@/lib/auth";
import { invalidateHostRulesCache } from "@/lib/apply-host-rules";
import { createLogger } from "@/lib/logger";

// ============================================================
// Turn a proposed_rule (from failure_diagnoses or am_resolutions)
// into a host_automation_rules row, with dedupe.
//
// Default lands at status='pending_review' so an admin still flips
// it to 'active' on /dashboard/admin/host-rules. Set autoApprove=true
// when called from a high-trust path (rare).
//
// Dedupe rule: if any pending_review row already exists whose hosts[]
// overlaps the proposed hosts, we don't create a duplicate. We return
// the existing id so the caller can link to it.
// ============================================================

const log = createLogger("host-rule-proposals");

export interface ProposedRulePayload {
  rule_id?: string | null;
  hosts?: string[] | null;
  apply_entry_hints?: string[] | null;
  submit_hints?: string[] | null;
  requires_apply_entry?: boolean | null;
  prefer_popup_handoff?: boolean | null;
  notes?: string | null;
}

export interface ApplyProposalInput {
  proposed: ProposedRulePayload;
  /** Optional fallback host (used when proposed.hosts is empty). */
  fallbackHost?: string | null;
  /** Free-text origin for the notes column, e.g. "diagnosis:abcd1234". */
  source?: string | null;
  reviewerId?: string | null;
  /** True = land as 'active'; default false = 'pending_review'. */
  autoApprove?: boolean;
}

export type ApplyProposalResult =
  | {
      ok: true;
      hostRuleId: string;
      created: boolean;     // true if we inserted; false if dedupe-matched an existing pending row
      status: "active" | "pending_review";
    }
  | { ok: false; reason: string };

function normalizeHosts(value: unknown, fallbackHost: string | null | undefined): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim().toLowerCase());
  }
  if (fallbackHost && fallbackHost.trim()) {
    return [fallbackHost.trim().toLowerCase()];
  }
  return [];
}

function normalizeHints(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

function generateRuleId(hosts: string[], source: string | null | undefined): string {
  const hostPart = (hosts[0] ?? "host").replace(/[^a-z0-9]+/gi, "_").toUpperCase();
  const sourcePart = (source ?? "auto").replace(/[^a-z0-9]+/gi, "_").toUpperCase().slice(0, 12);
  return `AUTO_${hostPart}_${sourcePart}_${Date.now().toString(36).slice(-5).toUpperCase()}`;
}

/**
 * Apply a proposed rule. Idempotent across pending_review rows with
 * overlapping hosts: returns the existing id rather than inserting.
 */
export async function applyProposedRule(
  input: ApplyProposalInput
): Promise<ApplyProposalResult> {
  const hosts = normalizeHosts(input.proposed.hosts, input.fallbackHost);
  if (hosts.length === 0) {
    return { ok: false, reason: "Proposed rule has no hosts and no fallback host." };
  }

  // Dedupe: any pending_review row whose hosts overlap?
  try {
    const { data: existing } = await supabaseAdmin
      .from("host_automation_rules")
      .select("id, hosts, status")
      .eq("status", "pending_review")
      .overlaps("hosts", hosts)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return {
        ok: true,
        hostRuleId: existing.id as string,
        created: false,
        status: "pending_review",
      };
    }
  } catch (err) {
    log.warn("dedupe query failed; continuing with insert", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const ruleIdInput =
    typeof input.proposed.rule_id === "string" && input.proposed.rule_id.trim()
      ? input.proposed.rule_id.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_")
      : generateRuleId(hosts, input.source);

  const status: "active" | "pending_review" = input.autoApprove ? "active" : "pending_review";

  const insertPayload = {
    rule_id: ruleIdInput,
    hosts,
    apply_entry_hints: normalizeHints(input.proposed.apply_entry_hints),
    submit_hints: normalizeHints(input.proposed.submit_hints),
    requires_apply_entry: Boolean(input.proposed.requires_apply_entry),
    prefer_popup_handoff: Boolean(input.proposed.prefer_popup_handoff),
    status,
    priority: 0,
    notes:
      [input.proposed.notes, input.source ? `Source: ${input.source}` : null]
        .filter(Boolean)
        .join(" — ") || null,
    reviewer_id: input.autoApprove ? input.reviewerId ?? null : null,
    decided_at: input.autoApprove ? new Date().toISOString() : null,
    created_by: input.reviewerId ?? null,
  };

  // Insert. rule_id has UNIQUE; on collision (very unlikely with the timestamp
  // suffix), bump suffix once and retry.
  let { data, error } = await supabaseAdmin
    .from("host_automation_rules")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error && /duplicate key|unique/i.test(error.message)) {
    const retryPayload = { ...insertPayload, rule_id: `${insertPayload.rule_id}_R` };
    ({ data, error } = await supabaseAdmin
      .from("host_automation_rules")
      .insert(retryPayload)
      .select("id")
      .single());
  }

  if (error || !data) {
    return {
      ok: false,
      reason: `Failed to insert host rule: ${error?.message ?? "unknown"}`,
    };
  }

  invalidateHostRulesCache();

  return {
    ok: true,
    hostRuleId: data.id as string,
    created: true,
    status,
  };
}
