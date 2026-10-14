import { supabaseAdmin } from "@/lib/auth";

export type SupportedPlanType = "essentials" | "premium";
export type OfferCodeSource = "promo_code" | "seeker_referral" | null;

export interface ResolvedOfferQuote {
  planType: SupportedPlanType;
  code: string | null;
  source: OfferCodeSource;
  applied: boolean;
  invalidCode: boolean;
  baseFee: number;
  discountPercent: number;
  discountAmount: number;
  finalFee: number;
  promoCodeId: string | null;
  referrerId: string | null;
  message?: string;
}

const PLAN_BASE_FEES: Record<SupportedPlanType, number> = {
  essentials: 500,
  premium: 1000,
};

const SEEKER_REFERRAL_DISCOUNT: Record<SupportedPlanType, number> = {
  essentials: 0.2,
  premium: 0.25,
};

export function getPlanBaseFee(planType: SupportedPlanType): number {
  return PLAN_BASE_FEES[planType];
}

export function getReferralDiscountPercent(planType: SupportedPlanType): number {
  return SEEKER_REFERRAL_DISCOUNT[planType];
}

export function normalizeOfferCode(code?: string | null): string | null {
  if (typeof code !== "string") return null;
  const trimmed = code.trim().toUpperCase();
  return trimmed || null;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildQuote(
  planType: SupportedPlanType,
  args?: Partial<ResolvedOfferQuote>
): ResolvedOfferQuote {
  const baseFee = getPlanBaseFee(planType);
  const discountPercent = args?.discountPercent ?? 0;
  const discountAmount = roundCurrency(baseFee * discountPercent);
  const finalFee = roundCurrency(baseFee - discountAmount);

  return {
    planType,
    code: args?.code ?? null,
    source: args?.source ?? null,
    applied: Boolean(args?.applied),
    invalidCode: Boolean(args?.invalidCode),
    baseFee,
    discountPercent,
    discountAmount,
    finalFee,
    promoCodeId: args?.promoCodeId ?? null,
    referrerId: args?.referrerId ?? null,
    message: args?.message,
  };
}

export function buildBaseOfferQuote(
  planType: SupportedPlanType
): ResolvedOfferQuote {
  return buildQuote(planType);
}

type PromoCodeRow = {
  id: string;
  code: string;
  status: string;
  discount_percent_essentials: number | string | null;
  discount_percent_premium: number | string | null;
  starts_at: string | null;
  ends_at: string | null;
  max_redemptions: number | null;
  redemption_count: number | null;
};

function parseNumeric(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function promoIsRedeemable(promo: PromoCodeRow): boolean {
  if (promo.status !== "active") return false;

  const now = Date.now();
  if (promo.starts_at && new Date(promo.starts_at).getTime() > now) return false;
  if (promo.ends_at && new Date(promo.ends_at).getTime() < now) return false;

  if (
    typeof promo.max_redemptions === "number" &&
    promo.max_redemptions > 0 &&
    (promo.redemption_count ?? 0) >= promo.max_redemptions
  ) {
    return false;
  }

  return true;
}

export async function resolveOfferQuote(params: {
  planType: SupportedPlanType;
  code?: string | null;
  currentJobSeekerId?: string | null;
}): Promise<ResolvedOfferQuote> {
  const { planType } = params;
  const normalizedCode = normalizeOfferCode(params.code);

  if (!normalizedCode) {
    return buildQuote(planType);
  }

  const { data: promoCode } = await supabaseAdmin
    .from("promo_codes")
    .select(
      "id, code, status, discount_percent_essentials, discount_percent_premium, starts_at, ends_at, max_redemptions, redemption_count"
    )
    .eq("code", normalizedCode)
    .maybeSingle();

  if (promoCode && promoIsRedeemable(promoCode as PromoCodeRow)) {
    const promo = promoCode as PromoCodeRow;
    const discountPercent =
      planType === "premium"
        ? parseNumeric(promo.discount_percent_premium)
        : parseNumeric(promo.discount_percent_essentials);

    return buildQuote(planType, {
      code: normalizedCode,
      source: "promo_code",
      applied: true,
      discountPercent,
      promoCodeId: promo.id,
      message: "Promo code applied.",
    });
  }

  const { data: referrer } = await supabaseAdmin
    .from("job_seekers")
    .select("id")
    .eq("referral_code", normalizedCode)
    .maybeSingle();

  if (referrer?.id && referrer.id !== params.currentJobSeekerId) {
    return buildQuote(planType, {
      code: normalizedCode,
      source: "seeker_referral",
      applied: true,
      discountPercent: getReferralDiscountPercent(planType),
      referrerId: referrer.id as string,
      message: "Referral discount applied.",
    });
  }

  return buildQuote(planType, {
    code: normalizedCode,
    invalidCode: true,
    message: "Code not recognized.",
  });
}

export async function incrementPromoRedemptionCount(
  promoCodeId: string
): Promise<void> {
  const { data: promo } = await supabaseAdmin
    .from("promo_codes")
    .select("redemption_count")
    .eq("id", promoCodeId)
    .maybeSingle();

  if (!promo) return;

  const nextCount = Math.max(0, Number(promo.redemption_count ?? 0)) + 1;
  const { error } = await supabaseAdmin
    .from("promo_codes")
    .update({ redemption_count: nextCount })
    .eq("id", promoCodeId);

  if (error) {
    console.error("incrementPromoRedemptionCount error:", error);
  }
}

export function calculateReferralCreditAmount(registrationFee: number): number {
  return roundCurrency(registrationFee * 0.05);
}
