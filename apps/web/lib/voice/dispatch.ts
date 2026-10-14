// Places one queued outbound voice call through Retell. Shared by the
// background job runner (VOICE_DISPATCH / VOICE_RETRY / VOICE_FOLLOWUP) and
// the marketing lead route, which dispatches inline so website leads hear
// from Emi within minutes instead of waiting for the next scheduled run.

import { supabaseServer } from "@/lib/supabase/server";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { createRetellPhoneCall } from "@/lib/voice/retell";
import {
  appendVoiceConversationNote,
  isUpsellOptedOut,
  isVoiceOptedOut,
} from "@/lib/voice/service";
import { normalizeVoiceCallType, type VoiceCallType } from "@/lib/voice/types";
import { isWithinCallingWindow, nextCallingTime } from "@/lib/voice/calling-window";
import {
  buildLeadCallBrief,
  type BriefLead,
  type BriefPriorCall,
  type CallContext,
} from "@/lib/voice/lead-brief";

function resolveFlag(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
}

type VoicePlaybookJoin = {
  id: string;
  pathway_id: string | null;
  retell_agent_id: string | null;
  system_prompt: string | null;
  assistant_goal: string | null;
  max_retry_attempts: number | null;
  retry_backoff_minutes: number | null;
  metadata: unknown;
  escalation_rules: unknown;
};

type VoiceCallRow = {
  id: string;
  status: string;
  direction: string;
  call_type: string;
  job_seeker_id: string | null;
  lead_submission_id: string | null;
  account_manager_id: string | null;
  to_number: string;
  from_number: string | null;
  contact_name: string | null;
  retry_count: number | null;
  max_retries: number | null;
  task: string | null;
  request_payload: unknown;
  provider_call_id: string | null;
  voice_playbooks: VoicePlaybookJoin | VoicePlaybookJoin[] | null;
};

type DispatchLead = BriefLead & {
  id: string;
  status: string;
  consent_voice: boolean;
  handled_by: string;
  timezone: string | null;
};

const LEAD_SELECT =
  "id, status, consent_voice, handled_by, timezone, full_name, source, location, target_roles, notes, agent_background, qualification, metadata, call_attempts, next_action, created_at";

function resolveAppBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.endsWith("/") ? configured.slice(0, -1) : configured;
  }
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (!vercelUrl) return null;
  const withProtocol = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
  return withProtocol.endsWith("/") ? withProtocol.slice(0, -1) : withProtocol;
}

function resolveVoiceWebhookUrl() {
  const base = resolveAppBaseUrl();
  if (!base) return null;
  return `${base}/api/voice/webhook/retell`;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizePlaybook(value: VoiceCallRow["voice_playbooks"]) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function scheduleVoiceRetry(voiceCallId: string, runAt: Date) {
  await enqueueBackgroundJob("VOICE_RETRY", { voice_call_id: voiceCallId }, { runAt, maxAttempts: 1 });
}

async function setCallStatus(id: string, status: string, extra: Record<string, unknown> = {}) {
  const nowIso = new Date().toISOString();
  await supabaseServer
    .from("voice_calls")
    .update({ status, updated_at: nowIso, ...extra })
    .eq("id", id);
}

/** Why a lead must not be called right now, or null when Emi may call. */
function leadCallBlocker(lead: DispatchLead): string | null {
  if (!lead.consent_voice) return "Lead has not given voice consent.";
  if (lead.handled_by === "founder") return "Lead is handled by the founder directly.";
  if (lead.status === "disqualified" || lead.status === "converted") {
    return `Lead is ${lead.status}.`;
  }
  return null;
}

async function loadPriorCalls(leadId: string, excludeCallId: string): Promise<BriefPriorCall[]> {
  const { data } = await supabaseServer
    .from("voice_calls")
    .select("created_at, status, summary")
    .eq("lead_submission_id", leadId)
    .neq("id", excludeCallId)
    .not("summary", "is", null)
    .order("created_at", { ascending: false })
    .limit(3);
  return (data ?? []) as BriefPriorCall[];
}

function resolveCallContext(lead: DispatchLead, requestPayload: Record<string, unknown>): CallContext {
  const requested = requestPayload.call_context;
  if (requested === "retry" || requested === "callback" || requested === "follow_up") {
    return requested;
  }
  return lead.call_attempts > 0 ? "retry" : "first_call";
}

export type DispatchResult =
  | "dispatched"
  | "skipped"
  | "deferred"
  | "cancelled"
  | "disabled"
  | "retry_scheduled"
  | "failed";

export async function dispatchVoiceCall(voiceCallId: string): Promise<DispatchResult> {
  const { data: row, error } = await supabaseServer
    .from("voice_calls")
    .select(`
      id,
      status,
      direction,
      call_type,
      job_seeker_id,
      lead_submission_id,
      account_manager_id,
      to_number,
      from_number,
      contact_name,
      retry_count,
      max_retries,
      task,
      request_payload,
      provider_call_id,
      voice_playbooks (
        id,
        pathway_id,
        retell_agent_id,
        system_prompt,
        assistant_goal,
        max_retry_attempts,
        retry_backoff_minutes,
        metadata,
        escalation_rules
      )
    `)
    .eq("id", voiceCallId)
    .single();

  if (error || !row) {
    throw new Error("Voice call row not found.");
  }

  const voiceCall = row as unknown as VoiceCallRow;
  const playbook = normalizePlaybook(voiceCall.voice_playbooks);
  const callType = normalizeVoiceCallType(voiceCall.call_type);

  if (!callType) {
    throw new Error(`Invalid voice call type: ${voiceCall.call_type}`);
  }

  if (voiceCall.direction !== "outbound") {
    return "skipped";
  }

  // Only queued calls are dispatchable. The inline (lead route) and scheduled
  // (background job) paths can both reach the same call; the claim below makes
  // sure exactly one of them places it.
  if (voiceCall.status !== "queued") {
    return "skipped";
  }

  if (!resolveFlag("RETELL_OUTBOUND_ENABLED", false)) {
    await setCallStatus(voiceCall.id, "failed", {
      response_payload: {
        error: "Retell outbound calling is disabled. Set RETELL_OUTBOUND_ENABLED=true.",
        failed_at: new Date().toISOString(),
      },
    });

    if (voiceCall.job_seeker_id && voiceCall.account_manager_id) {
      await appendVoiceConversationNote({
        jobSeekerId: voiceCall.job_seeker_id,
        accountManagerId: voiceCall.account_manager_id,
        callType: callType as VoiceCallType,
        status: "failed",
        summary: "Voice call not sent because RETELL_OUTBOUND_ENABLED is false.",
      });
    }
    return "disabled";
  }

  if (await isVoiceOptedOut(voiceCall.to_number)) {
    await setCallStatus(voiceCall.id, "opted_out");
    return "cancelled";
  }

  if (callType === "upsell_retention" && (await isUpsellOptedOut(voiceCall.to_number))) {
    await setCallStatus(voiceCall.id, "opted_out");
    return "cancelled";
  }

  const requestPayload = asRecord(voiceCall.request_payload);
  const task =
    String(voiceCall.task ?? "").trim() ||
    String(playbook?.assistant_goal ?? "").trim() ||
    String(playbook?.system_prompt ?? "").trim();

  if (!task) {
    throw new Error("Voice task/prompt is required before dispatch.");
  }

  // Lead-qualification calls (Emi): consent, ownership, calling hours, brief.
  let lead: DispatchLead | null = null;
  let briefVariables: Record<string, string> = {};
  if (callType === "lead_qualification" && voiceCall.lead_submission_id) {
    const { data: leadRow } = await supabaseServer
      .from("lead_intake_submissions")
      .select(LEAD_SELECT)
      .eq("id", voiceCall.lead_submission_id)
      .maybeSingle();
    lead = (leadRow as unknown as DispatchLead | null) ?? null;

    if (!lead) {
      await setCallStatus(voiceCall.id, "cancelled", {
        response_payload: { error: "Lead no longer exists." },
      });
      return "cancelled";
    }

    const blocker = leadCallBlocker(lead);
    if (blocker) {
      await setCallStatus(voiceCall.id, "cancelled", { response_payload: { cancelled_reason: blocker } });
      return "cancelled";
    }

    const now = new Date();
    if (!isWithinCallingWindow(now, lead.timezone)) {
      const runAt = nextCallingTime(now, lead.timezone);
      await setCallStatus(voiceCall.id, "queued", { next_retry_at: runAt.toISOString() });
      await scheduleVoiceRetry(voiceCall.id, runAt);
      return "deferred";
    }

    briefVariables = buildLeadCallBrief({
      lead,
      priorCalls: await loadPriorCalls(lead.id, voiceCall.id),
      context: resolveCallContext(lead, requestPayload),
      now,
    });
  }

  // Claim: queued → initiated, only if still queued.
  const nowIso = new Date().toISOString();
  const { data: claimed } = await supabaseServer
    .from("voice_calls")
    .update({ status: "initiated", updated_at: nowIso })
    .eq("id", voiceCall.id)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();
  if (!claimed) {
    return "skipped";
  }

  try {
    const result = await createRetellPhoneCall({
      toNumber: voiceCall.to_number,
      fromNumber: voiceCall.from_number,
      agentId: playbook?.retell_agent_id ?? null,
      dynamicVariables: {
        contact_name: voiceCall.contact_name ?? undefined,
        call_type: callType,
        task,
        ...briefVariables,
      },
      metadata: {
        voice_call_id: voiceCall.id,
        call_type: callType,
        job_seeker_id: voiceCall.job_seeker_id,
        lead_submission_id: voiceCall.lead_submission_id,
        account_manager_id: voiceCall.account_manager_id,
        webhook_url: resolveVoiceWebhookUrl(),
        ...(requestPayload.request_data && typeof requestPayload.request_data === "object"
          ? (requestPayload.request_data as Record<string, unknown>)
          : {}),
      },
    });

    await supabaseServer
      .from("voice_calls")
      .update({
        status: "initiated",
        provider_call_id: result.providerCallId ?? voiceCall.provider_call_id,
        request_payload: {
          ...requestPayload,
          dispatch_started_at: nowIso,
        },
        response_payload: result.raw,
        call_started_at: nowIso,
        next_retry_at: null,
        updated_at: nowIso,
      })
      .eq("id", voiceCall.id);

    if (lead) {
      await supabaseServer
        .from("lead_intake_submissions")
        .update({
          call_attempts: lead.call_attempts + 1,
          last_call_at: nowIso,
          next_call_due_at: null,
          updated_at: nowIso,
        })
        .eq("id", lead.id);
    }

    if (voiceCall.job_seeker_id && voiceCall.account_manager_id) {
      await appendVoiceConversationNote({
        jobSeekerId: voiceCall.job_seeker_id,
        accountManagerId: voiceCall.account_manager_id,
        callType: callType as VoiceCallType,
        status: "initiated",
        summary: "Automated voice call initiated.",
        providerCallId: result.providerCallId,
      });
    }
    return "dispatched";
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown voice dispatch error.";
    const currentRetry = voiceCall.retry_count ?? 0;
    const maxRetries = Math.max(voiceCall.max_retries ?? playbook?.max_retry_attempts ?? 3, 0);
    const nextRetryCount = currentRetry + 1;

    if (nextRetryCount <= maxRetries) {
      const backoffMinutes = Math.max(playbook?.retry_backoff_minutes ?? 120, 1);
      const retryAt = new Date(Date.now() + backoffMinutes * 60 * 1000);
      await setCallStatus(voiceCall.id, "queued", {
        retry_count: nextRetryCount,
        next_retry_at: retryAt.toISOString(),
        response_payload: { error: detail, failed_at: nowIso, retry_count: nextRetryCount },
      });
      await scheduleVoiceRetry(voiceCall.id, retryAt);
      return "retry_scheduled";
    }

    await setCallStatus(voiceCall.id, "failed", {
      retry_count: nextRetryCount,
      next_retry_at: null,
      response_payload: { error: detail, failed_at: nowIso, retry_count: nextRetryCount },
    });

    if (voiceCall.job_seeker_id && voiceCall.account_manager_id) {
      await appendVoiceConversationNote({
        jobSeekerId: voiceCall.job_seeker_id,
        accountManagerId: voiceCall.account_manager_id,
        callType: callType as VoiceCallType,
        status: "failed",
        summary: `Voice call failed after retries: ${detail}`,
      });
    }
    return "failed";
  }
}
