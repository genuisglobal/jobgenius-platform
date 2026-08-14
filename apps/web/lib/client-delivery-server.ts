import { supabaseAdmin } from "@/lib/auth";
import { isAdminRole, isPeopleManagerRole } from "@/lib/auth/roles";
import {
  buildClientDeliveryBoardSummary,
  calculateDaysSinceTimestamp,
  compareClientDeliverySnapshots,
  type ClientDeliveryActionType,
  type ClientDeliveryCaseBundle,
  type ClientDeliveryBlockerRecord,
  type ClientDeliveryBlockerStatus,
  type ClientDeliveryBlockerType,
  type ClientDeliveryBoardSummary,
  type ClientDeliveryCaseRecord,
  type ClientDeliveryEscalationReason,
  type ClientDeliveryEscalationRecord,
  type ClientDeliveryEscalationStatus,
  type ClientDeliveryHealthBand,
  type ClientDeliveryRiskLevel,
  type ClientDeliverySnapshotRecord,
  type ClientDeliveryStage,
  type ClientDeliveryStaleStatus,
} from "@/lib/client-delivery";
import {
  computeDeliveryHealthScore,
  deriveBlockerAgeDays,
  deriveBlockerDueState,
  deriveDeliveryHealthBand,
  deriveDeliveryNeedsManagerReview,
  deriveDeliveryStaleStatus,
  DELIVERY_CRITICAL_BLOCKER_OVERDUE_DAYS,
  DELIVERY_HIGH_RISK_REVIEW_DAYS,
  DELIVERY_PAUSED_STALE_DAYS,
  DELIVERY_PAUSED_WARNING_DAYS,
  DELIVERY_SEVERE_STALE_DAYS,
  DELIVERY_STALE_DAYS,
  DELIVERY_STALE_WARNING_DAYS,
  type DeliveryBlockerDueState,
} from "@/lib/delivery-sla";

type DeliverySnapshotRow = {
  case_id: string | null;
  job_seeker_id: string;
  account_manager_id: string | null;
  full_name: string | null;
  email: string | null;
  location: string | null;
  seniority: string | null;
  target_titles: string[] | null;
  intake_status: string | null;
  work_started: boolean | null;
  payment_status: string | null;
  amount_paid: number | string | null;
  total_amount: number | string | null;
  payment_deadline: string | null;
  system_stage: ClientDeliveryStage;
  effective_stage: ClientDeliveryStage;
  stage_override: ClientDeliveryStage | null;
  risk_level: ClientDeliveryRiskLevel;
  paused: boolean | null;
  last_application_at: string | null;
  applications_7d: number | null;
  applications_30d: number | null;
  open_application_runs: number | null;
  open_queue_count: number | null;
  last_outreach_at: string | null;
  next_follow_up_at: string | null;
  active_thread_count: number | null;
  follow_ups_due_count: number | null;
  next_interview_at: string | null;
  open_interview_count: number | null;
  prep_count: number | null;
  last_offer_at: string | null;
  has_open_offer: boolean | null;
  has_placed_offer: boolean | null;
  next_start_date: string | null;
  has_payment_hold: boolean | null;
  has_active_escalation: boolean | null;
  active_blocker_count: number | null;
  active_blocker_titles: string[] | null;
  next_action_type: ClientDeliveryActionType | null;
  next_action_title: string | null;
  next_action_notes: string | null;
  next_action_due_at: string | null;
  next_action_completed_at: string | null;
  next_action_completed_by: string | null;
  manager_notes: string | null;
  last_manual_review_at: string | null;
  overdue_next_action: boolean | null;
  last_touch_at: string;
  days_since_last_touch: number | null;
  needs_attention: boolean | null;
  case_created_at: string | null;
  case_updated_at: string | null;
};

type ClientDeliveryCaseRow = {
  id: string;
  job_seeker_id: string;
  account_manager_id: string | null;
  stage_override: ClientDeliveryStage | null;
  risk_level: ClientDeliveryRiskLevel;
  paused: boolean;
  escalation_status: ClientDeliveryEscalationStatus;
  escalated_at: string | null;
  escalated_by_account_manager_id: string | null;
  manager_reviewed_at: string | null;
  manager_reviewed_by_account_manager_id: string | null;
  next_action_type: ClientDeliveryActionType | null;
  next_action_title: string | null;
  next_action_notes: string | null;
  next_action_due_at: string | null;
  next_action_completed_at: string | null;
  next_action_completed_by: string | null;
  manager_notes: string | null;
  last_manual_review_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ClientDeliveryBlockerRow = {
  id: string;
  case_id: string;
  blocker_type: ClientDeliveryBlockerType;
  status: ClientDeliveryBlockerStatus;
  title: string;
  description: string | null;
  owner_account_manager_id: string | null;
  due_at: string | null;
  escalated: boolean | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ClientDeliveryEscalationRow = {
  id: string;
  delivery_case_id: string;
  job_seeker_id: string;
  status: ClientDeliveryEscalationStatus;
  reason: ClientDeliveryEscalationReason;
  details: string | null;
  opened_by_account_manager_id: string | null;
  reviewed_by_account_manager_id: string | null;
  resolved_by_account_manager_id: string | null;
  opened_at: string;
  reviewed_at: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
};

type AccountManagerRoleRow = {
  role: string | null;
};

export type ClientDeliveryViewer = {
  accountManagerId: string;
  role?: string | null;
};

export type ClientDeliveryListFilters = {
  effectiveStages?: ClientDeliveryStage[];
  riskLevels?: ClientDeliveryRiskLevel[];
  healthBands?: ClientDeliveryHealthBand[];
  staleStatuses?: ClientDeliveryStaleStatus[];
  escalatedOnly?: boolean;
  managerReviewOnly?: boolean;
  needsAttentionOnly?: boolean;
  search?: string;
};

export type ClientDeliveryBoardResult = {
  rows: ClientDeliverySnapshotRecord[];
  summary: ClientDeliveryBoardSummary;
};

export type SaveClientDeliveryCaseInput = {
  jobSeekerId: string;
  actorAccountManagerId: string;
  riskLevel?: ClientDeliveryRiskLevel;
  paused?: boolean;
  stageOverride?: ClientDeliveryStage | null;
  nextActionType?: ClientDeliveryActionType | null;
  nextActionTitle?: string | null;
  nextActionNotes?: string | null;
  nextActionDueAt?: string | null;
  managerNotes?: string | null;
  completeNextAction?: boolean;
};

export type CreateClientDeliveryBlockerInput = {
  jobSeekerId: string;
  actorAccountManagerId: string;
  blockerType: ClientDeliveryBlockerType;
  title: string;
  description?: string | null;
  dueAt?: string | null;
  ownerAccountManagerId?: string | null;
  escalated?: boolean;
};

export type UpdateClientDeliveryBlockerInput = {
  blockerId: string;
  status?: ClientDeliveryBlockerStatus;
  title?: string;
  description?: string | null;
  dueAt?: string | null;
  escalated?: boolean;
  actorAccountManagerId: string;
};

export type CreateClientDeliveryEscalationInput = {
  jobSeekerId: string;
  actorAccountManagerId: string;
  reason: ClientDeliveryEscalationReason;
  details?: string | null;
  status?: ClientDeliveryEscalationStatus;
};

export type UpdateClientDeliveryEscalationInput = {
  escalationId: string;
  actorAccountManagerId: string;
  status?: ClientDeliveryEscalationStatus;
  details?: string | null;
  resolutionNote?: string | null;
};

const SNAPSHOT_SELECT = [
  "case_id",
  "job_seeker_id",
  "account_manager_id",
  "full_name",
  "email",
  "location",
  "seniority",
  "target_titles",
  "intake_status",
  "work_started",
  "payment_status",
  "amount_paid",
  "total_amount",
  "payment_deadline",
  "system_stage",
  "effective_stage",
  "stage_override",
  "risk_level",
  "paused",
  "escalation_status",
  "escalated_at",
  "escalated_by_account_manager_id",
  "manager_reviewed_at",
  "manager_reviewed_by_account_manager_id",
  "last_application_at",
  "applications_7d",
  "applications_30d",
  "open_application_runs",
  "open_queue_count",
  "last_outreach_at",
  "next_follow_up_at",
  "active_thread_count",
  "follow_ups_due_count",
  "next_interview_at",
  "open_interview_count",
  "prep_count",
  "last_offer_at",
  "has_open_offer",
  "has_placed_offer",
  "next_start_date",
  "has_payment_hold",
  "has_active_escalation",
  "active_blocker_count",
  "active_blocker_titles",
  "next_action_type",
  "next_action_title",
  "next_action_notes",
  "next_action_due_at",
  "next_action_completed_at",
  "next_action_completed_by",
  "manager_notes",
  "last_manual_review_at",
  "overdue_next_action",
  "last_touch_at",
  "days_since_last_touch",
  "needs_attention",
  "case_created_at",
  "case_updated_at",
].join(", ");

const SNAPSHOT_SELECT_BASE = [
  "case_id",
  "job_seeker_id",
  "account_manager_id",
  "full_name",
  "email",
  "location",
  "seniority",
  "target_titles",
  "intake_status",
  "work_started",
  "payment_status",
  "amount_paid",
  "total_amount",
  "payment_deadline",
  "system_stage",
  "effective_stage",
  "stage_override",
  "risk_level",
  "paused",
  "last_application_at",
  "applications_7d",
  "applications_30d",
  "open_application_runs",
  "open_queue_count",
  "last_outreach_at",
  "next_follow_up_at",
  "active_thread_count",
  "follow_ups_due_count",
  "next_interview_at",
  "open_interview_count",
  "prep_count",
  "last_offer_at",
  "has_open_offer",
  "has_placed_offer",
  "next_start_date",
  "has_payment_hold",
  "has_active_escalation",
  "active_blocker_count",
  "active_blocker_titles",
  "next_action_type",
  "next_action_title",
  "next_action_notes",
  "next_action_due_at",
  "next_action_completed_at",
  "next_action_completed_by",
  "manager_notes",
  "last_manual_review_at",
  "overdue_next_action",
  "last_touch_at",
  "days_since_last_touch",
  "needs_attention",
  "case_created_at",
  "case_updated_at",
].join(", ");

const CASE_SELECT = [
  "id",
  "job_seeker_id",
  "account_manager_id",
  "stage_override",
  "risk_level",
  "paused",
  "escalation_status",
  "escalated_at",
  "escalated_by_account_manager_id",
  "manager_reviewed_at",
  "manager_reviewed_by_account_manager_id",
  "next_action_type",
  "next_action_title",
  "next_action_notes",
  "next_action_due_at",
  "next_action_completed_at",
  "next_action_completed_by",
  "manager_notes",
  "last_manual_review_at",
  "created_by",
  "created_at",
  "updated_at",
].join(", ");

const CASE_SELECT_BASE = [
  "id",
  "job_seeker_id",
  "account_manager_id",
  "stage_override",
  "risk_level",
  "paused",
  "next_action_type",
  "next_action_title",
  "next_action_notes",
  "next_action_due_at",
  "next_action_completed_at",
  "next_action_completed_by",
  "manager_notes",
  "last_manual_review_at",
  "created_by",
  "created_at",
  "updated_at",
].join(", ");

const ESCALATION_SELECT = [
  "id",
  "delivery_case_id",
  "job_seeker_id",
  "status",
  "reason",
  "details",
  "opened_by_account_manager_id",
  "reviewed_by_account_manager_id",
  "resolved_by_account_manager_id",
  "opened_at",
  "reviewed_at",
  "resolved_at",
  "resolution_note",
  "created_at",
  "updated_at",
].join(", ");

const BLOCKER_SELECT = [
  "id",
  "case_id",
  "blocker_type",
  "status",
  "title",
  "description",
  "owner_account_manager_id",
  "due_at",
  "escalated",
  "resolved_at",
  "resolved_by",
  "created_by",
  "created_at",
  "updated_at",
].join(", ");

export class ClientDeliveryError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function normalizeArray(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function normalizeNumber(value: number | string | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeCount(value: number | null | undefined): number {
  return Number.isFinite(value ?? NaN) ? Number(value) : 0;
}

function mapSnapshotRow(row: DeliverySnapshotRow): ClientDeliverySnapshotRecord {
  return {
    caseId: row.case_id,
    jobSeekerId: row.job_seeker_id,
    accountManagerId: row.account_manager_id,
    fullName: row.full_name ?? "Unknown job seeker",
    email: row.email ?? "",
    location: row.location ?? "",
    seniority: row.seniority ?? "",
    targetTitles: normalizeArray(row.target_titles),
    intakeStatus: row.intake_status ?? "",
    workStarted: Boolean(row.work_started),
    paymentStatus: row.payment_status ?? "",
    amountPaid: normalizeNumber(row.amount_paid),
    totalAmount: normalizeNumber(row.total_amount),
    paymentDeadline: row.payment_deadline,
    systemStage: row.system_stage,
    effectiveStage: row.effective_stage,
    stageOverride: row.stage_override,
    riskLevel: row.risk_level,
    paused: Boolean(row.paused),
    lastApplicationAt: row.last_application_at,
    applications7d: normalizeCount(row.applications_7d),
    applications30d: normalizeCount(row.applications_30d),
    openApplicationRuns: normalizeCount(row.open_application_runs),
    openQueueCount: normalizeCount(row.open_queue_count),
    lastOutreachAt: row.last_outreach_at,
    nextFollowUpAt: row.next_follow_up_at,
    activeThreadCount: normalizeCount(row.active_thread_count),
    followUpsDueCount: normalizeCount(row.follow_ups_due_count),
    nextInterviewAt: row.next_interview_at,
    openInterviewCount: normalizeCount(row.open_interview_count),
    prepCount: normalizeCount(row.prep_count),
    lastOfferAt: row.last_offer_at,
    hasOpenOffer: Boolean(row.has_open_offer),
    hasPlacedOffer: Boolean(row.has_placed_offer),
    nextStartDate: row.next_start_date,
    hasPaymentHold: Boolean(row.has_payment_hold),
    hasActiveEscalation: Boolean(row.has_active_escalation),
    activeBlockerCount: normalizeCount(row.active_blocker_count),
    activeBlockerTitles: normalizeArray(row.active_blocker_titles),
    nextActionType: row.next_action_type,
    nextActionTitle: row.next_action_title ?? "",
    nextActionNotes: row.next_action_notes ?? "",
    nextActionDueAt: row.next_action_due_at,
    nextActionCompletedAt: row.next_action_completed_at,
    nextActionCompletedBy: row.next_action_completed_by,
    managerNotes: row.manager_notes ?? "",
    lastManualReviewAt: row.last_manual_review_at,
    overdueNextAction: Boolean(row.overdue_next_action),
    lastTouchAt: row.last_touch_at,
    daysSinceLastTouch: normalizeCount(row.days_since_last_touch),
    healthScore: 100,
    healthBand: "healthy",
    staleStatus: "none",
    staleSinceAt: null,
    escalationStatus: "none",
    escalatedAt: null,
    managerReviewedAt: null,
    latestEscalationReason: null,
    latestEscalationOpenedAt: null,
    hasActiveEscalationRecord: false,
    overdueBlockerCount: 0,
    criticalOverdueBlockerCount: 0,
    blockerMaxAgeDays: 0,
    daysSinceLastApplication: calculateDaysSinceTimestamp(row.last_application_at),
    daysSinceLastManualReview: calculateDaysSinceTimestamp(row.last_manual_review_at),
    needsManagerReview: false,
    needsAttention: Boolean(row.needs_attention),
    caseCreatedAt: row.case_created_at,
    caseUpdatedAt: row.case_updated_at,
  };
}

function mapCaseRow(row: ClientDeliveryCaseRow): ClientDeliveryCaseRecord {
  return {
    id: row.id,
    jobSeekerId: row.job_seeker_id,
    accountManagerId: row.account_manager_id,
    stageOverride: row.stage_override,
    riskLevel: row.risk_level,
    paused: row.paused,
    escalationStatus: row.escalation_status ?? "none",
    escalatedAt: row.escalated_at ?? null,
    escalatedByAccountManagerId: row.escalated_by_account_manager_id ?? null,
    managerReviewedAt: row.manager_reviewed_at ?? null,
    managerReviewedByAccountManagerId:
      row.manager_reviewed_by_account_manager_id ?? null,
    nextActionType: row.next_action_type,
    nextActionTitle: row.next_action_title ?? "",
    nextActionNotes: row.next_action_notes ?? "",
    nextActionDueAt: row.next_action_due_at,
    nextActionCompletedAt: row.next_action_completed_at,
    nextActionCompletedBy: row.next_action_completed_by,
    managerNotes: row.manager_notes ?? "",
    lastManualReviewAt: row.last_manual_review_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBlockerRow(row: ClientDeliveryBlockerRow): ClientDeliveryBlockerRecord {
  return {
    id: row.id,
    caseId: row.case_id,
    blockerType: row.blocker_type,
    status: row.status,
    title: row.title,
    description: row.description ?? "",
    ownerAccountManagerId: row.owner_account_manager_id,
    dueAt: row.due_at,
    escalated: Boolean(row.escalated),
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEscalationRow(
  row: ClientDeliveryEscalationRow
): ClientDeliveryEscalationRecord {
  return {
    id: row.id,
    deliveryCaseId: row.delivery_case_id,
    jobSeekerId: row.job_seeker_id,
    status: row.status,
    reason: row.reason,
    details: row.details ?? "",
    openedByAccountManagerId: row.opened_by_account_manager_id,
    reviewedByAccountManagerId: row.reviewed_by_account_manager_id,
    resolvedByAccountManagerId: row.resolved_by_account_manager_id,
    openedAt: row.opened_at,
    reviewedAt: row.reviewed_at,
    resolvedAt: row.resolved_at,
    resolutionNote: row.resolution_note ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function resolveViewerRole(viewer: ClientDeliveryViewer): Promise<string | null> {
  if (viewer.role !== undefined) return viewer.role;

  const { data, error } = await supabaseAdmin
    .from("account_managers")
    .select("role")
    .eq("id", viewer.accountManagerId)
    .maybeSingle();

  if (error) {
    if (isDeliverySlaSchemaErrorMessage(error.message)) {
      throw createDeliverySlaUnavailableError();
    }
    throw new ClientDeliveryError(500, error.message);
  }

  return (data as AccountManagerRoleRow | null)?.role ?? null;
}

function canViewAllDelivery(role: string | null | undefined): boolean {
  return isPeopleManagerRole(role) || isAdminRole(role);
}

function normalizeOptionalText(
  value: string | null | undefined
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalIsoTimestamp(
  value: string | null | undefined
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new ClientDeliveryError(400, "Invalid date value.");
  }
  return parsed.toISOString();
}

function isDeliverySlaSchemaErrorMessage(message: string | undefined): boolean {
  const text = String(message ?? "").toLowerCase();
  return (
    text.includes("escalation_status") ||
    text.includes("manager_reviewed_at") ||
    text.includes("manager_reviewed_by_account_manager_id") ||
    text.includes("escalated_at") ||
    text.includes("escalated_by_account_manager_id") ||
    text.includes("relation \"public.client_delivery_escalations\" does not exist") ||
    text.includes("relation \"client_delivery_escalations\" does not exist")
  );
}

function createDeliverySlaUnavailableError(): ClientDeliveryError {
  return new ClientDeliveryError(
    503,
    "Delivery escalation controls are not available until migration 100 is applied."
  );
}

async function runCaseSelect<T>(
  build: (
    selectClause: string
  ) => PromiseLike<{ data: T; error: { message: string } | null }>
): Promise<T> {
  let result = await build(CASE_SELECT);
  if (result.error && isDeliverySlaSchemaErrorMessage(result.error.message)) {
    result = await build(CASE_SELECT_BASE);
  }

  if (result.error) {
    throw new ClientDeliveryError(500, result.error.message);
  }

  return result.data;
}

async function runSnapshotSelect<T>(
  build: (
    selectClause: string
  ) => PromiseLike<{ data: T; error: { message: string } | null }>
): Promise<T> {
  let result = await build(SNAPSHOT_SELECT);
  if (result.error && isDeliverySlaSchemaErrorMessage(result.error.message)) {
    result = await build(SNAPSHOT_SELECT_BASE);
  }

  if (result.error) {
    throw new ClientDeliveryError(500, result.error.message);
  }

  return result.data;
}

function isActiveEscalationStatus(
  status: ClientDeliveryEscalationStatus
): boolean {
  return (
    status === "needs_manager_review" ||
    status === "manager_reviewed" ||
    status === "ops_escalated"
  );
}

function buildBlockerSignals(
  blockers: ClientDeliveryBlockerRecord[],
  now = new Date()
): {
  overdueBlockerCount: number;
  criticalOverdueBlockerCount: number;
  blockerMaxAgeDays: number;
} {
  let overdueBlockerCount = 0;
  let criticalOverdueBlockerCount = 0;
  let blockerMaxAgeDays = 0;

  for (const blocker of blockers) {
    if (blocker.status === "resolved") continue;

    blockerMaxAgeDays = Math.max(
      blockerMaxAgeDays,
      deriveBlockerAgeDays(blocker.createdAt, now)
    );

    const dueState: DeliveryBlockerDueState = deriveBlockerDueState(
      blocker.dueAt,
      now
    );

    if (dueState === "overdue" || dueState === "critical_overdue") {
      overdueBlockerCount += 1;
    }

    if (dueState === "critical_overdue") {
      criticalOverdueBlockerCount += 1;
    }
  }

  return {
    overdueBlockerCount,
    criticalOverdueBlockerCount,
    blockerMaxAgeDays,
  };
}

function deriveStaleSinceAt(args: {
  snapshot: ClientDeliverySnapshotRecord;
  staleStatus: ClientDeliveryStaleStatus;
}): string | null {
  if (args.staleStatus === "none") return null;

  const { snapshot } = args;
  const touchMs = Date.parse(snapshot.lastTouchAt);
  const applicationMs = snapshot.lastApplicationAt
    ? Date.parse(snapshot.lastApplicationAt)
    : Number.NaN;

  const msPerDay = 86_400_000;

  if (
    snapshot.effectiveStage === "active_search" &&
    snapshot.applications7d === 0 &&
    snapshot.daysSinceLastApplication !== null &&
    snapshot.daysSinceLastApplication >= DELIVERY_STALE_DAYS &&
    !Number.isNaN(applicationMs)
  ) {
    return new Date(applicationMs + DELIVERY_STALE_DAYS * msPerDay).toISOString();
  }

  if (Number.isNaN(touchMs)) return null;

  const thresholdDays = snapshot.paused
    ? args.staleStatus === "approaching_stale"
      ? DELIVERY_PAUSED_WARNING_DAYS
      : DELIVERY_PAUSED_STALE_DAYS
    : args.staleStatus === "approaching_stale"
      ? DELIVERY_STALE_WARNING_DAYS
      : args.staleStatus === "stale"
        ? DELIVERY_STALE_DAYS
        : DELIVERY_SEVERE_STALE_DAYS;

  return new Date(touchMs + thresholdDays * msPerDay).toISOString();
}

function enrichSnapshotRecord(args: {
  row: ClientDeliverySnapshotRecord;
  caseRecord: ClientDeliveryCaseRecord | null;
  blockers: ClientDeliveryBlockerRecord[];
  escalations: ClientDeliveryEscalationRecord[];
  now?: Date;
}): ClientDeliverySnapshotRecord {
  const now = args.now ?? new Date();
  const activeEscalations = args.escalations.filter((escalation) =>
    isActiveEscalationStatus(escalation.status)
  );
  const latestEscalation =
    activeEscalations[0] ??
    args.escalations[0] ??
    null;

  const escalationStatus =
    args.caseRecord?.escalationStatus ??
    latestEscalation?.status ??
    "none";
  const hasActiveEscalationRecord =
    isActiveEscalationStatus(escalationStatus) || activeEscalations.length > 0;

  const blockerSignals = buildBlockerSignals(args.blockers, now);
  const daysSinceLastManualReview = calculateDaysSinceTimestamp(
    args.caseRecord?.lastManualReviewAt ?? args.row.lastManualReviewAt,
    now
  );
  const daysSinceLastApplication = calculateDaysSinceTimestamp(
    args.row.lastApplicationAt,
    now
  );

  const staleStatus = deriveDeliveryStaleStatus({
    paused: args.row.paused,
    hasPlacedOffer: args.row.hasPlacedOffer,
    daysSinceLastTouch: args.row.daysSinceLastTouch,
    daysSinceLastApplication,
    applications7d: args.row.applications7d,
    lastManualReviewAt:
      args.caseRecord?.lastManualReviewAt ?? args.row.lastManualReviewAt,
    overdueNextAction: args.row.overdueNextAction,
    activeThreadCount: args.row.activeThreadCount,
    effectiveStage: args.row.effectiveStage,
    now,
  });

  const healthScore = computeDeliveryHealthScore({
    effectiveStage: args.row.effectiveStage,
    riskLevel: args.row.riskLevel,
    paused: args.row.paused,
    overdueNextAction: args.row.overdueNextAction,
    activeBlockerCount: args.row.activeBlockerCount,
    overdueBlockerCount: blockerSignals.overdueBlockerCount,
    criticalOverdueBlockerCount: blockerSignals.criticalOverdueBlockerCount,
    hasPaymentHold: args.row.hasPaymentHold,
    hasActiveEscalation: hasActiveEscalationRecord,
    applications7d: args.row.applications7d,
    nextInterviewAt: args.row.nextInterviewAt,
    hasOpenOffer: args.row.hasOpenOffer,
    daysSinceLastTouch: args.row.daysSinceLastTouch,
    daysSinceLastApplication,
    daysSinceLastManualReview,
    nextFollowUpAt: args.row.nextFollowUpAt,
    now,
  });

  const healthBand = deriveDeliveryHealthBand(healthScore);
  const needsManagerReview = deriveDeliveryNeedsManagerReview({
    escalationStatus,
    healthBand,
    staleStatus,
    criticalOverdueBlockerCount: blockerSignals.criticalOverdueBlockerCount,
    hasPaymentHold: args.row.hasPaymentHold,
    riskLevel: args.row.riskLevel,
    daysSinceLastManualReview,
  });

  return {
    ...args.row,
    hasActiveEscalation: hasActiveEscalationRecord,
    healthScore,
    healthBand,
    staleStatus,
    staleSinceAt: deriveStaleSinceAt({
      snapshot: {
        ...args.row,
        daysSinceLastApplication,
      },
      staleStatus,
    }),
    escalationStatus,
    escalatedAt:
      args.caseRecord?.escalatedAt ?? latestEscalation?.openedAt ?? null,
    managerReviewedAt:
      args.caseRecord?.managerReviewedAt ?? latestEscalation?.reviewedAt ?? null,
    latestEscalationReason: latestEscalation?.reason ?? null,
    latestEscalationOpenedAt: latestEscalation?.openedAt ?? null,
    hasActiveEscalationRecord,
    overdueBlockerCount: blockerSignals.overdueBlockerCount,
    criticalOverdueBlockerCount: blockerSignals.criticalOverdueBlockerCount,
    blockerMaxAgeDays: blockerSignals.blockerMaxAgeDays,
    daysSinceLastApplication,
    daysSinceLastManualReview,
    needsManagerReview,
    needsAttention:
      args.row.needsAttention ||
      staleStatus !== "none" ||
      healthBand === "critical" ||
      blockerSignals.criticalOverdueBlockerCount > 0,
  };
}

function matchesSearch(row: ClientDeliverySnapshotRecord, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;

  return (
    row.fullName.toLowerCase().includes(needle) ||
    row.email.toLowerCase().includes(needle) ||
    row.location.toLowerCase().includes(needle) ||
    row.targetTitles.some((title) => title.toLowerCase().includes(needle))
  );
}

function applySnapshotFilters(
  rows: ClientDeliverySnapshotRecord[],
  filters: ClientDeliveryListFilters
): ClientDeliverySnapshotRecord[] {
  return rows.filter((row) => {
    if (filters.needsAttentionOnly && !row.needsAttention) {
      return false;
    }

    if (
      filters.effectiveStages?.length &&
      !filters.effectiveStages.includes(row.effectiveStage)
    ) {
      return false;
    }

    if (
      filters.riskLevels?.length &&
      !filters.riskLevels.includes(row.riskLevel)
    ) {
      return false;
    }

    if (
      filters.healthBands?.length &&
      !filters.healthBands.includes(row.healthBand)
    ) {
      return false;
    }

    if (
      filters.staleStatuses?.length &&
      !filters.staleStatuses.includes(row.staleStatus)
    ) {
      return false;
    }

    if (filters.escalatedOnly && !row.hasActiveEscalationRecord) {
      return false;
    }

    if (filters.managerReviewOnly && !row.needsManagerReview) {
      return false;
    }

    if (filters.search && !matchesSearch(row, filters.search)) {
      return false;
    }

    return true;
  });
}

async function getLatestAssignedAccountManagerIdForSeeker(
  jobSeekerId: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("account_manager_id")
    .eq("job_seeker_id", jobSeekerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new ClientDeliveryError(500, error.message);
  }

  return (data as { account_manager_id: string | null } | null)
    ?.account_manager_id ?? null;
}

async function upsertClientDeliveryCaseForSeeker(args: {
  jobSeekerId: string;
  actorAccountManagerId: string;
}): Promise<ClientDeliveryCaseRecord> {
  const existing = await getClientDeliveryCaseForSeeker(args.jobSeekerId);
  if (existing) return existing;

  const assignedAccountManagerId =
    await getLatestAssignedAccountManagerIdForSeeker(args.jobSeekerId);

  const { data, error } = await supabaseAdmin
    .from("client_delivery_cases")
    .upsert(
      {
        job_seeker_id: args.jobSeekerId,
        account_manager_id:
          assignedAccountManagerId ?? args.actorAccountManagerId,
        created_by: args.actorAccountManagerId,
      },
      { onConflict: "job_seeker_id" }
    );

  if (error) {
    throw new ClientDeliveryError(500, error.message);
  }

  const refreshed = await getClientDeliveryCaseForSeeker(args.jobSeekerId);
  if (!refreshed) {
    throw new ClientDeliveryError(500, "Failed to load delivery case.");
  }

  return refreshed;
}

async function listClientDeliveryCasesByJobSeekerIds(
  jobSeekerIds: string[]
): Promise<Map<string, ClientDeliveryCaseRecord>> {
  if (jobSeekerIds.length === 0) return new Map();

  const data = await runCaseSelect((selectClause) =>
    supabaseAdmin
      .from("client_delivery_cases")
      .select(selectClause)
      .in("job_seeker_id", jobSeekerIds)
  );

  return new Map(
    ((data as unknown as ClientDeliveryCaseRow[] | null) ?? []).map((row) => {
      const mapped = mapCaseRow(row);
      return [mapped.jobSeekerId, mapped] as const;
    })
  );
}

async function listClientDeliveryBlockersByCaseIds(
  caseIds: string[]
): Promise<Map<string, ClientDeliveryBlockerRecord[]>> {
  if (caseIds.length === 0) return new Map();

  const { data, error } = await supabaseAdmin
    .from("client_delivery_blockers")
    .select(BLOCKER_SELECT)
    .in("case_id", caseIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw new ClientDeliveryError(500, error.message);
  }

  const grouped = new Map<string, ClientDeliveryBlockerRecord[]>();
  for (const row of (data as unknown as ClientDeliveryBlockerRow[] | null) ?? []) {
    const mapped = mapBlockerRow(row);
    const current = grouped.get(mapped.caseId) ?? [];
    current.push(mapped);
    grouped.set(mapped.caseId, current);
  }
  return grouped;
}

async function listClientDeliveryEscalationsByCaseIds(
  caseIds: string[]
): Promise<Map<string, ClientDeliveryEscalationRecord[]>> {
  if (caseIds.length === 0) return new Map();

  const { data, error } = await supabaseAdmin
    .from("client_delivery_escalations")
    .select(ESCALATION_SELECT)
    .in("delivery_case_id", caseIds)
    .order("opened_at", { ascending: false });

  if (error) {
    if (isDeliverySlaSchemaErrorMessage(error.message)) {
      return new Map();
    }
    throw new ClientDeliveryError(500, error.message);
  }

  const grouped = new Map<string, ClientDeliveryEscalationRecord[]>();
  for (const row of (data as unknown as ClientDeliveryEscalationRow[] | null) ?? []) {
    const mapped = mapEscalationRow(row);
    const current = grouped.get(mapped.deliveryCaseId) ?? [];
    current.push(mapped);
    grouped.set(mapped.deliveryCaseId, current);
  }
  return grouped;
}

async function enrichSnapshots(
  rows: ClientDeliverySnapshotRecord[]
): Promise<ClientDeliverySnapshotRecord[]> {
  if (rows.length === 0) return rows;

  const jobSeekerIds = rows.map((row) => row.jobSeekerId);
  const caseMap = await listClientDeliveryCasesByJobSeekerIds(jobSeekerIds);
  const caseIds = Array.from(
    new Set(
      rows
        .map((row) => row.caseId ?? caseMap.get(row.jobSeekerId)?.id ?? null)
        .filter((value): value is string => Boolean(value))
    )
  );

  const [blockerMap, escalationMap] = await Promise.all([
    listClientDeliveryBlockersByCaseIds(caseIds),
    listClientDeliveryEscalationsByCaseIds(caseIds),
  ]);

  const now = new Date();
  return rows.map((row) => {
    const caseRecord = caseMap.get(row.jobSeekerId) ?? null;
    const resolvedCaseId = row.caseId ?? caseRecord?.id ?? null;
    const blockers = resolvedCaseId ? blockerMap.get(resolvedCaseId) ?? [] : [];
    const escalations = resolvedCaseId
      ? escalationMap.get(resolvedCaseId) ?? []
      : [];

    return enrichSnapshotRecord({
      row,
      caseRecord,
      blockers,
      escalations,
      now,
    });
  });
}

export async function ensureClientDeliveryCasesForManagedSeekers(
  limit = 500
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("v_client_delivery_snapshot")
    .select("job_seeker_id, account_manager_id, case_id")
    .is("case_id", null)
    .limit(limit);

  if (error) {
    throw new ClientDeliveryError(500, error.message);
  }

  const rows =
    ((data as unknown as Array<{
      job_seeker_id: string;
      account_manager_id: string | null;
      case_id: string | null;
    }> | null) ?? []).filter((row) => !row.case_id);

  if (rows.length === 0) return 0;

  const payload = rows.map((row) => ({
    job_seeker_id: row.job_seeker_id,
    account_manager_id: row.account_manager_id,
  }));

  const { error: upsertError } = await supabaseAdmin
    .from("client_delivery_cases")
    .upsert(payload, { onConflict: "job_seeker_id" });

  if (upsertError) {
    throw new ClientDeliveryError(500, upsertError.message);
  }

  return payload.length;
}

export async function ensureClientDeliveryCaseForSeeker(
  jobSeekerId: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("v_client_delivery_snapshot")
    .select("case_id, job_seeker_id, account_manager_id")
    .eq("job_seeker_id", jobSeekerId)
    .maybeSingle();

  if (error) {
    throw new ClientDeliveryError(500, error.message);
  }

  const row =
    (data as
      | {
          case_id: string | null;
          job_seeker_id: string;
          account_manager_id: string | null;
        }
      | null) ?? null;

  if (!row) return null;
  if (row.case_id) return row.case_id;

  const { data: upserted, error: upsertError } = await supabaseAdmin
    .from("client_delivery_cases")
    .upsert(
      {
        job_seeker_id: row.job_seeker_id,
        account_manager_id: row.account_manager_id,
      },
      { onConflict: "job_seeker_id" }
    )
    .select("id")
    .single();

  if (upsertError) {
    throw new ClientDeliveryError(500, upsertError.message);
  }

  return (upserted as { id: string } | null)?.id ?? null;
}

export async function listClientDeliverySnapshots(
  viewer: ClientDeliveryViewer,
  filters: ClientDeliveryListFilters = {}
): Promise<ClientDeliveryBoardResult> {
  await ensureClientDeliveryCasesForManagedSeekers();

  const role = await resolveViewerRole(viewer);
  const data = await runSnapshotSelect((selectClause) => {
    let query = supabaseAdmin
      .from("v_client_delivery_snapshot")
      .select(selectClause);

    if (!canViewAllDelivery(role)) {
      query = query.eq("account_manager_id", viewer.accountManagerId);
    }

    return query;
  });

  const rawRows = ((data as unknown as DeliverySnapshotRow[] | null) ?? []).map(
    mapSnapshotRow
  );
  const rows = await enrichSnapshots(rawRows);
  const filteredRows = applySnapshotFilters(rows, filters).sort(
    compareClientDeliverySnapshots
  );

  return {
    rows: filteredRows,
    summary: buildClientDeliveryBoardSummary(filteredRows),
  };
}

export async function getClientDeliverySnapshotForSeeker(
  viewer: ClientDeliveryViewer,
  jobSeekerId: string
): Promise<ClientDeliverySnapshotRecord | null> {
  await ensureClientDeliveryCaseForSeeker(jobSeekerId);

  const role = await resolveViewerRole(viewer);
  const data = await runSnapshotSelect((selectClause) => {
    let query = supabaseAdmin
      .from("v_client_delivery_snapshot")
      .select(selectClause)
      .eq("job_seeker_id", jobSeekerId);

    if (!canViewAllDelivery(role)) {
      query = query.eq("account_manager_id", viewer.accountManagerId);
    }

    return query.maybeSingle();
  });

  const row = (data as unknown as DeliverySnapshotRow | null) ?? null;
  if (!row) return null;

  const [enriched] = await enrichSnapshots([mapSnapshotRow(row)]);
  return enriched ?? null;
}

export async function getClientDeliveryCaseForSeeker(
  jobSeekerId: string
): Promise<ClientDeliveryCaseRecord | null> {
  const data = await runCaseSelect((selectClause) =>
    supabaseAdmin
      .from("client_delivery_cases")
      .select(selectClause)
      .eq("job_seeker_id", jobSeekerId)
      .maybeSingle()
  );

  const row = (data as unknown as ClientDeliveryCaseRow | null) ?? null;
  return row ? mapCaseRow(row) : null;
}

export async function saveClientDeliveryCase(
  input: SaveClientDeliveryCaseInput
): Promise<ClientDeliveryCaseRecord> {
  const caseRecord = await upsertClientDeliveryCaseForSeeker({
    jobSeekerId: input.jobSeekerId,
    actorAccountManagerId: input.actorAccountManagerId,
  });

  const assignedAccountManagerId =
    caseRecord.accountManagerId ??
    (await getLatestAssignedAccountManagerIdForSeeker(input.jobSeekerId)) ??
    input.actorAccountManagerId;

  const updates: Record<string, unknown> = {
    last_manual_review_at: new Date().toISOString(),
  };

  if (assignedAccountManagerId && !caseRecord.accountManagerId) {
    updates.account_manager_id = assignedAccountManagerId;
  }

  if (input.riskLevel !== undefined) {
    updates.risk_level = input.riskLevel;
  }

  if (input.paused !== undefined) {
    updates.paused = input.paused;
  }

  if (input.stageOverride !== undefined) {
    updates.stage_override = input.stageOverride;
  }

  if (input.managerNotes !== undefined) {
    updates.manager_notes = normalizeOptionalText(input.managerNotes);
  }

  const nextActionType =
    input.nextActionType === undefined
      ? undefined
      : input.nextActionType ?? null;
  const nextActionTitle = normalizeOptionalText(input.nextActionTitle);
  const nextActionNotes = normalizeOptionalText(input.nextActionNotes);
  const nextActionDueAt = normalizeOptionalIsoTimestamp(input.nextActionDueAt);

  const nextActionTouched =
    input.nextActionType !== undefined ||
    input.nextActionTitle !== undefined ||
    input.nextActionNotes !== undefined ||
    input.nextActionDueAt !== undefined;

  if (input.nextActionType !== undefined) {
    updates.next_action_type = nextActionType;
  }
  if (input.nextActionTitle !== undefined) {
    updates.next_action_title = nextActionTitle;
  }
  if (input.nextActionNotes !== undefined) {
    updates.next_action_notes = nextActionNotes;
  }
  if (input.nextActionDueAt !== undefined) {
    updates.next_action_due_at = nextActionDueAt;
  }

  if (input.completeNextAction) {
    const completedAt = new Date().toISOString();
    updates.next_action_completed_at = completedAt;
    updates.next_action_completed_by = input.actorAccountManagerId;
  } else if (nextActionTouched) {
    updates.next_action_completed_at = null;
    updates.next_action_completed_by = null;
  }

  const { error } = await supabaseAdmin
    .from("client_delivery_cases")
    .update(updates)
    .eq("id", caseRecord.id);

  if (error) {
    throw new ClientDeliveryError(500, error.message);
  }

  const refreshed = await getClientDeliveryCaseForSeeker(input.jobSeekerId);
  if (!refreshed) {
    throw new ClientDeliveryError(500, "Failed to load delivery case.");
  }

  return refreshed;
}

export async function getClientDeliveryBlockerContext(
  blockerId: string
): Promise<{ blocker: ClientDeliveryBlockerRecord; jobSeekerId: string } | null> {
  const { data, error } = await supabaseAdmin
    .from("client_delivery_blockers")
    .select(BLOCKER_SELECT)
    .eq("id", blockerId)
    .maybeSingle();

  if (error) {
    if (isDeliverySlaSchemaErrorMessage(error.message)) {
      return null;
    }
    throw new ClientDeliveryError(500, error.message);
  }

  const blockerRow = (data as unknown as ClientDeliveryBlockerRow | null) ?? null;
  if (!blockerRow) return null;

  const { data: caseData, error: caseError } = await supabaseAdmin
    .from("client_delivery_cases")
    .select("job_seeker_id")
    .eq("id", blockerRow.case_id)
    .maybeSingle();

  if (caseError) {
    if (isDeliverySlaSchemaErrorMessage(caseError.message)) {
      throw createDeliverySlaUnavailableError();
    }
    throw new ClientDeliveryError(500, caseError.message);
  }

  const jobSeekerId =
    (caseData as { job_seeker_id: string } | null)?.job_seeker_id ?? null;

  if (!jobSeekerId) return null;

  return {
    blocker: mapBlockerRow(blockerRow),
    jobSeekerId,
  };
}

export async function createClientDeliveryBlocker(
  input: CreateClientDeliveryBlockerInput
): Promise<ClientDeliveryBlockerRecord> {
  const caseRecord = await upsertClientDeliveryCaseForSeeker({
    jobSeekerId: input.jobSeekerId,
    actorAccountManagerId: input.actorAccountManagerId,
  });

  const { data, error } = await supabaseAdmin
    .from("client_delivery_blockers")
    .insert({
      case_id: caseRecord.id,
      blocker_type: input.blockerType,
      status: "active",
      title: input.title.trim(),
      description: normalizeOptionalText(input.description) ?? null,
      owner_account_manager_id:
        input.ownerAccountManagerId ?? caseRecord.accountManagerId,
      due_at: normalizeOptionalIsoTimestamp(input.dueAt) ?? null,
      escalated: Boolean(input.escalated),
      created_by: input.actorAccountManagerId,
    })
    .select(BLOCKER_SELECT)
    .single();

  if (error) {
    throw new ClientDeliveryError(500, error.message);
  }

  return mapBlockerRow(data as unknown as ClientDeliveryBlockerRow);
}

export async function updateClientDeliveryBlocker(
  input: UpdateClientDeliveryBlockerInput
): Promise<ClientDeliveryBlockerRecord> {
  const existing = await getClientDeliveryBlockerContext(input.blockerId);
  if (!existing) {
    throw new ClientDeliveryError(404, "Blocker not found.");
  }

  const updates: Record<string, unknown> = {};

  if (input.status !== undefined) {
    updates.status = input.status;
    if (input.status === "resolved" || input.status === "escalated") {
      updates.resolved_at = new Date().toISOString();
      updates.resolved_by = input.actorAccountManagerId;
    } else if (input.status === "active") {
      updates.resolved_at = null;
      updates.resolved_by = null;
    }
  }

  if (input.title !== undefined) {
    updates.title = input.title.trim();
  }

  if (input.description !== undefined) {
    updates.description = normalizeOptionalText(input.description) ?? null;
  }

  if (input.dueAt !== undefined) {
    updates.due_at = normalizeOptionalIsoTimestamp(input.dueAt) ?? null;
  }

  if (input.escalated !== undefined) {
    updates.escalated = input.escalated;
  }

  const { data, error } = await supabaseAdmin
    .from("client_delivery_blockers")
    .update(updates)
    .eq("id", input.blockerId)
    .select(BLOCKER_SELECT)
    .single();

  if (error) {
    throw new ClientDeliveryError(500, error.message);
  }

  return mapBlockerRow(data as unknown as ClientDeliveryBlockerRow);
}

export async function listClientDeliveryBlockersForSeeker(
  jobSeekerId: string,
  options: { activeOnly?: boolean } = {}
): Promise<ClientDeliveryBlockerRecord[]> {
  const caseRecord = await getClientDeliveryCaseForSeeker(jobSeekerId);
  if (!caseRecord) return [];

  let query = supabaseAdmin
    .from("client_delivery_blockers")
    .select(BLOCKER_SELECT)
    .eq("case_id", caseRecord.id)
    .order("created_at", { ascending: false });

  if (options.activeOnly) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;

  if (error) {
    throw new ClientDeliveryError(500, error.message);
  }

  return ((data as unknown as ClientDeliveryBlockerRow[] | null) ?? []).map(
    mapBlockerRow
  );
}

export async function listClientDeliveryEscalationsForSeeker(
  jobSeekerId: string,
  options: { activeOnly?: boolean } = {}
): Promise<ClientDeliveryEscalationRecord[]> {
  const caseRecord = await getClientDeliveryCaseForSeeker(jobSeekerId);
  if (!caseRecord) return [];

  let query = supabaseAdmin
    .from("client_delivery_escalations")
    .select(ESCALATION_SELECT)
    .eq("delivery_case_id", caseRecord.id)
    .order("opened_at", { ascending: false });

  if (options.activeOnly) {
    query = query.in("status", [
      "needs_manager_review",
      "manager_reviewed",
      "ops_escalated",
    ]);
  }

  const { data, error } = await query;

  if (error) {
    throw new ClientDeliveryError(500, error.message);
  }

  return ((data as unknown as ClientDeliveryEscalationRow[] | null) ?? []).map(
    mapEscalationRow
  );
}

export async function createClientDeliveryEscalation(
  input: CreateClientDeliveryEscalationInput
): Promise<ClientDeliveryEscalationRecord> {
  const caseRecord = await upsertClientDeliveryCaseForSeeker({
    jobSeekerId: input.jobSeekerId,
    actorAccountManagerId: input.actorAccountManagerId,
  });

  const openedAt = new Date().toISOString();
  const status = input.status ?? "needs_manager_review";

  const { data, error } = await supabaseAdmin
    .from("client_delivery_escalations")
    .insert({
      delivery_case_id: caseRecord.id,
      job_seeker_id: input.jobSeekerId,
      status,
      reason: input.reason,
      details: normalizeOptionalText(input.details) ?? null,
      opened_by_account_manager_id: input.actorAccountManagerId,
      opened_at: openedAt,
      reviewed_at: status === "manager_reviewed" ? openedAt : null,
      reviewed_by_account_manager_id:
        status === "manager_reviewed" ? input.actorAccountManagerId : null,
      resolved_at: status === "resolved" ? openedAt : null,
      resolved_by_account_manager_id:
        status === "resolved" ? input.actorAccountManagerId : null,
      resolution_note: null,
    })
    .select(ESCALATION_SELECT)
    .single();

  if (error) {
    throw new ClientDeliveryError(500, error.message);
  }

  const caseUpdates: Record<string, unknown> = {
    escalation_status: status,
    escalated_at: openedAt,
    escalated_by_account_manager_id: input.actorAccountManagerId,
    last_manual_review_at: openedAt,
  };

  if (status === "manager_reviewed") {
    caseUpdates.manager_reviewed_at = openedAt;
    caseUpdates.manager_reviewed_by_account_manager_id =
      input.actorAccountManagerId;
  }

  if (status === "resolved") {
    caseUpdates.manager_reviewed_at = openedAt;
    caseUpdates.manager_reviewed_by_account_manager_id =
      input.actorAccountManagerId;
  }

  const { error: caseError } = await supabaseAdmin
    .from("client_delivery_cases")
    .update(caseUpdates)
    .eq("id", caseRecord.id);

  if (caseError) {
    throw new ClientDeliveryError(500, caseError.message);
  }

  return mapEscalationRow(data as unknown as ClientDeliveryEscalationRow);
}

export async function updateClientDeliveryEscalation(
  input: UpdateClientDeliveryEscalationInput
): Promise<ClientDeliveryEscalationRecord> {
  const { data: existingData, error: existingError } = await supabaseAdmin
    .from("client_delivery_escalations")
    .select(ESCALATION_SELECT)
    .eq("id", input.escalationId)
    .maybeSingle();

  if (existingError) {
    if (isDeliverySlaSchemaErrorMessage(existingError.message)) {
      throw createDeliverySlaUnavailableError();
    }
    throw new ClientDeliveryError(500, existingError.message);
  }

  const existing =
    (existingData as unknown as ClientDeliveryEscalationRow | null) ?? null;
  if (!existing) {
    throw new ClientDeliveryError(404, "Escalation not found.");
  }

  const nextStatus = input.status ?? existing.status;
  const nowIso = new Date().toISOString();
  const updates: Record<string, unknown> = {};

  if (input.status !== undefined) {
    updates.status = nextStatus;
  }
  if (input.details !== undefined) {
    updates.details = normalizeOptionalText(input.details) ?? null;
  }
  if (input.resolutionNote !== undefined) {
    updates.resolution_note = normalizeOptionalText(input.resolutionNote) ?? null;
  }

  if (
    nextStatus === "manager_reviewed" ||
    nextStatus === "ops_escalated" ||
    nextStatus === "resolved"
  ) {
    updates.reviewed_at = existing.reviewed_at ?? nowIso;
    updates.reviewed_by_account_manager_id =
      existing.reviewed_by_account_manager_id ?? input.actorAccountManagerId;
  }

  if (nextStatus === "resolved") {
    updates.resolved_at = nowIso;
    updates.resolved_by_account_manager_id = input.actorAccountManagerId;
  } else if (input.status !== undefined && existing.status === "resolved") {
    updates.resolved_at = null;
    updates.resolved_by_account_manager_id = null;
  }

  const { data, error } = await supabaseAdmin
    .from("client_delivery_escalations")
    .update(updates)
    .eq("id", input.escalationId)
    .select(ESCALATION_SELECT)
    .single();

  if (error) {
    if (isDeliverySlaSchemaErrorMessage(error.message)) {
      throw createDeliverySlaUnavailableError();
    }
    throw new ClientDeliveryError(500, error.message);
  }

  const mapped = mapEscalationRow(data as unknown as ClientDeliveryEscalationRow);
  const caseUpdates: Record<string, unknown> = {
    escalation_status: nextStatus,
    last_manual_review_at: nowIso,
  };

  if (
    nextStatus === "manager_reviewed" ||
    nextStatus === "ops_escalated" ||
    nextStatus === "resolved"
  ) {
    caseUpdates.manager_reviewed_at = mapped.reviewedAt ?? nowIso;
    caseUpdates.manager_reviewed_by_account_manager_id =
      mapped.reviewedByAccountManagerId ?? input.actorAccountManagerId;
  }

  if (
    nextStatus === "needs_manager_review" ||
    nextStatus === "manager_reviewed" ||
    nextStatus === "ops_escalated"
  ) {
    caseUpdates.escalated_at = mapped.openedAt;
    caseUpdates.escalated_by_account_manager_id =
      mapped.openedByAccountManagerId ?? input.actorAccountManagerId;
  }

  const { error: caseError } = await supabaseAdmin
    .from("client_delivery_cases")
    .update(caseUpdates)
    .eq("id", mapped.deliveryCaseId);

  if (caseError) {
    if (isDeliverySlaSchemaErrorMessage(caseError.message)) {
      throw createDeliverySlaUnavailableError();
    }
    throw new ClientDeliveryError(500, caseError.message);
  }

  return mapped;
}

export async function markClientDeliveryCaseReviewed(args: {
  jobSeekerId: string;
  actorAccountManagerId: string;
}): Promise<ClientDeliveryCaseRecord> {
  const caseRecord = await upsertClientDeliveryCaseForSeeker({
    jobSeekerId: args.jobSeekerId,
    actorAccountManagerId: args.actorAccountManagerId,
  });

  const reviewedAt = new Date().toISOString();
  const updates: Record<string, unknown> = {
    last_manual_review_at: reviewedAt,
  };

  if (caseRecord.escalationStatus === "needs_manager_review") {
    updates.escalation_status = "manager_reviewed";
    updates.manager_reviewed_at = reviewedAt;
    updates.manager_reviewed_by_account_manager_id = args.actorAccountManagerId;
  }

  const { data, error } = await supabaseAdmin
    .from("client_delivery_cases")
    .update(updates)
    .eq("id", caseRecord.id)
    .select(CASE_SELECT_BASE)
    .single();

  if (error) {
    if (isDeliverySlaSchemaErrorMessage(error.message)) {
      throw createDeliverySlaUnavailableError();
    }
    throw new ClientDeliveryError(500, error.message);
  }

  if (caseRecord.escalationStatus === "needs_manager_review") {
    const escalations = await listClientDeliveryEscalationsForSeeker(args.jobSeekerId, {
      activeOnly: true,
    });
    const latestNeedsReview = escalations.find(
      (escalation) => escalation.status === "needs_manager_review"
    );

    if (latestNeedsReview) {
      await supabaseAdmin
        .from("client_delivery_escalations")
        .update({
          status: "manager_reviewed",
          reviewed_at: reviewedAt,
          reviewed_by_account_manager_id: args.actorAccountManagerId,
        })
        .eq("id", latestNeedsReview.id);
    }
  }

  return mapCaseRow(data as unknown as ClientDeliveryCaseRow);
}

export async function getClientDeliveryCaseBundleForSeeker(
  viewer: ClientDeliveryViewer,
  jobSeekerId: string
): Promise<ClientDeliveryCaseBundle> {
  const [snapshot, caseRecord, blockers, escalations] = await Promise.all([
    getClientDeliverySnapshotForSeeker(viewer, jobSeekerId),
    getClientDeliveryCaseForSeeker(jobSeekerId),
    listClientDeliveryBlockersForSeeker(jobSeekerId),
    listClientDeliveryEscalationsForSeeker(jobSeekerId),
  ]);

  return {
    snapshot,
    caseRecord,
    blockers,
    escalations,
  };
}
