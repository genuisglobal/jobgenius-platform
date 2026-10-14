import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/audit";
import {
  assignJobSeekerToAccountManager,
  getCapacityMonthStart,
  getCapacitySnapshot,
  getLatestRegistrationPaymentForSeeker,
  upsertJobSeekerIntakeState,
} from "@/lib/intake";

type RouteContext = {
  params: { id: string };
};

function normalizeCapacityMonth(input?: string | null) {
  if (!input) return getCapacityMonthStart();
  return /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : getCapacityMonthStart();
}

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    accountManagerId?: string;
    capacityMonth?: string;
    notes?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const accountManagerId = body.accountManagerId;
  const capacityMonth = normalizeCapacityMonth(body.capacityMonth);
  const notes =
    typeof body.notes === "string" ? body.notes.trim() || null : null;

  if (!accountManagerId) {
    return NextResponse.json(
      { error: "accountManagerId is required." },
      { status: 400 }
    );
  }

  const { data: intakeState, error: intakeError } = await supabaseAdmin
    .from("job_seeker_intake_states")
    .select("id, job_seeker_id, status, offer_path")
    .eq("id", params.id)
    .maybeSingle();

  if (intakeError || !intakeState) {
    return NextResponse.json({ error: "Intake state not found." }, { status: 404 });
  }

  const snapshot = await getCapacitySnapshot(capacityMonth);
  const capacityRow = snapshot.rows.find(
    (row) => row.accountManagerId === accountManagerId
  );

  if (!capacityRow) {
    return NextResponse.json(
      { error: "That account manager cannot take capacity reservations." },
      { status: 400 }
    );
  }

  if (intakeState.offer_path === "strategy_preview" && intakeState.status !== "call_completed") {
    return NextResponse.json(
      { error: "Mark the first call complete before approving preview." },
      { status: 409 }
    );
  }

  if (capacityRow.spotsLeft <= 0) {
    return NextResponse.json(
      { error: "That account manager has no spots left for this month." },
      { status: 409 }
    );
  }

  await assignJobSeekerToAccountManager(intakeState.job_seeker_id, accountManagerId);

  const registrationPayment =
    intakeState.offer_path === "strategy_preview"
      ? null
      : await getLatestRegistrationPaymentForSeeker(intakeState.job_seeker_id);
  const coveredAmount =
    Number(registrationPayment?.amount_paid ?? 0) +
    Number(registrationPayment?.credit_applied_amount ?? 0);
  const nextStatus =
    intakeState.offer_path === "strategy_preview"
      ? "approved_preview"
      : registrationPayment?.work_started || coveredAmount > 0
      ? "active_client"
      : "approved_payment_pending";

  const updatedIntake = await upsertJobSeekerIntakeState({
    jobSeekerId: intakeState.job_seeker_id,
    status: nextStatus,
    assignedAccountManagerId: accountManagerId,
    reviewedBy: auth.user.id,
    capacityMonth,
    notes,
  });

  if (registrationPayment?.id && updatedIntake?.id) {
    await supabaseAdmin
      .from("registration_payments")
      .update({ intake_state_id: updatedIntake.id })
      .eq("id", registrationPayment.id);
  }

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    action: "intake.approve",
    targetType: "job_seeker_intake_state",
    targetId: params.id,
    details: {
      job_seeker_id: intakeState.job_seeker_id,
      account_manager_id: accountManagerId,
      capacity_month: capacityMonth,
      offer_path: intakeState.offer_path,
      next_status: nextStatus,
    },
  }).catch((error) => console.error("Audit log failed", error));

  return NextResponse.json({ ok: true, intakeState: updatedIntake });
}
