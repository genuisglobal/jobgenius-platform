// Starts Emi's first qualification call for a new lead: creates the queued
// voice call and dispatches it straight away, so a lead who just submitted a
// form hears from Emi within minutes. If the inline dispatch throws, the
// background runner picks the call up instead.

import { supabaseServer } from "@/lib/supabase/server";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { dispatchVoiceCall, type DispatchResult } from "@/lib/voice/dispatch";

type LeadQualificationPlaybook = {
  id: string;
  assistant_goal: string | null;
  system_prompt: string | null;
  max_retry_attempts: number | null;
};

async function loadLeadQualificationPlaybook(): Promise<LeadQualificationPlaybook | null> {
  const { data } = await supabaseServer
    .from("voice_playbooks")
    .select("id, assistant_goal, system_prompt, max_retry_attempts")
    .eq("call_type", "lead_qualification")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as LeadQualificationPlaybook | null) ?? null;
}

export async function startLeadQualificationCall(params: {
  leadId: string;
  phone: string;
  fullName: string | null;
  dispatchSource: string;
}): Promise<{ voiceCallId: string | null; playbookId: string | null; result: DispatchResult | "queued" | null }> {
  const playbook = await loadLeadQualificationPlaybook();
  if (!playbook) return { voiceCallId: null, playbookId: null, result: null };

  const task =
    String(playbook.assistant_goal ?? "").trim() || String(playbook.system_prompt ?? "").trim();
  if (!task) return { voiceCallId: null, playbookId: playbook.id, result: null };

  const { data: voiceCall } = await supabaseServer
    .from("voice_calls")
    .insert({
      provider: "retell",
      direction: "outbound",
      call_type: "lead_qualification",
      status: "queued",
      lead_submission_id: params.leadId,
      playbook_id: playbook.id,
      from_number: process.env.RETELL_DEFAULT_FROM_NUMBER ?? null,
      to_number: params.phone,
      contact_name: params.fullName,
      task,
      max_retries: playbook.max_retry_attempts ?? 3,
      request_payload: { dispatch_source: params.dispatchSource, call_context: "first_call" },
      response_payload: {},
    })
    .select("id")
    .single();

  const voiceCallId = (voiceCall?.id as string | undefined) ?? null;
  if (!voiceCallId) return { voiceCallId: null, playbookId: playbook.id, result: null };

  try {
    const result = await dispatchVoiceCall(voiceCallId);
    return { voiceCallId, playbookId: playbook.id, result };
  } catch (error) {
    console.error("[voice] inline lead dispatch failed; queued for the runner:", { voiceCallId, error });
    await enqueueBackgroundJob(
      "VOICE_DISPATCH",
      { voice_call_id: voiceCallId, lead_submission_id: params.leadId, call_type: "lead_qualification" },
      { maxAttempts: 1 }
    );
    return { voiceCallId, playbookId: playbook.id, result: "queued" };
  }
}
