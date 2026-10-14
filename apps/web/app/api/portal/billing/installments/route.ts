import { NextResponse } from "next/server";
import { requireJobSeeker, supabaseAdmin } from "@/lib/auth";
import { applyAvailableReferralCredits } from "@/lib/referrals";
import {
  getIntakeStateByJobSeekerId,
  upsertJobSeekerIntakeState,
} from "@/lib/intake";

const DEFAULT_MAX_INSTALLMENTS = 3;
const DEFAULT_WINDOW_DAYS = 31;

export async function POST(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    count?: number;
    installments?: { amount: number; proposedDate: string }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { count, installments } = body as {
    count: number;
    installments: { amount: number; proposedDate: string }[];
  };

  const [{ data: contract }, { data: approvedFlex }] = await Promise.all([
    supabaseAdmin
      .from("job_seeker_contracts")
      .select("id, registration_fee")
      .eq("job_seeker_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("registration_flex_requests")
      .select("approved_max_installments, approved_window_days")
      .eq("job_seeker_id", auth.user.id)
      .eq("status", "approved")
      .order("reviewed_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!contract) {
    return NextResponse.json({ error: "No signed contract found. Please complete the contract step first." }, { status: 400 });
  }

  const maxInstallments =
    approvedFlex?.approved_max_installments ?? DEFAULT_MAX_INSTALLMENTS;
  const paymentWindowDays = approvedFlex?.approved_window_days ?? DEFAULT_WINDOW_DAYS;

  if (!count || count < 1 || count > maxInstallments) {
    return NextResponse.json(
      {
        error: `Installment count must be between 1 and ${maxInstallments}.`,
      },
      { status: 400 }
    );
  }

  if (!Array.isArray(installments) || installments.length !== count) {
    return NextResponse.json({ error: "Installments array length must match count." }, { status: 400 });
  }

  // Validate total matches fee
  const totalAmount = installments.reduce((sum, i) => sum + i.amount, 0);
  if (Math.abs(totalAmount - contract.registration_fee) > 0.01) {
    return NextResponse.json(
      { error: `Installment total ($${totalAmount}) must equal registration fee ($${contract.registration_fee}).` },
      { status: 400 }
    );
  }

  // Validate all dates within the allowed payment window
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + paymentWindowDays);

  for (const inst of installments) {
    const d = new Date(inst.proposedDate);
    if (d < today || d > maxDate) {
      return NextResponse.json(
        {
          error: `All payment dates must be within ${paymentWindowDays} days of today.`,
        },
        { status: 400 }
      );
    }
    if (inst.amount <= 0) {
      return NextResponse.json({ error: "Each installment amount must be greater than 0." }, { status: 400 });
    }
  }

  const paymentPayload = {
    job_seeker_id: auth.user.id,
    contract_id: contract.id,
    total_amount: contract.registration_fee,
    amount_paid: 0,
    status: "pending" as const,
    payment_deadline: maxDate.toISOString(),
    work_started: false,
  };
  const intakeState = await getIntakeStateByJobSeekerId(auth.user.id);

  const { data: existingPayment, error: existingPaymentError } = await supabaseAdmin
    .from("registration_payments")
    .select("id, amount_paid, credit_applied_amount, work_started")
    .eq("job_seeker_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingPaymentError) {
    console.error("Billing payment lookup failed:", existingPaymentError);
    return NextResponse.json({ error: "Failed to create payment record." }, { status: 500 });
  }

  const existingAmountPaid = Number(existingPayment?.amount_paid ?? 0);
  const existingCreditAppliedAmount = Number(
    existingPayment?.credit_applied_amount ?? 0
  );
  const preservedAmountPaid = Number.isFinite(existingAmountPaid)
    ? existingAmountPaid
    : 0;
  const preservedCreditAppliedAmount = Number.isFinite(existingCreditAppliedAmount)
    ? existingCreditAppliedAmount
    : 0;
  const nextStatus =
    preservedAmountPaid + preservedCreditAppliedAmount >= Number(contract.registration_fee)
      ? "complete"
      : preservedAmountPaid + preservedCreditAppliedAmount > 0
      ? "partial"
      : "pending";

  const paymentMutation = existingPayment
    ? supabaseAdmin
        .from("registration_payments")
        .update({
          ...paymentPayload,
          amount_paid: preservedAmountPaid,
          credit_applied_amount: preservedCreditAppliedAmount,
          intake_state_id: intakeState?.id ?? null,
          work_started:
            preservedAmountPaid + preservedCreditAppliedAmount > 0 ||
            Boolean(existingPayment.work_started),
          status: nextStatus,
        })
        .eq("id", existingPayment.id)
        .select()
        .single()
    : supabaseAdmin
        .from("registration_payments")
        .insert({
          ...paymentPayload,
          intake_state_id: intakeState?.id ?? null,
        })
        .select()
        .single();

  const { data: regPayment, error: regError } = await paymentMutation;

  if (regError || !regPayment) {
    console.error("Billing payment save failed:", regError);
    return NextResponse.json({ error: "Failed to create payment record." }, { status: 500 });
  }

  await applyAvailableReferralCredits(auth.user.id);

  // Delete old installments and re-insert
  const { error: deleteInstError } = await supabaseAdmin
    .from("payment_installments")
    .delete()
    .eq("registration_payment_id", regPayment.id);

  if (deleteInstError) {
    console.error("[portal:billing] failed to delete old installments:", deleteInstError);
  }

  const installmentRows = installments.map((inst, i) => ({
    registration_payment_id: regPayment.id,
    job_seeker_id: auth.user.id,
    installment_number: i + 1,
    amount: inst.amount,
    proposed_date: inst.proposedDate,
    status: "pending" as const,
  }));

  const { data: savedInstallments, error: instError } = await supabaseAdmin
    .from("payment_installments")
    .insert(installmentRows)
    .select();

  if (instError) {
    return NextResponse.json({ error: "Failed to save installment plan." }, { status: 500 });
  }

  if (
    intakeState &&
    intakeState.offer_path === "strategy_preview" &&
    ["approved_preview", "preview_active", "preview_expired"].includes(
      intakeState.status
    )
  ) {
    await upsertJobSeekerIntakeState({
      jobSeekerId: auth.user.id,
      status: "approved_payment_pending",
      metadata: {
        preview_payment_plan_created_at: new Date().toISOString(),
      },
    });
  }

  return NextResponse.json({ ok: true, registrationPaymentId: regPayment.id, installments: savedInstallments }, { status: 201 });
}
