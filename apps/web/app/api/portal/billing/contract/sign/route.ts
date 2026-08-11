import { NextResponse } from "next/server";
import { requireJobSeeker, supabaseAdmin } from "@/lib/auth";
import {
  buildBaseOfferQuote,
  incrementPromoRedemptionCount,
  normalizeOfferCode,
  resolveOfferQuote,
  type SupportedPlanType,
} from "@/lib/offers";
import {
  getIntakeStateByJobSeekerId,
  upsertJobSeekerIntakeState,
} from "@/lib/intake";
import { generateContractHTML } from "@/lib/contract-template";

type ContractSignBody = {
  planType?: SupportedPlanType;
  offerCode?: string | null;
};

export async function POST(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: ContractSignBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const planType = body.planType;
  if (planType !== "essentials" && planType !== "premium") {
    return NextResponse.json({ error: "Invalid plan type." }, { status: 400 });
  }

  const normalizedOfferCode = normalizeOfferCode(body.offerCode);
  const intakeState = await getIntakeStateByJobSeekerId(auth.user.id);
  const isStrategyPreviewConversion = intakeState?.offer_path === "strategy_preview";

  if (
    isStrategyPreviewConversion &&
    ![
      "approved_preview",
      "preview_active",
      "preview_expired",
      "approved_payment_pending",
      "active_client",
    ].includes(intakeState.status)
  ) {
    return NextResponse.json(
      { error: "This strategy preview is not ready for paid conversion yet." },
      { status: 409 }
    );
  }

  const quote = isStrategyPreviewConversion
    ? buildBaseOfferQuote(planType)
    : await resolveOfferQuote({
        planType,
        code: normalizedOfferCode,
        currentJobSeekerId: auth.user.id,
      });

  const { data: seeker, error: seekerLookupError } = await supabaseAdmin
    .from("job_seekers")
    .select("id, email, full_name")
    .eq("id", auth.user.id)
    .single();

  if (seekerLookupError || !seeker) {
    console.error("Billing seeker lookup failed:", seekerLookupError);
    return NextResponse.json({ error: "Failed to load seeker record." }, { status: 500 });
  }

  const contractHTML = generateContractHTML({
    seekerName: seeker.full_name || seeker.email || auth.user.email,
    seekerEmail: seeker.email || auth.user.email,
    planType,
    registrationFee: quote.finalFee,
    baseRegistrationFee: quote.baseFee,
    discountAmount: quote.discountAmount,
    discountPercent: quote.discountPercent,
    discountCode: quote.code,
    discountLabel:
      quote.source === "promo_code"
        ? "Promo code"
        : quote.source === "seeker_referral"
        ? "Referral code"
        : null,
    commissionRate: 0.05,
    agreedDate: new Date().toISOString(),
  });

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  const agreedAt = new Date().toISOString();

  const { data: existingContract, error: existingError } = await supabaseAdmin
    .from("job_seeker_contracts")
    .select("id, discount_source, discount_code")
    .eq("job_seeker_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.error("Billing contract lookup failed:", existingError);
    return NextResponse.json({ error: "Failed to save contract." }, { status: 500 });
  }

  const contractPayload = {
    job_seeker_id: auth.user.id,
    plan_type: planType,
    registration_fee: quote.finalFee,
    base_registration_fee: quote.baseFee,
    final_registration_fee: quote.finalFee,
    discount_percent: quote.discountPercent,
    discount_amount: quote.discountAmount,
    discount_source: quote.source,
    discount_code: quote.code,
    discount_metadata: {
      promo_code_id: quote.promoCodeId,
      referrer_id: quote.referrerId,
      invalid_code: quote.invalidCode,
      message: quote.message ?? null,
    },
    commission_rate: 0.05,
    contract_html: contractHTML,
    agreed_at: agreedAt,
    agreed_ip: ip,
  };

  const contractMutation = existingContract
    ? supabaseAdmin
        .from("job_seeker_contracts")
        .update(contractPayload)
        .eq("id", existingContract.id)
        .select()
        .single()
    : supabaseAdmin
        .from("job_seeker_contracts")
        .insert(contractPayload)
        .select()
        .single();

  const { data: contract, error: contractError } = await contractMutation;

  if (contractError || !contract) {
    console.error("Billing contract save failed:", contractError);
    return NextResponse.json({ error: "Failed to save contract." }, { status: 500 });
  }

  const seekerUpdatePayload: Record<string, unknown> = {
    plan_type: planType,
    contract_id: contract.id,
  };
  if (!isStrategyPreviewConversion || normalizedOfferCode) {
    seekerUpdatePayload.offer_code = normalizedOfferCode;
  }

  const { error: seekerUpdateError } = await supabaseAdmin
    .from("job_seekers")
    .update(seekerUpdatePayload)
    .eq("id", auth.user.id);

  if (seekerUpdateError?.code === "42703") {
    const { error: fallbackSeekerError } = await supabaseAdmin
      .from("job_seekers")
      .update({ plan_type: planType })
      .eq("id", auth.user.id);

    if (fallbackSeekerError) {
      console.error("Billing seeker update fallback failed:", fallbackSeekerError);
      return NextResponse.json(
        { error: "Failed to update seeker record." },
        { status: 500 }
      );
    }
  } else if (seekerUpdateError) {
    console.error("Billing seeker update failed:", seekerUpdateError);
    return NextResponse.json(
      { error: "Failed to update seeker record." },
      { status: 500 }
    );
  }

  const shouldIncrementPromoRedemption =
    !isStrategyPreviewConversion &&
    Boolean(quote.promoCodeId) &&
    (existingContract?.discount_source !== quote.source ||
      existingContract?.discount_code !== quote.code);

  if (quote.promoCodeId && shouldIncrementPromoRedemption) {
    await incrementPromoRedemptionCount(quote.promoCodeId);
  }

  await upsertJobSeekerIntakeState({
    jobSeekerId: auth.user.id,
    selectedPlan: planType,
    offerPath: isStrategyPreviewConversion ? "strategy_preview" : "discount",
    submittedCode: isStrategyPreviewConversion
      ? intakeState?.submitted_code ?? null
      : normalizedOfferCode,
    discountSource: quote.source,
    discountCode: quote.code,
    baseRegistrationFee: quote.baseFee,
    discountAmount: quote.discountAmount,
    finalRegistrationFee: quote.finalFee,
    status: isStrategyPreviewConversion ? "approved_payment_pending" : undefined,
    previewConvertedAt: isStrategyPreviewConversion ? agreedAt : undefined,
    metadata: {
      last_contract_signed_at: agreedAt,
      contract_id: contract.id,
      ...(isStrategyPreviewConversion
        ? {
            preview_converted_to_paid_at: agreedAt,
          }
        : {}),
    },
  });

  return NextResponse.json({
    ok: true,
    contractId: contract.id,
    agreedAt,
    registrationFee: quote.finalFee,
    quote,
  });
}
