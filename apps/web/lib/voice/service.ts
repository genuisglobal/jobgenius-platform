import { supabaseServer } from "@/lib/supabase/server";
import type { VoiceCallStatus, VoiceCallType } from "@/lib/voice/types";

type JsonRecord = Record<string, unknown>;

const CALL_TYPE_LABELS: Record<VoiceCallType, string> = {
  lead_qualification: "Lead Qualification",
  onboarding: "Onboarding",
  follow_up: "Follow-up",
  discovery: "Discovery",
  check_in: "Check-in",
  interview_warmup: "Interview Warm-up",
  upsell_retention: "Upsell / Retention",
};

export type VoiceEscalationDecision = {
  requiresEscalation: boolean;
  reasons: string[];
  shouldMarkUpsellOptOut: boolean;
};

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
}

function normalizeEscalationRules(value: unknown): JsonRecord {
  return asRecord(value);
}

function getRule(value: JsonRecord, key: string, fallback = true) {
  const raw = value[key];
  if (typeof raw === "boolean") return raw;
  return fallback;
}

export function normalizePhone(value: string | null | undefined): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  return trimmed.startsWith("+") ? trimmed : `+${digits}`;
}

export function phoneCandidates(value: string | null | undefined): string[] {
  const original = String(value ?? "").trim();
  const normalized = normalizePhone(value);
  const digits = original.replace(/\D/g, "");
  return Array.from(new Set([original, normalized, digits].filter(Boolean)));
}

export async function resolveAssignedAccountManagerId(jobSeekerId: string) {
  const { data } = await supabaseServer
    .from("job_seeker_assignments")
    .select("account_manager_id")
    .eq("job_seeker_id", jobSeekerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.account_manager_id) {
    return data.account_manager_id as string;
  }

  const { data: fallbackAdmin } = await supabaseServer
    .from("account_managers")
    .select("id")
    .in("role", ["admin", "superadmin"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (fallbackAdmin?.id as string | undefined) ?? null;
}

export async function findJobSeekerByPhone(phone: string) {
  const candidates = phoneCandidates(phone);
  if (candidates.length === 0) return null;

  const { data: exactRows } = await supabaseServer
    .from("job_seekers")
    .select("id, phone")
    .in("phone", candidates)
    .limit(1);

  if (exactRows && exactRows[0]?.id) {
    return {
      id: exactRows[0].id as string,
      phone: (exactRows[0].phone as string | null) ?? null,
    };
  }

  return null;
}

export async function isUpsellOptedOut(phone: string): Promise<boolean> {
  const candidates = phoneCandidates(phone);
  if (candidates.length === 0) return false;

  const { data } = await supabaseServer
    .from("voice_opt_outs")
    .select("id")
    .eq("active", true)
    .in("scope", ["upsell_only", "all_voice"])
    .in("phone_number", candidates)
    .limit(1)
    .maybeSingle();

  return Boolean(data?.id);
}

export async function markUpsellOptOut(params: {
  phone: string;
  jobSeekerId?: string | null;
  leadSubmissionId?: string | null;
  reason?: string | null;
  source?: string;
  createdByAmId?: string | null;
}) {
  const normalizedPhone = normalizePhone(params.phone);
  if (!normalizedPhone) return null;

  const { data: existing } = await supabaseServer
    .from("voice_opt_outs")
    .select("id")
    .eq("phone_number", normalizedPhone)
    .eq("scope", "upsell_only")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return existing.id as string;
  }

  const { data } = await supabaseServer
    .from("voice_opt_outs")
    .insert({
      phone_number: normalizedPhone,
      scope: "upsell_only",
      reason: params.reason ?? "User requested no upsell calls.",
      source: params.source ?? "voice_call",
      active: true,
      job_seeker_id: params.jobSeekerId ?? null,
      lead_submission_id: params.leadSubmissionId ?? null,
      created_by_am_id: params.createdByAmId ?? null,
    })
    .select("id")
    .maybeSingle();

  return (data?.id as string | undefined) ?? null;
}

function buildConversationSubject(callType: VoiceCallType) {
  return `Voice Calls: ${CALL_TYPE_LABELS[callType]}`;
}

export async function appendVoiceConversationNote(params: {
  jobSeekerId: string;
  accountManagerId: string;
  callType: VoiceCallType;
  status: VoiceCallStatus | string;
  summary?: string | null;
  disposition?: string | null;
  escalationReason?: string | null;
  recordingUrl?: string | null;
  providerCallId?: string | null;
}) {
  const subject = buildConversationSubject(params.callType);

  const { data: existing } = await supabaseServer
    .from("conversations")
    .select("id")
    .eq("job_seeker_id", params.jobSeekerId)
    .eq("account_manager_id", params.accountManagerId)
    .eq("subject", subject)
    .eq("status", "open")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  let conversationId = (existing?.id as string | undefined) ?? null;

  if (!conversationId) {
    const { data: created } = await supabaseServer
      .from("conversations")
      .insert({
        job_seeker_id: params.jobSeekerId,
        account_manager_id: params.accountManagerId,
        conversation_type: "general",
        subject,
        status: "open",
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("id")
      .single();
    conversationId = (created?.id as string | undefined) ?? null;
  }

  if (!conversationId) return null;

  const lines = [
    `Voice call update (${CALL_TYPE_LABELS[params.callType]}).`,
    `Status: ${params.status}.`,
  ];
  if (params.summary) lines.push(`Summary: ${params.summary}`);
  if (params.disposition) lines.push(`Disposition: ${params.disposition}`);
  if (params.escalationReason) lines.push(`Escalation: ${params.escalationReason}`);
  if (params.providerCallId) lines.push(`Provider Call ID: ${params.providerCallId}`);
  if (params.recordingUrl) lines.push(`Recording: ${params.recordingUrl}`);

  const content = lines.join("\n");

  await supabaseServer.from("conversation_messages").insert({
    conversation_id: conversationId,
    sender_type: "system",
    sender_id: params.accountManagerId,
    content,
    is_answer: false,
    attachments: [],
  });

  await supabaseServer
    .from("conversations")
    .update({ updated_at: nowIso })
    .eq("id", conversationId);

  return conversationId;
}

export function evaluateEscalation(params: {
  callType: VoiceCallType;
  transcript?: string | null;
  summary?: string | null;
  disposition?: string | null;
  escalationRules?: unknown;
}): VoiceEscalationDecision {
  const combinedText = `${params.summary ?? ""}\n${params.disposition ?? ""}\n${params.transcript ?? ""}`.toLowerCase();
  const rules = normalizeEscalationRules(params.escalationRules);
  const reasons: string[] = [];

  const complianceHit = /(do not call|don't call|stop calling|remove me|complaint|legal|lawyer|lawsuit)/i.test(combinedText);
  const paymentHardshipHit = /(can't afford|cannot afford|financial hardship|payment plan|cannot pay|can't pay)/i.test(combinedText);
  const hostileHit = /(idiot|stupid|f\*{2,}|fuck|shit|asshole|abusive)/i.test(combinedText);
  const humanRequestHit = /(human|real person|account manager|agent|someone from your team)/i.test(combinedText);

  if (complianceHit && getRule(rules, "compliance", true)) reasons.push("compliance_concern");
  if (paymentHardshipHit && getRule(rules, "payment_hardship", true)) reasons.push("payment_hardship");
  if (hostileHit && getRule(rules, "hostile_sentiment", true)) reasons.push("hostile_sentiment");
  if (humanRequestHit && getRule(rules, "human_request", true)) reasons.push("human_requested");

  const shouldMarkUpsellOptOut =
    params.callType === "upsell_retention" &&
    /(do not call|don't call|stop calling|no upsell|no sales)/i.test(combinedText);

  return {
    requiresEscalation: reasons.length > 0,
    reasons,
    shouldMarkUpsellOptOut,
  };
}
