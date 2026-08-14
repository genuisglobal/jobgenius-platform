import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import ReferralsClient from "./ReferralsClient";

export const metadata = { title: "Referrals | JobGenius" };

export default async function ReferralsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const seekerId = user.id;

  const [seekerRes, referralsRes, creditsRes, registrationPaymentRes] =
    await Promise.all([
      supabaseAdmin
        .from("job_seekers")
        .select("referral_code")
        .eq("id", seekerId)
        .single(),
      supabaseAdmin
        .from("referrals")
        .select(
          "id, referred_id, status, reward_amount, reward_paid_at, signed_up_at, placed_at"
        )
        .eq("referrer_id", seekerId)
        .order("signed_up_at", { ascending: false }),
      supabaseAdmin
        .from("referral_registration_credits")
        .select(
          "referral_id, credit_amount, remaining_amount, status, earned_at, applied_at"
        )
        .eq("job_seeker_id", seekerId),
      supabaseAdmin
        .from("registration_payments")
        .select("total_amount, amount_paid, credit_applied_amount")
        .eq("job_seeker_id", seekerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const referredIds = (referralsRes.data ?? [])
    .map((referral) => referral.referred_id)
    .filter(Boolean) as string[];

  let nameMap: Record<string, string> = {};
  if (referredIds.length > 0) {
    const { data: referred } = await supabaseAdmin
      .from("job_seekers")
      .select("id, full_name")
      .in("id", referredIds);

    for (const seeker of referred ?? []) {
      const initial =
        (seeker.full_name as string | null)?.trim().charAt(0).toUpperCase() ?? "?";
      nameMap[seeker.id] = initial;
    }
  }

  const creditByReferralId = new Map(
    (creditsRes.data ?? []).map((credit) => [credit.referral_id as string, credit])
  );

  const rows = (referralsRes.data ?? []).map((referral) => {
    const credit = creditByReferralId.get(referral.id as string);
    return {
      id: referral.id as string,
      referred_initial: referral.referred_id
        ? (nameMap[referral.referred_id] ?? "?")
        : "?",
      status: referral.status as "signed_up" | "placed" | "rewarded",
      signed_up_at: referral.signed_up_at as string,
      placed_at: referral.placed_at as string | null,
      credit_amount:
        credit?.credit_amount != null
          ? Number(credit.credit_amount)
          : referral.reward_amount != null
          ? Number(referral.reward_amount)
          : null,
      credit_status: (credit?.status as
        | "earned"
        | "partially_applied"
        | "applied"
        | "expired"
        | "voided"
        | undefined) ?? null,
      credited_at:
        (credit?.earned_at as string | undefined) ??
        (referral.reward_paid_at as string | null),
    };
  });

  const totalCreditsEarned = (creditsRes.data ?? []).reduce(
    (sum, credit) => sum + Number(credit.credit_amount ?? 0),
    0
  );
  const availableCredits = (creditsRes.data ?? []).reduce(
    (sum, credit) => sum + Number(credit.remaining_amount ?? 0),
    0
  );
  const appliedCredits = (creditsRes.data ?? []).reduce(
    (sum, credit) =>
      sum +
      Math.max(
        0,
        Number(credit.credit_amount ?? 0) - Number(credit.remaining_amount ?? 0)
      ),
    0
  );

  const registrationPayment = registrationPaymentRes.data;
  const registrationBalanceRemaining = registrationPayment
    ? Math.max(
        0,
        Number(registrationPayment.total_amount) -
          Number(registrationPayment.amount_paid) -
          Number(registrationPayment.credit_applied_amount ?? 0)
      )
    : null;

  const stats = {
    totalReferred: rows.length,
    signedUp: rows.filter((row) => row.status === "signed_up").length,
    inReview: rows.filter((row) => row.status === "placed").length,
    credited: rows.filter((row) => row.credit_amount != null && row.credit_amount > 0)
      .length,
    totalCreditsEarned,
    availableCredits,
    appliedCredits,
    registrationBalanceRemaining,
  };

  return (
    <ReferralsClient
      referralCode={seekerRes.data?.referral_code ?? ""}
      stats={stats}
      referrals={rows}
    />
  );
}
