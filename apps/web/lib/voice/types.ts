export const VOICE_CALL_TYPES = [
  "lead_qualification",
  "onboarding",
  "follow_up",
  "discovery",
  "check_in",
  "interview_warmup",
  "upsell_retention",
] as const;

export type VoiceCallType = (typeof VOICE_CALL_TYPES)[number];

export const VOICE_CALL_STATUSES = [
  "queued",
  "initiated",
  "ringing",
  "in_progress",
  "ended",
  "completed",
  "failed",
  "no_answer",
  "voicemail",
  "opted_out",
  "escalated",
  "cancelled",
] as const;

export type VoiceCallStatus = (typeof VOICE_CALL_STATUSES)[number];

export function isVoiceCallType(value: unknown): value is VoiceCallType {
  return typeof value === "string" && (VOICE_CALL_TYPES as readonly string[]).includes(value);
}

export function normalizeVoiceCallType(value: unknown): VoiceCallType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if ((VOICE_CALL_TYPES as readonly string[]).includes(normalized)) {
    return normalized as VoiceCallType;
  }
  return null;
}
