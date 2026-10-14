export const OUTCOME_EVENT_TYPES = [
  "lead_captured",
  "lead_imported",
  "qualification_call_queued",
  "qualification_call_completed",
  "lead_qualified",
  "lead_nurture",
  "lead_disqualified",
  "consultation_booked",
  "consultation_completed",
  "consultation_no_show",
  "consultation_cancelled",
  "payment_confirmed",
  "client_activated",
  "application_submitted",
  "interview_scheduled",
  "interview_outcome_recorded",
  "offer_reported",
  "offer_verified",
  "placement_confirmed",
] as const;

export const OUTCOME_SOURCE_CHANNELS = [
  "marketing_form",
  "signup_intake",
  "excel_import",
  "manual_admin",
  "voice_automation",
  "billing",
  "application_runner",
  "am_portal",
  "finance",
  "system",
] as const;

export type OutcomeEventType = (typeof OUTCOME_EVENT_TYPES)[number];
export type OutcomeSourceChannel = (typeof OUTCOME_SOURCE_CHANNELS)[number];

export type JsonRecord = Record<string, unknown>;

export type ConsultationRecordStatus =
  | "booked"
  | "completed"
  | "no_show"
  | "cancelled";

export type ConsultationDecision =
  | "qualified"
  | "nurture"
  | "disqualified"
  | "defer";

export type OutcomeEventWriteInput = {
  eventType: OutcomeEventType;
  occurredAt?: string | Date | null;
  leadSubmissionId?: string | null;
  jobSeekerId?: string | null;
  consultationRecordId?: string | null;
  applicationRunId?: string | null;
  interviewId?: string | null;
  acceptedOfferRecordId?: string | null;
  paymentScreenshotId?: string | null;
  registrationPaymentId?: string | null;
  voiceCallId?: string | null;
  actorUserId?: string | null;
  actorAccountManagerId?: string | null;
  ownerAccountManagerIdSnapshot?: string | null;
  sourceChannel: OutcomeSourceChannel;
  sourceRecordType?: string | null;
  sourceRecordId?: string | null;
  eventValue?: number | null;
  currencyCode?: string | null;
  metadata?: JsonRecord | null;
};

function hasRecordKeys(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isOutcomeEventType(value: string): value is OutcomeEventType {
  return OUTCOME_EVENT_TYPES.includes(value as OutcomeEventType);
}

export function isOutcomeSourceChannel(
  value: string
): value is OutcomeSourceChannel {
  return OUTCOME_SOURCE_CHANNELS.includes(value as OutcomeSourceChannel);
}

export function normalizeOutcomeOccurredAt(
  value?: string | Date | null
): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

export function normalizeCurrencyCode(
  value?: string | null
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (!normalized) return null;
  return normalized.slice(0, 12);
}

export function compactOutcomeMetadata(
  value?: JsonRecord | null
): JsonRecord {
  if (!hasRecordKeys(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry === null || entry === undefined) return false;
      if (typeof entry === "string") return entry.trim().length > 0;
      if (Array.isArray(entry)) return entry.length > 0;
      if (hasRecordKeys(entry)) return Object.keys(entry).length > 0;
      return true;
    })
  );
}

export function resolveLeadOutcomeSourceChannel(args: {
  submissionSource?: string | null;
  metadata?: JsonRecord | null;
}): OutcomeSourceChannel {
  const submissionSource = String(args.submissionSource ?? "")
    .trim()
    .toLowerCase();
  const metadata = hasRecordKeys(args.metadata) ? args.metadata : null;

  const intakeVariant = String(metadata?.intake_variant ?? "")
    .trim()
    .toLowerCase();
  const metadataSource = String(metadata?.source ?? "")
    .trim()
    .toLowerCase();
  const submittedVia = String(metadata?.submitted_via ?? "")
    .trim()
    .toLowerCase();

  if (
    intakeVariant === "jobseeker_light_signup" ||
    submissionSource === "signup" ||
    submissionSource === "signup_form" ||
    metadataSource === "signup" ||
    metadataSource === "signup_form" ||
    submittedVia === "signup_form"
  ) {
    return "signup_intake";
  }

  if (submissionSource === "excel_import" || metadataSource === "excel_import") {
    return "excel_import";
  }

  if (submissionSource === "manual" || metadataSource === "manual") {
    return "manual_admin";
  }

  return "marketing_form";
}
