import { supabaseAdmin } from "@/lib/auth";
import {
  calculateReferralCreditAmount,
  getPlanBaseFee,
  type SupportedPlanType,
} from "@/lib/offers";

export type ReferralStatus = "signed_up" | "placed" | "rewarded";
export type ReferralCreditStatus =
  | "earned"
  | "partially_applied"
  | "applied"
  | "expired"
  | "voided";

export interface Referral {
  id: string;
  referrer_id: string;
  referred_id: string | null;
  status: ReferralStatus;
  reward_amount: number | null;
  reward_paid_at: string | null;
  reward_notes: string | null;
  signed_up_at: string;
  placed_at: string | null;
  created_at: string;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * Look up a job seeker by their referral code.
 * Returns the seeker id or null if not found.
 */
export async function getReferrerByCode(code: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("job_seekers")
    .select("id")
    .eq("referral_code", code.trim().toUpperCase())
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Create a referral row linking referrer -> referred seeker.
 * Uses the referrals unique constraint to avoid duplicates.
 */
export async function createReferral(
  referrerId: string,
  referredId: string
): Promise<void> {
  const { error } = await supabaseAdmin.from("referrals").insert({
    referrer_id: referrerId,
    referred_id: referredId,
    status: "signed_up",
    signed_up_at: new Date().toISOString(),
  });

  if (error && error.code !== "23505") {
    console.error("createReferral error:", error);
  }
}

/**
 * Mark a referral as placed when the referred seeker is hired.
 * Only transitions rows that are still in signed_up status.
 */
export async function markReferralPlaced(referredId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("referrals")
    .update({
      status: "placed",
      placed_at: new Date().toISOString(),
    })
    .eq("referred_id", referredId)
    .eq("status", "signed_up");

  if (error) {
    console.error("markReferralPlaced error:", error);
  }
}

async function getReferrerBaseRegistrationFee(
  jobSeekerId: string
): Promise<number | null> {
  const { data: contract } = await supabaseAdmin
    .from("job_seeker_contracts")
    .select("base_registration_fee, registration_fee")
    .eq("job_seeker_id", jobSeekerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const baseFromContract = toNumber(contract?.base_registration_fee);
  if (baseFromContract > 0) return baseFromContract;

  const finalFromContract = toNumber(contract?.registration_fee);
  if (finalFromContract > 0) return finalFromContract;

  const { data: seeker } = await supabaseAdmin
    .from("job_seekers")
    .select("plan_type")
    .eq("id", jobSeekerId)
    .maybeSingle();

  const planType = seeker?.plan_type as SupportedPlanType | null | undefined;
  if (planType === "essentials" || planType === "premium") {
    return getPlanBaseFee(planType);
  }

  return null;
}

function buildRegistrationStatus(args: {
  totalAmount: number;
  amountPaid: number;
  creditAppliedAmount: number;
}): "pending" | "partial" | "complete" {
  const coveredAmount = roundCurrency(
    args.amountPaid + args.creditAppliedAmount
  );
  const totalAmount = roundCurrency(args.totalAmount);

  if (coveredAmount >= totalAmount && totalAmount > 0) {
    return "complete";
  }
  if (coveredAmount > 0) {
    return "partial";
  }
  return "pending";
}

export async function applyAvailableReferralCredits(jobSeekerId: string): Promise<{
  appliedAmount: number;
  remainingWalletAmount: number;
}> {
  const { data: registrationPayment, error: paymentError } = await supabaseAdmin
    .from("registration_payments")
    .select(
      "id, contract_id, total_amount, amount_paid, credit_applied_amount, work_started"
    )
    .eq("job_seeker_id", jobSeekerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: credits, error: creditsError } = await supabaseAdmin
    .from("referral_registration_credits")
    .select("id, credit_amount, remaining_amount, status")
    .eq("job_seeker_id", jobSeekerId)
    .in("status", ["earned", "partially_applied"])
    .order("earned_at", { ascending: true });

  if (paymentError) {
    console.error("applyAvailableReferralCredits payment lookup error:", paymentError);
    return { appliedAmount: 0, remainingWalletAmount: 0 };
  }

  if (creditsError) {
    console.error("applyAvailableReferralCredits credits lookup error:", creditsError);
    return { appliedAmount: 0, remainingWalletAmount: 0 };
  }

  const remainingWalletAmount = roundCurrency(
    (credits ?? []).reduce(
      (sum, credit) => sum + toNumber(credit.remaining_amount),
      0
    )
  );

  if (!registrationPayment || !credits || credits.length === 0) {
    return { appliedAmount: 0, remainingWalletAmount };
  }

  const totalAmount = toNumber(registrationPayment.total_amount);
  const amountPaid = toNumber(registrationPayment.amount_paid);
  const currentCreditApplied = toNumber(registrationPayment.credit_applied_amount);
  let remainingBalance = roundCurrency(
    totalAmount - amountPaid - currentCreditApplied
  );

  if (remainingBalance <= 0) {
    return { appliedAmount: 0, remainingWalletAmount };
  }

  let totalAppliedNow = 0;

  for (const credit of credits) {
    if (remainingBalance <= 0) break;

    const availableAmount = roundCurrency(toNumber(credit.remaining_amount));
    if (availableAmount <= 0) continue;

    const amountToApply = roundCurrency(Math.min(remainingBalance, availableAmount));
    if (amountToApply <= 0) continue;

    const nextRemainingAmount = roundCurrency(availableAmount - amountToApply);
    const nextStatus: ReferralCreditStatus =
      nextRemainingAmount <= 0 ? "applied" : "partially_applied";

    const { error: creditUpdateError } = await supabaseAdmin
      .from("referral_registration_credits")
      .update({
        remaining_amount: nextRemainingAmount,
        status: nextStatus,
        applied_at: new Date().toISOString(),
        applied_contract_id: registrationPayment.contract_id ?? null,
        applied_registration_payment_id: registrationPayment.id,
      })
      .eq("id", credit.id);

    if (creditUpdateError) {
      console.error("applyAvailableReferralCredits credit update error:", creditUpdateError);
      continue;
    }

    totalAppliedNow = roundCurrency(totalAppliedNow + amountToApply);
    remainingBalance = roundCurrency(remainingBalance - amountToApply);
  }

  if (totalAppliedNow <= 0) {
    return { appliedAmount: 0, remainingWalletAmount };
  }

  const nextCreditAppliedAmount = roundCurrency(
    currentCreditApplied + totalAppliedNow
  );
  const nextStatus = buildRegistrationStatus({
    totalAmount,
    amountPaid,
    creditAppliedAmount: nextCreditAppliedAmount,
  });

  const { error: paymentUpdateError } = await supabaseAdmin
    .from("registration_payments")
    .update({
      credit_applied_amount: nextCreditAppliedAmount,
      status: nextStatus,
      work_started: amountPaid + nextCreditAppliedAmount > 0,
    })
    .eq("id", registrationPayment.id);

  if (paymentUpdateError) {
    console.error("applyAvailableReferralCredits payment update error:", paymentUpdateError);
  }

  return {
    appliedAmount: totalAppliedNow,
    remainingWalletAmount: roundCurrency(remainingWalletAmount - totalAppliedNow),
  };
}

export async function awardReferralRegistrationCreditForReferredSeeker(
  referredJobSeekerId: string
): Promise<void> {
  const { data: referral, error: referralError } = await supabaseAdmin
    .from("referrals")
    .select("id, referrer_id, status, reward_amount")
    .eq("referred_id", referredJobSeekerId)
    .maybeSingle();

  if (referralError) {
    console.error("awardReferralRegistrationCredit referral lookup error:", referralError);
    return;
  }

  if (!referral?.id || !referral.referrer_id) {
    return;
  }

  const { data: existingCredit } = await supabaseAdmin
    .from("referral_registration_credits")
    .select("id")
    .eq("referral_id", referral.id)
    .maybeSingle();

  if (existingCredit?.id) {
    return;
  }

  const baseRegistrationFee = await getReferrerBaseRegistrationFee(referral.referrer_id);
  if (!baseRegistrationFee || baseRegistrationFee <= 0) {
    console.error(
      "awardReferralRegistrationCredit missing base registration fee for referrer:",
      referral.referrer_id
    );
    return;
  }

  const { data: existingCredits } = await supabaseAdmin
    .from("referral_registration_credits")
    .select("credit_amount")
    .eq("job_seeker_id", referral.referrer_id)
    .not("status", "eq", "voided");

  const alreadyEarned = roundCurrency(
    (existingCredits ?? []).reduce(
      (sum, credit) => sum + toNumber(credit.credit_amount),
      0
    )
  );
  const creditCap = roundCurrency(baseRegistrationFee * 0.5);
  const remainingCap = roundCurrency(Math.max(0, creditCap - alreadyEarned));

  if (remainingCap <= 0) {
    await supabaseAdmin
      .from("referrals")
      .update({
        status: "rewarded",
        reward_amount: 0,
        reward_paid_at: new Date().toISOString(),
        reward_notes: "Referral credit cap reached before this referral converted.",
      })
      .eq("id", referral.id);
    return;
  }

  const earnedCreditAmount = roundCurrency(
    Math.min(calculateReferralCreditAmount(baseRegistrationFee), remainingCap)
  );

  const nowIso = new Date().toISOString();
  const { error: creditInsertError } = await supabaseAdmin
    .from("referral_registration_credits")
    .insert({
      referral_id: referral.id,
      job_seeker_id: referral.referrer_id,
      credit_percent: 0.05,
      credit_amount: earnedCreditAmount,
      remaining_amount: earnedCreditAmount,
      status: "earned",
      earned_at: nowIso,
      notes: "Created after referred seeker completed their first confirmed registration payment.",
    });

  if (creditInsertError) {
    console.error("awardReferralRegistrationCredit insert error:", creditInsertError);
    return;
  }

  await supabaseAdmin
    .from("referrals")
    .update({
      status: "rewarded",
      reward_amount: earnedCreditAmount,
      reward_paid_at: nowIso,
      reward_notes: "Registration credit earned.",
    })
    .eq("id", referral.id);

  await applyAvailableReferralCredits(referral.referrer_id);
}
