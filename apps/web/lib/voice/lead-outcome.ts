// Applies a finished Emi call to its lead: merges the answers, sets
// temperature / niche / fit score / next action, opts the number out on
// request, and queues the next call (no-answer retry, callback, follow-up).
// Exactly once per call, claimed via voice_calls.outcome_applied_at.

import { supabaseServer } from "@/lib/supabase/server";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { markVoiceOptOut } from "@/lib/voice/service";
import {
  decideLeadOutcome,
  parseEmiAnalysis,
  type LeadDecision,
  type LeadTemperature,
} from "@/lib/voice/lead-qualification";
import type { NormalizedRetellWebhookEvent } from "@/lib/voice/retell";

const NOT_CONNECTED = ["no_answer", "voicemail", "failed"];

type OutcomeLead = {
  id: string;
  status: string;
  phone: string | null;
  full_name: string | null;
  temperature: LeadTemperature | null;
  timezone: string | null;
  call_attempts: number;
  qualification: Record<string, unknown> | null;
  qualified_at: string | null;
};

type FinishedCall = {
  id: string;
  lead_submission_id: string;
  playbook_id: string | null;
  from_number: string | null;
  to_number: string;
  task: string | null;
  account_manager_id: string | null;
};

/**
 * Whether this webhook event carries the final word on the call. Connected
 * calls wait for call_analyzed (Emi's answers); unconnected ones are final
 * at call_ended because there is nothing to analyse.
 */
export function isLeadOutcomeEvent(event: NormalizedRetellWebhookEvent): boolean {
  if (event.analyzed) return true;
  return event.status != null && NOT_CONNECTED.includes(event.status);
}

export async function applyLeadCallOutcome(params: {
  call: FinishedCall;
  event: NormalizedRetellWebhookEvent;
  now?: Date;
}): Promise<LeadDecision | null> {
  const { call, event } = params;
  const now = params.now ?? new Date();
  if (!isLeadOutcomeEvent(event)) return null;

  const { data: claimed } = await supabaseServer
    .from("voice_calls")
    .update({ outcome_applied_at: now.toISOString() })
    .eq("id", call.id)
    .is("outcome_applied_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return null; // another delivery already applied it

  const { data: leadRow } = await supabaseServer
    .from("lead_intake_submissions")
    .select("id, status, phone, full_name, temperature, timezone, call_attempts, qualification, qualified_at")
    .eq("id", call.lead_submission_id)
    .maybeSingle();
  const lead = leadRow as unknown as OutcomeLead | null;
  if (!lead) return null;

  const connected = !(event.status != null && NOT_CONNECTED.includes(event.status));
  const decision = decideLeadOutcome({
    analysis: connected && event.analyzed ? parseEmiAnalysis(event.customAnalysis) : null,
    connected,
    attempts: Math.max(lead.call_attempts, 1),
    timezone: lead.timezone,
    previousTemperature: lead.temperature,
    now,
  });

  const nowIso = now.toISOString();
  const update: Record<string, unknown> = {
    qualification: { ...(lead.qualification ?? {}), ...decision.qualificationPatch },
    next_action: decision.nextAction,
    next_action_at: decision.nextActionAt?.toISOString() ?? null,
    next_call_due_at: decision.scheduleCallAt?.toISOString() ?? null,
    last_call_at: nowIso,
    updated_at: nowIso,
  };
  if (decision.temperature) update.temperature = decision.temperature;
  if (decision.niche) update.niche = decision.niche;
  if (decision.fitScore != null) update.fit_score = decision.fitScore;
  if (decision.timezone) update.timezone = decision.timezone;
  if (decision.disqualifyReason !== undefined) update.disqualify_reason = decision.disqualifyReason;
  // Never move a converted client back into the funnel.
  if (decision.status && lead.status !== "converted") update.status = decision.status;
  if ((decision.temperature === "hot" || decision.temperature === "warm") && !lead.qualified_at) {
    update.qualified_at = nowIso;
  }

  await supabaseServer.from("lead_intake_submissions").update(update).eq("id", lead.id);

  if (decision.optOut && (lead.phone || call.to_number)) {
    await markVoiceOptOut({
      phone: lead.phone ?? call.to_number,
      leadSubmissionId: lead.id,
      reason: "Asked Emi not to be called again.",
      source: "retell_webhook",
    });
  }

  if (decision.scheduleCallAt) {
    const context = !connected
      ? "retry"
      : event.customAnalysis.call_outcome === "callback_requested"
        ? "callback"
        : "follow_up";

    const { data: next } = await supabaseServer
      .from("voice_calls")
      .insert({
        provider: "retell",
        direction: "outbound",
        call_type: "lead_qualification",
        status: "queued",
        lead_submission_id: lead.id,
        account_manager_id: call.account_manager_id,
        playbook_id: call.playbook_id,
        from_number: call.from_number,
        to_number: lead.phone ?? call.to_number,
        contact_name: lead.full_name,
        task: call.task,
        next_retry_at: decision.scheduleCallAt.toISOString(),
        request_payload: { dispatch_source: "lead_outcome", call_context: context, previous_call_id: call.id },
        response_payload: {},
      })
      .select("id")
      .single();

    if (next?.id) {
      await enqueueBackgroundJob(
        "VOICE_DISPATCH",
        { voice_call_id: next.id as string, lead_submission_id: lead.id, call_type: "lead_qualification" },
        { runAt: decision.scheduleCallAt, maxAttempts: 1 }
      );
    }
  }

  return decision;
}
