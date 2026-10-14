import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isAdminRole, isPeopleManagerRole } from "@/lib/auth/roles";
import { writeOutcomeEvents } from "@/lib/outcomes-server";
import type {
  ConsultationDecision,
  ConsultationRecordStatus,
  OutcomeEventType,
  OutcomeEventWriteInput,
} from "@/lib/outcomes";

type ConsultationPayload = {
  id?: string;
  lead_submission_id?: string;
  owner_account_manager_id?: string | null;
  scheduled_for?: string | null;
  status?: ConsultationRecordStatus;
  decision?: ConsultationDecision | null;
  meeting_link?: string | null;
  notes?: string | null;
};

type LeadSubmissionRow = {
  id: string;
  status: string;
  owner_account_manager_id: string | null;
  linked_job_seeker_id: string | null;
};

type ExistingConsultationRow = {
  id: string;
  lead_submission_id: string | null;
  job_seeker_id: string | null;
  owner_account_manager_id: string | null;
  status: ConsultationRecordStatus;
  decision: ConsultationDecision | null;
  scheduled_for: string | null;
  completed_by_account_manager_id: string | null;
};

const VALID_STATUSES: ConsultationRecordStatus[] = [
  "booked",
  "completed",
  "no_show",
  "cancelled",
];

const VALID_DECISIONS: ConsultationDecision[] = [
  "qualified",
  "nurture",
  "disqualified",
  "defer",
];

function mapDecisionToLeadEvent(
  decision: ConsultationDecision | null
): OutcomeEventType | null {
  switch (decision) {
    case "qualified":
      return "lead_qualified";
    case "nurture":
      return "lead_nurture";
    case "disqualified":
      return "lead_disqualified";
    default:
      return null;
  }
}

function mapDecisionToLeadStatus(
  decision: ConsultationDecision | null
): "qualified" | "nurture" | "disqualified" | null {
  switch (decision) {
    case "qualified":
    case "nurture":
    case "disqualified":
      return decision;
    default:
      return null;
  }
}

function normalizeStatus(value: unknown): ConsultationRecordStatus {
  if (typeof value === "string" && VALID_STATUSES.includes(value as ConsultationRecordStatus)) {
    return value as ConsultationRecordStatus;
  }
  return "booked";
}

function normalizeDecision(value: unknown): ConsultationDecision | null {
  if (typeof value === "string" && VALID_DECISIONS.includes(value as ConsultationDecision)) {
    return value as ConsultationDecision;
  }
  return null;
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function isPrivilegedRole(role: string | null | undefined): boolean {
  return isAdminRole(role) || isPeopleManagerRole(role);
}

function canManageLead(
  actorId: string,
  actorRole: string | null | undefined,
  leadOwnerId: string | null,
  consultationOwnerId: string | null
) {
  if (isPrivilegedRole(actorRole)) return true;
  if (consultationOwnerId && consultationOwnerId === actorId) return true;
  if (leadOwnerId && leadOwnerId === actorId) return true;
  if (!leadOwnerId && !consultationOwnerId) return true;
  return false;
}

export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: ConsultationPayload;
  try {
    body = (await request.json()) as ConsultationPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const consultationId = normalizeNullableString(body.id);
  const leadSubmissionId = normalizeNullableString(body.lead_submission_id);
  const status = normalizeStatus(body.status);
  const decision = normalizeDecision(body.decision);
  const scheduledFor = normalizeNullableString(body.scheduled_for);
  const meetingLink = normalizeNullableString(body.meeting_link);
  const notes = normalizeNullableString(body.notes);
  const requestedOwnerAccountManagerId = normalizeNullableString(
    body.owner_account_manager_id
  );

  if (!consultationId && !leadSubmissionId) {
    return NextResponse.json(
      { error: "lead_submission_id is required when creating a consultation." },
      { status: 400 }
    );
  }

  const existingConsultationRes = consultationId
    ? await supabaseAdmin
        .from("consultation_records")
        .select(
          "id, lead_submission_id, job_seeker_id, owner_account_manager_id, status, decision, scheduled_for, completed_by_account_manager_id"
        )
        .eq("id", consultationId)
        .maybeSingle()
    : { data: null, error: null };

  if (existingConsultationRes.error) {
    return NextResponse.json(
      { error: existingConsultationRes.error.message || "Failed to load consultation." },
      { status: 500 }
    );
  }

  const existingConsultation = existingConsultationRes.data as ExistingConsultationRow | null;
  const effectiveLeadId = existingConsultation?.lead_submission_id ?? leadSubmissionId;

  let leadRow: LeadSubmissionRow | null = null;
  if (effectiveLeadId) {
    const { data, error } = await supabaseAdmin
      .from("lead_intake_submissions")
      .select("id, status, owner_account_manager_id, linked_job_seeker_id")
      .eq("id", effectiveLeadId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to load lead submission." },
        { status: 500 }
      );
    }
    leadRow = (data as LeadSubmissionRow | null) ?? null;
  }

  if (!leadRow) {
    return NextResponse.json({ error: "Lead submission not found." }, { status: 404 });
  }

  if (
    !canManageLead(
      auth.user.id,
      auth.user.role,
      leadRow.owner_account_manager_id,
      existingConsultation?.owner_account_manager_id ?? null
    )
  ) {
    return NextResponse.json(
      { error: "You are not authorized to manage this consultation." },
      { status: 403 }
    );
  }

  if (
    requestedOwnerAccountManagerId &&
    requestedOwnerAccountManagerId !== auth.user.id &&
    requestedOwnerAccountManagerId !== existingConsultation?.owner_account_manager_id &&
    !isPrivilegedRole(auth.user.role)
  ) {
    return NextResponse.json(
      { error: "Only privileged roles can reassign consultation ownership." },
      { status: 403 }
    );
  }

  const ownerAccountManagerId =
    requestedOwnerAccountManagerId ??
    existingConsultation?.owner_account_manager_id ??
    leadRow.owner_account_manager_id ??
    auth.user.id;
  const effectiveDecision =
    status === "completed" ? decision ?? existingConsultation?.decision ?? null : null;
  const completedByAccountManagerId =
    status === "completed"
      ? existingConsultation?.completed_by_account_manager_id ?? auth.user.id
      : null;
  const nowIso = new Date().toISOString();

  const payload = {
    lead_submission_id: leadRow.id,
    job_seeker_id: existingConsultation?.job_seeker_id ?? leadRow.linked_job_seeker_id,
    owner_account_manager_id: ownerAccountManagerId,
    scheduled_for: scheduledFor,
    status,
    decision: effectiveDecision,
    meeting_link: meetingLink,
    notes,
    booked_by_account_manager_id: consultationId ? undefined : auth.user.id,
    completed_by_account_manager_id: completedByAccountManagerId,
  };

  const result = consultationId
    ? await supabaseAdmin
        .from("consultation_records")
        .update(payload)
        .eq("id", consultationId)
        .select("*")
        .single()
    : await supabaseAdmin
        .from("consultation_records")
        .insert(payload)
        .select("*")
        .single();

  if (result.error || !result.data) {
    return NextResponse.json(
      { error: result.error?.message || "Failed to save consultation." },
      { status: 500 }
    );
  }

  const consultation = result.data as ExistingConsultationRow & {
    created_at?: string;
    updated_at?: string;
    meeting_link?: string | null;
    notes?: string | null;
  };

  const leadStatus =
    status === "completed" ? mapDecisionToLeadStatus(effectiveDecision) : null;

  const leadUpdate: Record<string, unknown> = {
    owner_account_manager_id: ownerAccountManagerId,
    updated_at: nowIso,
  };

  if (leadStatus) {
    leadUpdate.status = leadStatus;
  }

  const { error: leadUpdateError } = await supabaseAdmin
    .from("lead_intake_submissions")
    .update(leadUpdate)
    .eq("id", leadRow.id);

  if (leadUpdateError) {
    return NextResponse.json(
      { error: leadUpdateError.message || "Failed to update lead state." },
      { status: 500 }
    );
  }

  const outcomeWrites: OutcomeEventWriteInput[] = [];

  if (!consultationId) {
    outcomeWrites.push({
      eventType: "consultation_booked",
      occurredAt: nowIso,
      leadSubmissionId: leadRow.id,
      jobSeekerId: consultation.job_seeker_id,
      consultationRecordId: consultation.id,
      actorUserId: auth.user.id,
      actorAccountManagerId: auth.user.id,
      ownerAccountManagerIdSnapshot: ownerAccountManagerId,
      sourceChannel: "am_portal",
      sourceRecordType: "consultation_booked",
      sourceRecordId: consultation.id,
      metadata: {
        scheduled_for: scheduledFor,
        meeting_link: meetingLink,
      },
    });
  }

  const previousStatus = existingConsultation?.status ?? null;
  if (status === "completed" && previousStatus !== "completed") {
    outcomeWrites.push({
      eventType: "consultation_completed",
      occurredAt: nowIso,
      leadSubmissionId: leadRow.id,
      jobSeekerId: consultation.job_seeker_id,
      consultationRecordId: consultation.id,
      actorUserId: auth.user.id,
      actorAccountManagerId: auth.user.id,
      ownerAccountManagerIdSnapshot: ownerAccountManagerId,
      sourceChannel: "am_portal",
      sourceRecordType: "consultation_completed",
      sourceRecordId: consultation.id,
      metadata: {
        decision: effectiveDecision,
      },
    });
  }

  if (status === "no_show" && previousStatus !== "no_show") {
    outcomeWrites.push({
      eventType: "consultation_no_show",
      occurredAt: nowIso,
      leadSubmissionId: leadRow.id,
      jobSeekerId: consultation.job_seeker_id,
      consultationRecordId: consultation.id,
      actorUserId: auth.user.id,
      actorAccountManagerId: auth.user.id,
      ownerAccountManagerIdSnapshot: ownerAccountManagerId,
      sourceChannel: "am_portal",
      sourceRecordType: "consultation_no_show",
      sourceRecordId: consultation.id,
      metadata: {
        scheduled_for: consultation.scheduled_for,
      },
    });
  }

  if (status === "cancelled" && previousStatus !== "cancelled") {
    outcomeWrites.push({
      eventType: "consultation_cancelled",
      occurredAt: nowIso,
      leadSubmissionId: leadRow.id,
      jobSeekerId: consultation.job_seeker_id,
      consultationRecordId: consultation.id,
      actorUserId: auth.user.id,
      actorAccountManagerId: auth.user.id,
      ownerAccountManagerIdSnapshot: ownerAccountManagerId,
      sourceChannel: "am_portal",
      sourceRecordType: "consultation_cancelled",
      sourceRecordId: consultation.id,
      metadata: {
        scheduled_for: consultation.scheduled_for,
      },
    });
  }

  const previousDecision = existingConsultation?.decision ?? null;
  const leadDecisionEvent = mapDecisionToLeadEvent(effectiveDecision);
  if (
    status === "completed" &&
    effectiveDecision &&
    effectiveDecision !== previousDecision &&
    leadDecisionEvent
  ) {
    outcomeWrites.push({
      eventType: leadDecisionEvent,
      occurredAt: nowIso,
      leadSubmissionId: leadRow.id,
      jobSeekerId: consultation.job_seeker_id,
      consultationRecordId: consultation.id,
      actorUserId: auth.user.id,
      actorAccountManagerId: auth.user.id,
      ownerAccountManagerIdSnapshot: ownerAccountManagerId,
      sourceChannel: "am_portal",
      sourceRecordType: `consultation_decision_${effectiveDecision}`,
      sourceRecordId: consultation.id,
      metadata: {
        consultation_status: status,
        decision: effectiveDecision,
      },
    });
  }

  try {
    await writeOutcomeEvents(outcomeWrites);
  } catch (error) {
    console.error("[outcomes] consultation shadow writes failed:", error);
  }

  return NextResponse.json({
    consultation,
    lead_status: leadStatus ?? leadRow.status,
  });
}
