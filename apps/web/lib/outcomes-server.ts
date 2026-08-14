import { supabaseAdmin } from "@/lib/auth";
import {
  compactOutcomeMetadata,
  normalizeCurrencyCode,
  normalizeOutcomeOccurredAt,
  type JsonRecord,
  type OutcomeEventWriteInput,
} from "@/lib/outcomes";

type AccountManagerAssignmentRow = {
  account_manager_id: string | null;
};

type LeadSubmissionOwnerRow = {
  owner_account_manager_id: string | null;
  linked_job_seeker_id: string | null;
};

type ConsultationOwnerRow = {
  owner_account_manager_id: string | null;
  job_seeker_id: string | null;
  lead_submission_id: string | null;
};

type ApplicationRunOwnerRow = {
  job_seeker_id: string | null;
};

type InterviewOwnerRow = {
  account_manager_id: string | null;
  job_seeker_id: string | null;
};

type AcceptedOfferOwnerRow = {
  assigned_account_manager_id: string | null;
  job_seeker_id: string | null;
};

type PaymentScreenshotOwnerRow = {
  job_seeker_id: string | null;
};

type VoiceCallOwnerRow = {
  account_manager_id: string | null;
  job_seeker_id: string | null;
  lead_submission_id: string | null;
};

export class OutcomeWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutcomeWriteError";
  }
}

async function getAssignedAccountManagerId(
  jobSeekerId: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("account_manager_id")
    .eq("job_seeker_id", jobSeekerId)
    .maybeSingle();

  if (error) {
    throw new OutcomeWriteError(error.message);
  }

  return (data as AccountManagerAssignmentRow | null)?.account_manager_id ?? null;
}

async function resolveLeadSubmissionOwner(
  leadSubmissionId: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("lead_intake_submissions")
    .select("owner_account_manager_id, linked_job_seeker_id")
    .eq("id", leadSubmissionId)
    .maybeSingle();

  if (error) {
    throw new OutcomeWriteError(error.message);
  }

  const row = data as LeadSubmissionOwnerRow | null;

  if (row?.owner_account_manager_id) {
    return row.owner_account_manager_id;
  }

  if (row?.linked_job_seeker_id) {
    return getAssignedAccountManagerId(row.linked_job_seeker_id);
  }

  return null;
}

async function resolveConsultationOwner(
  consultationRecordId: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("consultation_records")
    .select("owner_account_manager_id, job_seeker_id, lead_submission_id")
    .eq("id", consultationRecordId)
    .maybeSingle();

  if (error) {
    throw new OutcomeWriteError(error.message);
  }

  const row = data as ConsultationOwnerRow | null;

  if (row?.owner_account_manager_id) {
    return row.owner_account_manager_id;
  }

  if (row?.job_seeker_id) {
    return getAssignedAccountManagerId(row.job_seeker_id);
  }

  if (row?.lead_submission_id) {
    return resolveLeadSubmissionOwner(row.lead_submission_id);
  }

  return null;
}

async function resolveApplicationRunOwner(
  applicationRunId: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("application_runs")
    .select("job_seeker_id")
    .eq("id", applicationRunId)
    .maybeSingle();

  if (error) {
    throw new OutcomeWriteError(error.message);
  }

  const row = data as ApplicationRunOwnerRow | null;
  if (!row?.job_seeker_id) return null;
  return getAssignedAccountManagerId(row.job_seeker_id);
}

async function resolveInterviewOwner(
  interviewId: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("interviews")
    .select("account_manager_id, job_seeker_id")
    .eq("id", interviewId)
    .maybeSingle();

  if (error) {
    throw new OutcomeWriteError(error.message);
  }

  const row = data as InterviewOwnerRow | null;

  if (row?.account_manager_id) {
    return row.account_manager_id;
  }

  if (row?.job_seeker_id) {
    return getAssignedAccountManagerId(row.job_seeker_id);
  }

  return null;
}

async function resolveAcceptedOfferOwner(
  acceptedOfferRecordId: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("accepted_offer_records")
    .select("assigned_account_manager_id, job_seeker_id")
    .eq("id", acceptedOfferRecordId)
    .maybeSingle();

  if (error) {
    throw new OutcomeWriteError(error.message);
  }

  const row = data as AcceptedOfferOwnerRow | null;

  if (row?.assigned_account_manager_id) {
    return row.assigned_account_manager_id;
  }

  if (row?.job_seeker_id) {
    return getAssignedAccountManagerId(row.job_seeker_id);
  }

  return null;
}

async function resolvePaymentScreenshotOwner(
  paymentScreenshotId: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("payment_screenshots")
    .select("job_seeker_id")
    .eq("id", paymentScreenshotId)
    .maybeSingle();

  if (error) {
    throw new OutcomeWriteError(error.message);
  }

  const row = data as PaymentScreenshotOwnerRow | null;
  if (!row?.job_seeker_id) return null;
  return getAssignedAccountManagerId(row.job_seeker_id);
}

async function resolveVoiceCallOwner(
  voiceCallId: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("voice_calls")
    .select("account_manager_id, job_seeker_id, lead_submission_id")
    .eq("id", voiceCallId)
    .maybeSingle();

  if (error) {
    throw new OutcomeWriteError(error.message);
  }

  const row = data as VoiceCallOwnerRow | null;

  if (row?.account_manager_id) {
    return row.account_manager_id;
  }

  if (row?.job_seeker_id) {
    return getAssignedAccountManagerId(row.job_seeker_id);
  }

  if (row?.lead_submission_id) {
    return resolveLeadSubmissionOwner(row.lead_submission_id);
  }

  return null;
}

async function resolveOwnerAccountManagerSnapshot(
  input: OutcomeEventWriteInput
): Promise<string | null> {
  if (typeof input.ownerAccountManagerIdSnapshot !== "undefined") {
    return input.ownerAccountManagerIdSnapshot ?? null;
  }

  if (input.jobSeekerId) {
    return getAssignedAccountManagerId(input.jobSeekerId);
  }

  if (input.leadSubmissionId) {
    return resolveLeadSubmissionOwner(input.leadSubmissionId);
  }

  if (input.consultationRecordId) {
    return resolveConsultationOwner(input.consultationRecordId);
  }

  if (input.applicationRunId) {
    return resolveApplicationRunOwner(input.applicationRunId);
  }

  if (input.interviewId) {
    return resolveInterviewOwner(input.interviewId);
  }

  if (input.acceptedOfferRecordId) {
    return resolveAcceptedOfferOwner(input.acceptedOfferRecordId);
  }

  if (input.paymentScreenshotId) {
    return resolvePaymentScreenshotOwner(input.paymentScreenshotId);
  }

  if (input.voiceCallId) {
    return resolveVoiceCallOwner(input.voiceCallId);
  }

  return null;
}

function toInsertMetadata(
  metadata: JsonRecord | null | undefined
): JsonRecord {
  return compactOutcomeMetadata(metadata);
}

export async function writeOutcomeEvent(
  input: OutcomeEventWriteInput
): Promise<{ inserted: boolean; id: string | null }> {
  const ownerAccountManagerIdSnapshot =
    await resolveOwnerAccountManagerSnapshot(input);

  const payload = {
    event_type: input.eventType,
    occurred_at: normalizeOutcomeOccurredAt(input.occurredAt),
    lead_submission_id: input.leadSubmissionId ?? null,
    job_seeker_id: input.jobSeekerId ?? null,
    consultation_record_id: input.consultationRecordId ?? null,
    application_run_id: input.applicationRunId ?? null,
    interview_id: input.interviewId ?? null,
    accepted_offer_record_id: input.acceptedOfferRecordId ?? null,
    payment_screenshot_id: input.paymentScreenshotId ?? null,
    registration_payment_id: input.registrationPaymentId ?? null,
    voice_call_id: input.voiceCallId ?? null,
    actor_user_id: input.actorUserId ?? null,
    actor_account_manager_id: input.actorAccountManagerId ?? null,
    owner_account_manager_id_snapshot: ownerAccountManagerIdSnapshot,
    source_channel: input.sourceChannel,
    source_record_type: input.sourceRecordType ?? null,
    source_record_id: input.sourceRecordId ?? null,
    event_value: input.eventValue ?? null,
    currency_code: normalizeCurrencyCode(input.currencyCode),
    metadata: toInsertMetadata(input.metadata),
  };

  const { data, error } = await supabaseAdmin
    .from("outcome_events")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { inserted: false, id: null };
    }
    throw new OutcomeWriteError(error.message);
  }

  return {
    inserted: true,
    id: (data?.id as string | undefined) ?? null,
  };
}

export async function writeOutcomeEvents(
  inputs: OutcomeEventWriteInput[]
): Promise<Array<{ inserted: boolean; id: string | null }>> {
  const results: Array<{ inserted: boolean; id: string | null }> = [];

  for (const input of inputs) {
    results.push(await writeOutcomeEvent(input));
  }

  return results;
}
