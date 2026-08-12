import { supabaseAdmin } from "@/lib/auth";
import {
  getPlanBaseFee,
  normalizeOfferCode,
  type SupportedPlanType,
} from "@/lib/offers";

export type OfferPath = "discount" | "strategy_preview";
export type IntakeStatus =
  | "draft"
  | "submitted"
  | "pending_review"
  | "call_completed"
  | "waitlisted"
  | "approved_preview"
  | "preview_active"
  | "preview_expired"
  | "approved_payment_pending"
  | "active_client"
  | "rejected";

export const CAPACITY_COUNTED_STATUSES: IntakeStatus[] = [
  "approved_preview",
  "preview_active",
  "approved_payment_pending",
  "active_client",
];

export const PREVIEW_DURATION_DAYS = 7;

export const PREVIEW_APPROVAL_STATUSES: IntakeStatus[] = [
  "approved_preview",
  "preview_active",
  "preview_expired",
];

export type IntakeStateRecord = {
  id: string;
  job_seeker_id: string;
  selected_plan: SupportedPlanType | null;
  offer_path: OfferPath;
  submitted_code: string | null;
  discount_source: string | null;
  discount_code: string | null;
  base_registration_fee: number | string | null;
  discount_amount: number | string | null;
  final_registration_fee: number | string | null;
  status: IntakeStatus;
  onboarding_completed_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  call_completed_at: string | null;
  waitlisted_at: string | null;
  rejected_at: string | null;
  assigned_account_manager_id: string | null;
  reviewed_by: string | null;
  capacity_month: string | null;
  preview_agreed_at: string | null;
  preview_started_at: string | null;
  preview_expires_at: string | null;
  preview_converted_at: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type CapacityOverrideRecord = {
  account_manager_id: string;
  monthly_new_client_limit: number;
  notes: string | null;
};

type IntakeCountRecord = {
  assigned_account_manager_id: string | null;
};

type AccountManagerRecord = {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
  status: string | null;
};

export type CapacityRow = {
  accountManagerId: string;
  accountManagerName: string;
  email: string;
  monthlyLimit: number;
  approvedCount: number;
  spotsLeft: number;
  notes: string | null;
};

export type CapacitySnapshot = {
  capacityMonth: string;
  monthLabel: string;
  rows: CapacityRow[];
  totalCapacity: number;
  reservedCount: number;
  spotsLeft: number;
};

export type PublicCapacitySummary = {
  capacityMonth: string;
  monthLabel: string;
  spotsLeft: number | null;
  totalCapacity: number | null;
  reservedCount: number | null;
  hasExactCount: boolean;
};

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function getCapacityMonthStart(date = new Date()): string {
  const monthStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
  );
  return monthStart.toISOString().slice(0, 10);
}

export function formatCapacityMonthLabel(capacityMonth: string): string {
  const date = new Date(`${capacityMonth}T00:00:00.000Z`);
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function getPreviewExpiryFromDate(date = new Date()): string {
  const previewExpiry = new Date(date);
  previewExpiry.setDate(previewExpiry.getDate() + PREVIEW_DURATION_DAYS);
  return previewExpiry.toISOString();
}

function isPreviewExpired(record: IntakeStateRecord): boolean {
  return (
    record.status === "preview_active" &&
    typeof record.preview_expires_at === "string" &&
    new Date(record.preview_expires_at).getTime() <= Date.now()
  );
}

export async function syncExpiredPreviews(): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("job_seeker_intake_states")
    .update({ status: "preview_expired" })
    .eq("status", "preview_active")
    .lt("preview_expires_at", nowIso);

  if (error && !isIntakeSchemaMissingError(error)) {
    console.error("syncExpiredPreviews error:", error);
  }
}

export function isIntakeSchemaMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const row = error as { code?: string; message?: string; details?: string };
  const text = `${row.message ?? ""} ${row.details ?? ""}`.toLowerCase();
  return (
    row.code === "42P01" ||
    row.code === "42703" ||
    text.includes("job_seeker_intake_states") ||
    text.includes("account_manager_capacity")
  );
}

export async function getIntakeStateByJobSeekerId(
  jobSeekerId: string
): Promise<IntakeStateRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("job_seeker_intake_states")
    .select("*")
    .eq("job_seeker_id", jobSeekerId)
    .maybeSingle();

  if (error) {
    if (!isIntakeSchemaMissingError(error)) {
      console.error("getIntakeStateByJobSeekerId error:", error);
    }
    return null;
  }

  const record = (data as IntakeStateRecord | null) ?? null;
  if (record && isPreviewExpired(record)) {
    const expired = await upsertJobSeekerIntakeState({
      jobSeekerId,
      status: "preview_expired",
      metadata: {
        preview_auto_expired: true,
        preview_expired_at: new Date().toISOString(),
      },
    });
    return expired ?? record;
  }

  return record;
}

export async function isActiveClient(jobSeekerId: string): Promise<boolean> {
  const intakeState = await getIntakeStateByJobSeekerId(jobSeekerId);
  return intakeState?.status === "active_client";
}

export async function getLatestRegistrationPaymentForSeeker(jobSeekerId: string) {
  const { data, error } = await supabaseAdmin
    .from("registration_payments")
    .select("id, total_amount, amount_paid, credit_applied_amount, work_started, status")
    .eq("job_seeker_id", jobSeekerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("getLatestRegistrationPaymentForSeeker error:", error);
    return null;
  }

  return data;
}

export async function getLatestAssignmentForSeeker(jobSeekerId: string) {
  const { data, error } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("account_manager_id")
    .eq("job_seeker_id", jobSeekerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("getLatestAssignmentForSeeker error:", error);
    return null;
  }

  return data;
}

export async function getIntakeDefaultsForSeeker(jobSeekerId: string): Promise<{
  selectedPlan: SupportedPlanType | null;
  offerPath: OfferPath;
  submittedCode: string | null;
  discountSource: string | null;
  discountCode: string | null;
  baseRegistrationFee: number | null;
  discountAmount: number | null;
  finalRegistrationFee: number | null;
  onboardingCompletedAt: string | null;
}> {
  const [{ data: seeker }, { data: contract }, intakeState] = await Promise.all([
    supabaseAdmin
      .from("job_seekers")
      .select("plan_type, offer_code, onboarding_completed_at")
      .eq("id", jobSeekerId)
      .maybeSingle(),
    supabaseAdmin
      .from("job_seeker_contracts")
      .select(
        "plan_type, base_registration_fee, registration_fee, final_registration_fee, discount_amount, discount_source, discount_code"
      )
      .eq("job_seeker_id", jobSeekerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getIntakeStateByJobSeekerId(jobSeekerId),
  ]);

  const selectedPlan = (intakeState?.selected_plan ??
    contract?.plan_type ??
    seeker?.plan_type ??
    null) as SupportedPlanType | null;
  const submittedCode = normalizeOfferCode(
    (intakeState?.submitted_code as string | null | undefined) ??
      (contract?.discount_code as string | null | undefined) ??
      (seeker?.offer_code as string | null | undefined) ??
      null
  );
  const baseRegistrationFee =
    toNumber(intakeState?.base_registration_fee) > 0
      ? toNumber(intakeState?.base_registration_fee)
      : toNumber(contract?.base_registration_fee) > 0
      ? toNumber(contract?.base_registration_fee)
      : selectedPlan
      ? getPlanBaseFee(selectedPlan)
      : null;
  const finalRegistrationFee =
    toNumber(intakeState?.final_registration_fee) > 0
      ? toNumber(intakeState?.final_registration_fee)
      : toNumber(contract?.final_registration_fee) > 0
      ? toNumber(contract?.final_registration_fee)
      : toNumber(contract?.registration_fee) > 0
      ? toNumber(contract?.registration_fee)
      : baseRegistrationFee;

  return {
    selectedPlan,
    offerPath: intakeState?.offer_path ?? "discount",
    submittedCode,
    discountSource:
      (intakeState?.discount_source as string | null | undefined) ??
      (contract?.discount_source as string | null | undefined) ??
      null,
    discountCode: normalizeOfferCode(
      (intakeState?.discount_code as string | null | undefined) ??
        (contract?.discount_code as string | null | undefined) ??
        null
    ),
    baseRegistrationFee,
    discountAmount:
      toNumber(intakeState?.discount_amount) > 0
        ? toNumber(intakeState?.discount_amount)
        : toNumber(contract?.discount_amount) > 0
        ? toNumber(contract?.discount_amount)
        : 0,
    finalRegistrationFee,
    onboardingCompletedAt:
      (seeker?.onboarding_completed_at as string | null | undefined) ?? null,
  };
}

export async function upsertJobSeekerIntakeState(args: {
  jobSeekerId: string;
  selectedPlan?: SupportedPlanType | null;
  offerPath?: OfferPath;
  submittedCode?: string | null;
  discountSource?: string | null;
  discountCode?: string | null;
  baseRegistrationFee?: number | null;
  discountAmount?: number | null;
  finalRegistrationFee?: number | null;
  status?: IntakeStatus;
  onboardingCompletedAt?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  approvedAt?: string | null;
  waitlistedAt?: string | null;
  rejectedAt?: string | null;
  assignedAccountManagerId?: string | null;
  reviewedBy?: string | null;
  capacityMonth?: string | null;
  previewAgreedAt?: string | null;
  previewStartedAt?: string | null;
  previewExpiresAt?: string | null;
  previewConvertedAt?: string | null;
  callCompletedAt?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<IntakeStateRecord | null> {
  const existing = await getIntakeStateByJobSeekerId(args.jobSeekerId);
  const nowIso = new Date().toISOString();
  const payload: Record<string, unknown> = {};

  if (args.selectedPlan !== undefined) payload.selected_plan = args.selectedPlan;
  if (args.offerPath !== undefined) payload.offer_path = args.offerPath;
  if (args.submittedCode !== undefined) {
    payload.submitted_code = normalizeOfferCode(args.submittedCode);
  }
  if (args.discountSource !== undefined) payload.discount_source = args.discountSource;
  if (args.discountCode !== undefined) {
    payload.discount_code = normalizeOfferCode(args.discountCode);
  }
  if (args.baseRegistrationFee !== undefined) {
    payload.base_registration_fee = args.baseRegistrationFee;
  }
  if (args.discountAmount !== undefined) payload.discount_amount = args.discountAmount;
  if (args.finalRegistrationFee !== undefined) {
    payload.final_registration_fee = args.finalRegistrationFee;
  }
  if (args.onboardingCompletedAt !== undefined) {
    payload.onboarding_completed_at = args.onboardingCompletedAt;
  }
  if (args.assignedAccountManagerId !== undefined) {
    payload.assigned_account_manager_id = args.assignedAccountManagerId;
  }
  if (args.reviewedBy !== undefined) payload.reviewed_by = args.reviewedBy;
  if (args.capacityMonth !== undefined) payload.capacity_month = args.capacityMonth;
  if (args.previewAgreedAt !== undefined) payload.preview_agreed_at = args.previewAgreedAt;
  if (args.previewStartedAt !== undefined) payload.preview_started_at = args.previewStartedAt;
  if (args.previewExpiresAt !== undefined) payload.preview_expires_at = args.previewExpiresAt;
  if (args.previewConvertedAt !== undefined) {
    payload.preview_converted_at = args.previewConvertedAt;
  }
  if (args.callCompletedAt !== undefined) {
    payload.call_completed_at = args.callCompletedAt;
  }
  if (args.notes !== undefined) payload.notes = args.notes;
  if (args.metadata !== undefined) {
    payload.metadata = {
      ...(existing?.metadata ?? {}),
      ...args.metadata,
    };
  }

  if (args.status !== undefined) {
    payload.status = args.status;

    if (
      args.status === "pending_review" &&
      !existing?.submitted_at &&
      args.submittedAt === undefined
    ) {
      payload.submitted_at = nowIso;
    }

    if (
      (args.status === "approved_payment_pending" ||
        args.status === "active_client" ||
        args.status === "approved_preview" ||
        args.status === "preview_active") &&
      args.reviewedAt === undefined
    ) {
      payload.reviewed_at = existing?.reviewed_at ?? nowIso;
    }

    if (
      (args.status === "approved_payment_pending" ||
        args.status === "active_client" ||
        args.status === "approved_preview" ||
        args.status === "preview_active") &&
      args.approvedAt === undefined
    ) {
      payload.approved_at = existing?.approved_at ?? nowIso;
    }

    if (args.status === "call_completed" && args.callCompletedAt === undefined) {
      payload.call_completed_at = existing?.call_completed_at ?? nowIso;
      payload.reviewed_at = existing?.reviewed_at ?? nowIso;
    }

    if (args.status === "waitlisted" && args.waitlistedAt === undefined) {
      payload.waitlisted_at = nowIso;
      payload.reviewed_at = existing?.reviewed_at ?? nowIso;
    }

    if (args.status === "rejected" && args.rejectedAt === undefined) {
      payload.rejected_at = nowIso;
      payload.reviewed_at = existing?.reviewed_at ?? nowIso;
    }
  }

  if (args.submittedAt !== undefined) payload.submitted_at = args.submittedAt;
  if (args.reviewedAt !== undefined) payload.reviewed_at = args.reviewedAt;
  if (args.approvedAt !== undefined) payload.approved_at = args.approvedAt;
  if (args.waitlistedAt !== undefined) payload.waitlisted_at = args.waitlistedAt;
  if (args.rejectedAt !== undefined) payload.rejected_at = args.rejectedAt;

  const mutation = existing?.id
    ? supabaseAdmin
        .from("job_seeker_intake_states")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single()
    : supabaseAdmin
        .from("job_seeker_intake_states")
        .insert({
          job_seeker_id: args.jobSeekerId,
          offer_path: args.offerPath ?? "discount",
          ...payload,
        })
        .select("*")
        .single();

  const { data, error } = await mutation;
  if (error) {
    console.error("upsertJobSeekerIntakeState error:", error);
    return null;
  }

  return (data as IntakeStateRecord | null) ?? null;
}

export async function assignJobSeekerToAccountManager(
  jobSeekerId: string,
  accountManagerId: string
): Promise<void> {
  const { error: deleteError } = await supabaseAdmin
    .from("job_seeker_assignments")
    .delete()
    .eq("job_seeker_id", jobSeekerId);

  if (deleteError) {
    console.error("assignJobSeekerToAccountManager delete error:", deleteError);
    return;
  }

  const { error: insertError } = await supabaseAdmin
    .from("job_seeker_assignments")
    .insert({
      job_seeker_id: jobSeekerId,
      account_manager_id: accountManagerId,
    });

  if (insertError && insertError.code !== "23505") {
    console.error("assignJobSeekerToAccountManager insert error:", insertError);
  }
}

export async function getCapacitySnapshot(
  capacityMonth = getCapacityMonthStart()
): Promise<CapacitySnapshot> {
  await syncExpiredPreviews();

  const [{ data: accountManagers, error: amError }, { data: overrides, error: overrideError }, { data: counts, error: countsError }] =
    await Promise.all([
      supabaseAdmin
        .from("account_managers")
        .select("id, name, email, role, status")
        .eq("status", "approved")
        .eq("role", "am")
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("account_manager_capacity")
        .select("account_manager_id, monthly_new_client_limit, notes")
        .eq("capacity_month", capacityMonth),
      supabaseAdmin
        .from("job_seeker_intake_states")
        .select("assigned_account_manager_id")
        .eq("capacity_month", capacityMonth)
        .in("status", CAPACITY_COUNTED_STATUSES),
    ]);

  if (amError) throw amError;
  if (overrideError) throw overrideError;
  if (countsError) throw countsError;

  const overrideMap = new Map(
    ((overrides as CapacityOverrideRecord[] | null) ?? []).map((row) => [
      row.account_manager_id,
      row,
    ])
  );
  const countMap = new Map<string, number>();
  for (const row of ((counts as IntakeCountRecord[] | null) ?? [])) {
    if (!row.assigned_account_manager_id) continue;
    countMap.set(
      row.assigned_account_manager_id,
      (countMap.get(row.assigned_account_manager_id) ?? 0) + 1
    );
  }

  const rows: CapacityRow[] = ((accountManagers as AccountManagerRecord[] | null) ?? []).map(
    (accountManager) => {
      const override = overrideMap.get(accountManager.id);
      const monthlyLimit = override?.monthly_new_client_limit ?? 4;
      const approvedCount = countMap.get(accountManager.id) ?? 0;
      return {
        accountManagerId: accountManager.id,
        accountManagerName:
          accountManager.name?.trim() || accountManager.email.split("@")[0],
        email: accountManager.email,
        monthlyLimit,
        approvedCount,
        spotsLeft: Math.max(0, monthlyLimit - approvedCount),
        notes: override?.notes ?? null,
      };
    }
  );

  const totalCapacity = rows.reduce((sum, row) => sum + row.monthlyLimit, 0);
  const reservedCount = rows.reduce((sum, row) => sum + row.approvedCount, 0);

  return {
    capacityMonth,
    monthLabel: formatCapacityMonthLabel(capacityMonth),
    rows,
    totalCapacity,
    reservedCount,
    spotsLeft: Math.max(0, totalCapacity - reservedCount),
  };
}

export async function getPublicCapacitySummary(): Promise<PublicCapacitySummary> {
  try {
    const snapshot = await getCapacitySnapshot();
    return {
      capacityMonth: snapshot.capacityMonth,
      monthLabel: snapshot.monthLabel,
      spotsLeft: snapshot.spotsLeft,
      totalCapacity: snapshot.totalCapacity,
      reservedCount: snapshot.reservedCount,
      hasExactCount: true,
    };
  } catch (error) {
    if (!isIntakeSchemaMissingError(error)) {
      console.error("getPublicCapacitySummary error:", error);
    }
    return {
      capacityMonth: getCapacityMonthStart(),
      monthLabel: formatCapacityMonthLabel(getCapacityMonthStart()),
      spotsLeft: null,
      totalCapacity: null,
      reservedCount: null,
      hasExactCount: false,
    };
  }
}
