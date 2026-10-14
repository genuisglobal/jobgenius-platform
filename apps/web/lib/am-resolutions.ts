import { supabaseAdmin } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { recordFieldClassification } from "@/lib/learned-fields";
import { applyProposedRule } from "@/lib/host-rule-proposals";

// ============================================================
// am_resolutions (migration 084).
//
// AMs resolve paused/failed runs in the dashboard. recordResolution()
// persists what they did AND tries to convert it into a learned rule:
//
//   answered_screening (label + value)
//     → learned_field_rules (source='am_fix') for (ats, host, signature).
//
//   clicked_button (button_label)
//     → host_automation_rules submit_hints proposal (pending_review).
//
// The promotions are best-effort. If they fail, the am_resolutions row
// still stands as audit + future training data.
// ============================================================

const log = createLogger("am-resolutions");

export const AM_RESOLUTION_ACTIONS = [
  "answered_screening",
  "clicked_button",
  "entered_otp_email",
  "entered_otp_sms",
  "uploaded_resume",
  "manual_continue",
  "other",
] as const;
export type AmResolutionAction = (typeof AM_RESOLUTION_ACTIONS)[number];

export interface RecordResolutionInput {
  runId: string | null;
  amId: string;
  actionType: AmResolutionAction;
  /** Structured details — schema depends on actionType (see promote*() below). */
  actionValue?: Record<string, unknown>;
  /** Pre-resolved ats/host context (otherwise we look them up from the run). */
  atsType?: string | null;
  urlHost?: string | null;
  step?: string | null;
  notes?: string | null;
}

export interface RecordResolutionResult {
  id: string | null;
  promotedFieldRuleId: string | null;
  promotedHostRuleId: string | null;
}

async function resolveRunContext(
  runId: string | null,
  atsType: string | null | undefined,
  urlHost: string | null | undefined
): Promise<{ atsType: string | null; urlHost: string | null }> {
  if (atsType && urlHost) return { atsType, urlHost };
  if (!runId) return { atsType: atsType ?? null, urlHost: urlHost ?? null };
  const { data: run } = await supabaseAdmin
    .from("application_runs")
    .select("ats_type, last_seen_url")
    .eq("id", runId)
    .maybeSingle();
  if (!run) return { atsType: atsType ?? null, urlHost: urlHost ?? null };
  let host: string | null = urlHost ?? null;
  if (!host && run.last_seen_url) {
    try {
      host = new URL(run.last_seen_url).hostname.toLowerCase();
    } catch {
      host = null;
    }
  }
  return { atsType: atsType ?? (run.ats_type as string | null), urlHost: host };
}

async function tryPromoteScreening(args: {
  resolutionId: string;
  amId: string;
  atsType: string | null;
  urlHost: string | null;
  actionValue: Record<string, unknown>;
}): Promise<string | null> {
  if (!args.atsType || !args.urlHost) return null;
  const label =
    typeof args.actionValue.label === "string" ? args.actionValue.label : null;
  const value =
    typeof args.actionValue.value === "string"
      ? args.actionValue.value
      : args.actionValue.value !== undefined
        ? String(args.actionValue.value)
        : null;
  if (!label || value === null) return null;

  const fieldType =
    typeof args.actionValue.field_type === "string" ? args.actionValue.field_type : null;
  const options =
    Array.isArray(args.actionValue.options)
      ? (args.actionValue.options as unknown[]).filter(
          (v): v is string => typeof v === "string"
        )
      : null;

  const learned = await recordFieldClassification({
    atsType: args.atsType,
    urlHost: args.urlHost,
    field: { label, type: fieldType, options },
    mapping: { kind: "static", value },
    source: "am_fix",
    confidence: 0.9,
    createdBy: args.amId,
  });
  return learned?.id ?? null;
}

async function tryPromoteClickedButton(args: {
  resolutionId: string;
  amId: string;
  atsType: string | null;
  urlHost: string | null;
  actionValue: Record<string, unknown>;
}): Promise<string | null> {
  if (!args.urlHost) return null;
  const buttonLabel =
    typeof args.actionValue.button_label === "string"
      ? args.actionValue.button_label.trim().toLowerCase()
      : null;
  if (!buttonLabel) return null;

  const result = await applyProposedRule({
    proposed: {
      hosts: [args.urlHost],
      submit_hints: [buttonLabel],
      notes: `From AM resolution ${args.resolutionId.slice(0, 8)} — clicked "${buttonLabel}"`,
    },
    fallbackHost: args.urlHost,
    source: `am_resolution:${args.resolutionId.slice(0, 8)}`,
    reviewerId: args.amId,
    autoApprove: false,
  });
  return result.ok ? result.hostRuleId : null;
}

/**
 * Persist the AM's action and (best-effort) promote it to a learned rule.
 * Never throws — promotion failures are logged but don't break the record.
 */
export async function recordResolution(
  input: RecordResolutionInput
): Promise<RecordResolutionResult> {
  const { atsType, urlHost } = await resolveRunContext(
    input.runId,
    input.atsType,
    input.urlHost
  );

  const { data, error } = await supabaseAdmin
    .from("am_resolutions")
    .insert({
      run_id: input.runId,
      am_id: input.amId,
      ats_type: atsType,
      url_host: urlHost,
      step: input.step ?? null,
      action_type: input.actionType,
      action_value: input.actionValue ?? {},
      notes: input.notes ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    log.warn("am_resolutions insert failed", {
      action: input.actionType,
      error: error?.message,
    });
    return { id: null, promotedFieldRuleId: null, promotedHostRuleId: null };
  }

  const resolutionId = data.id as string;
  let promotedFieldRuleId: string | null = null;
  let promotedHostRuleId: string | null = null;

  try {
    if (input.actionType === "answered_screening" && input.actionValue) {
      promotedFieldRuleId = await tryPromoteScreening({
        resolutionId,
        amId: input.amId,
        atsType,
        urlHost,
        actionValue: input.actionValue,
      });
    } else if (input.actionType === "clicked_button" && input.actionValue) {
      promotedHostRuleId = await tryPromoteClickedButton({
        resolutionId,
        amId: input.amId,
        atsType,
        urlHost,
        actionValue: input.actionValue,
      });
    }
  } catch (err) {
    log.warn("am_resolutions promotion threw", {
      resolutionId,
      action: input.actionType,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (promotedFieldRuleId || promotedHostRuleId) {
    await supabaseAdmin
      .from("am_resolutions")
      .update({
        promoted_field_rule_id: promotedFieldRuleId,
        promoted_host_rule_id: promotedHostRuleId,
      })
      .eq("id", resolutionId);
  }

  return { id: resolutionId, promotedFieldRuleId, promotedHostRuleId };
}
