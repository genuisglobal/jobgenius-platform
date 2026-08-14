import { NextResponse } from "next/server";
import { requireAM } from "@/lib/auth";
import {
  recordResolution,
  AM_RESOLUTION_ACTIONS,
  type AmResolutionAction,
} from "@/lib/am-resolutions";

/**
 * POST /api/am/resolutions
 *
 * Body:
 *   {
 *     run_id?: string,
 *     action_type: 'answered_screening' | 'clicked_button' | 'entered_otp_email' |
 *                  'entered_otp_sms' | 'uploaded_resume' | 'manual_continue' | 'other',
 *     action_value?: object (schema depends on action_type),
 *     ats_type?: string, url_host?: string, step?: string, notes?: string
 *   }
 *
 * Persists what the AM did to resolve a paused/failed run and (best-effort)
 * promotes it into learned_field_rules or host_automation_rules.
 */
export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    run_id?: unknown;
    action_type?: unknown;
    action_value?: unknown;
    ats_type?: unknown;
    url_host?: unknown;
    step?: unknown;
    notes?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const actionType =
    typeof body.action_type === "string" &&
    (AM_RESOLUTION_ACTIONS as readonly string[]).includes(body.action_type)
      ? (body.action_type as AmResolutionAction)
      : null;
  if (!actionType) {
    return NextResponse.json(
      { error: `action_type must be one of ${AM_RESOLUTION_ACTIONS.join(", ")}.` },
      { status: 400 }
    );
  }

  const result = await recordResolution({
    runId: typeof body.run_id === "string" ? body.run_id : null,
    amId: auth.user.id,
    actionType,
    actionValue:
      body.action_value && typeof body.action_value === "object" && !Array.isArray(body.action_value)
        ? (body.action_value as Record<string, unknown>)
        : {},
    atsType: typeof body.ats_type === "string" ? body.ats_type : null,
    urlHost: typeof body.url_host === "string" ? body.url_host : null,
    step: typeof body.step === "string" ? body.step : null,
    notes: typeof body.notes === "string" ? body.notes : null,
  });

  if (!result.id) {
    return NextResponse.json(
      { error: "Failed to record resolution." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      id: result.id,
      promoted_field_rule_id: result.promotedFieldRuleId,
      promoted_host_rule_id: result.promotedHostRuleId,
    },
    { status: 201 }
  );
}
