import { NextResponse } from "next/server";
import {
  normalizeRetellWebhookPayload,
  verifyRetellWebhookSignature,
} from "@/lib/voice/retell";
import { supabaseServer } from "@/lib/supabase/server";
import { writeOutcomeEvent } from "@/lib/outcomes-server";
import {
  appendVoiceConversationNote,
  evaluateEscalation,
  findJobSeekerByPhone,
  markUpsellOptOut,
  resolveAssignedAccountManagerId,
} from "@/lib/voice/service";
import { normalizeVoiceCallType, type VoiceCallType } from "@/lib/voice/types";

type JsonRecord = Record<string, unknown>;

type VoicePlaybookJoin = {
  id: string;
  escalation_rules: unknown;
};

type VoiceCallRow = {
  id: string;
  provider_call_id: string | null;
  call_type: string;
  status: string;
  direction: string;
  job_seeker_id: string | null;
  lead_submission_id: string | null;
  account_manager_id: string | null;
  from_number: string | null;
  to_number: string;
  playbook_id: string | null;
  call_started_at?: string | null;
  voice_playbooks: VoicePlaybookJoin | VoicePlaybookJoin[] | null;
};

const VOICE_CALL_SELECT = `
  id,
  provider_call_id,
  call_type,
  status,
  direction,
  job_seeker_id,
  lead_submission_id,
  account_manager_id,
  from_number,
  to_number,
  playbook_id,
  call_started_at,
  voice_playbooks (
    id,
    escalation_rules
  )
`;

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
}

function normalizePlaybook(value: VoiceCallRow["voice_playbooks"]) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isTerminalStatus(status: string) {
  return [
    "completed",
    "failed",
    "no_answer",
    "voicemail",
    "opted_out",
    "escalated",
    "ended",
  ].includes(status);
}

function inferCallTypeFromMetadata(metadata: JsonRecord): VoiceCallType {
  return normalizeVoiceCallType(metadata.call_type) ?? "check_in";
}

async function findActivePlaybookId(callType: VoiceCallType) {
  const { data } = await supabaseServer
    .from("voice_playbooks")
    .select("id")
    .eq("call_type", callType)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.id as string | undefined) ?? null;
}

async function findVoiceCallByProviderCallId(providerCallId: string) {
  const { data, error } = await supabaseServer
    .from("voice_calls")
    .select(VOICE_CALL_SELECT)
    .eq("provider_call_id", providerCallId)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as VoiceCallRow;
}

async function maybeCreateInboundVoiceCall(params: {
  providerCallId: string | null;
  direction: "inbound" | "outbound" | null;
  fromNumber: string | null;
  toNumber: string | null;
  callType: VoiceCallType;
  status: string;
}) {
  if (!params.providerCallId || params.direction !== "inbound") {
    return null;
  }

  const seeker = params.fromNumber ? await findJobSeekerByPhone(params.fromNumber) : null;
  const accountManagerId = seeker?.id
    ? await resolveAssignedAccountManagerId(seeker.id)
    : null;
  const playbookId = await findActivePlaybookId(params.callType);

  const { data, error } = await supabaseServer
    .from("voice_calls")
    .insert({
      provider: "retell",
      provider_call_id: params.providerCallId,
      direction: "inbound",
      call_type: params.callType,
      status: params.status,
      job_seeker_id: seeker?.id ?? null,
      account_manager_id: accountManagerId,
      playbook_id: playbookId,
      from_number: params.fromNumber,
      to_number: params.toNumber ?? params.fromNumber ?? "unknown",
      request_payload: {},
      response_payload: {},
    })
    .select(VOICE_CALL_SELECT)
    .single();

  if (error || !data) {
    return null;
  }

  return data as unknown as VoiceCallRow;
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  // Fail-closed signature verification.
  if (!verifyRetellWebhookSignature(rawBody, request.headers)) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  let payload: JsonRecord;
  try {
    payload = asRecord(JSON.parse(rawBody));
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const normalized = normalizeRetellWebhookPayload(payload);

  // ----------------------------------------------------------------
  // Idempotency: insert the event first. The partial unique index on
  // (provider, provider_event_id) rejects duplicate webhook deliveries.
  // ----------------------------------------------------------------
  const { data: eventRow, error: eventError } = await supabaseServer
    .from("voice_call_events")
    .insert({
      voice_call_id: null,
      provider: "retell",
      provider_call_id: normalized.providerCallId,
      provider_event_id: normalized.providerEventId,
      event_type: normalized.eventType,
      event_status: normalized.status,
      payload,
      received_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (eventError) {
    // 23505 = unique_violation -> already processed this exact event.
    if ((eventError as { code?: string }).code === "23505") {
      return NextResponse.json({ success: true, duplicate: true });
    }
    return NextResponse.json(
      { success: false, error: "Failed to record voice event." },
      { status: 500 }
    );
  }

  const eventId = (eventRow?.id as string | undefined) ?? null;

  const fallbackStatus = normalized.status ?? "initiated";
  const callType = inferCallTypeFromMetadata(normalized.metadata);

  let voiceCall = normalized.providerCallId
    ? await findVoiceCallByProviderCallId(normalized.providerCallId)
    : null;

  if (!voiceCall) {
    voiceCall = await maybeCreateInboundVoiceCall({
      providerCallId: normalized.providerCallId,
      direction: normalized.direction,
      fromNumber: normalized.fromNumber,
      toNumber: normalized.toNumber,
      callType,
      status: fallbackStatus,
    });
  }

  // Backfill the event with its resolved voice_call_id.
  if (eventId && voiceCall?.id) {
    await supabaseServer
      .from("voice_call_events")
      .update({ voice_call_id: voiceCall.id })
      .eq("id", eventId);
  }

  if (!voiceCall) {
    return NextResponse.json({ success: true, ignored: true });
  }

  const playbook = normalizePlaybook(voiceCall.voice_playbooks);
  const normalizedCallType = normalizeVoiceCallType(voiceCall.call_type) ?? callType;
  const escalation = evaluateEscalation({
    callType: normalizedCallType,
    transcript: normalized.transcript,
    summary: normalized.summary,
    disposition: normalized.disposition,
    escalationRules: playbook?.escalation_rules,
  });

  const nowIso = new Date().toISOString();
  const newStatus = escalation.requiresEscalation
    ? "escalated"
    : (normalized.status ?? voiceCall.status ?? "initiated");

  await supabaseServer
    .from("voice_calls")
    .update({
      status: newStatus,
      summary: normalized.summary ?? undefined,
      disposition: normalized.disposition ?? undefined,
      transcript: normalized.transcript ?? undefined,
      recording_url: normalized.recordingUrl ?? undefined,
      requires_escalation: escalation.requiresEscalation,
      escalation_reason: escalation.reasons.join(", ") || null,
      response_payload: payload,
      call_started_at:
        voiceCall.call_started_at ??
        (["initiated", "ringing", "in_progress"].includes(newStatus) ? nowIso : null),
      call_ended_at: isTerminalStatus(newStatus) ? nowIso : null,
      updated_at: nowIso,
    })
    .eq("id", voiceCall.id);

  if (escalation.shouldMarkUpsellOptOut && normalized.fromNumber) {
    await markUpsellOptOut({
      phone: normalized.fromNumber,
      jobSeekerId: voiceCall.job_seeker_id,
      leadSubmissionId: voiceCall.lead_submission_id,
      reason: "User requested no upsell calls during voice conversation.",
      source: "retell_webhook",
      createdByAmId: voiceCall.account_manager_id,
    });
  }

  const shouldLogConversation =
    escalation.requiresEscalation ||
    Boolean(normalized.summary) ||
    Boolean(normalized.disposition) ||
    isTerminalStatus(newStatus);

  if (shouldLogConversation && voiceCall.job_seeker_id && voiceCall.account_manager_id) {
    await appendVoiceConversationNote({
      jobSeekerId: voiceCall.job_seeker_id,
      accountManagerId: voiceCall.account_manager_id,
      callType: normalizedCallType,
      status: newStatus,
      summary: normalized.summary,
      disposition: normalized.disposition,
      escalationReason: escalation.reasons.join(", ") || null,
      recordingUrl: normalized.recordingUrl,
      providerCallId: normalized.providerCallId,
    });
  }

  // Advance lead lifecycle for terminal lead-qualification calls.
  if (
    voiceCall.lead_submission_id &&
    normalizedCallType === "lead_qualification" &&
    isTerminalStatus(newStatus)
  ) {
    await supabaseServer
      .from("lead_intake_submissions")
      .update({ last_call_at: nowIso, updated_at: nowIso })
      .eq("id", voiceCall.lead_submission_id);

    try {
      await writeOutcomeEvent({
        eventType: "qualification_call_completed",
        occurredAt: nowIso,
        leadSubmissionId: voiceCall.lead_submission_id,
        jobSeekerId: voiceCall.job_seeker_id,
        voiceCallId: voiceCall.id,
        ownerAccountManagerIdSnapshot: voiceCall.account_manager_id,
        sourceChannel: "voice_automation",
        sourceRecordType: "voice_call_completion",
        sourceRecordId: voiceCall.id,
        metadata: {
          call_type: normalizedCallType,
          final_status: newStatus,
          disposition: normalized.disposition ?? null,
          summary_present: Boolean(normalized.summary),
          escalation_required: escalation.requiresEscalation,
          escalation_reasons: escalation.reasons,
        },
      });
    } catch (error) {
      console.error("[outcomes] qualification call completion shadow write failed:", error);
    }
  }

  return NextResponse.json({ success: true });
}
