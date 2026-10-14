import { NextResponse } from "next/server";
import { requireJobSeeker } from "@/lib/auth";
import {
  buildBaseOfferQuote,
  type SupportedPlanType,
} from "@/lib/offers";
import {
  getIntakeStateByJobSeekerId,
  PREVIEW_APPROVAL_STATUSES,
  upsertJobSeekerIntakeState,
} from "@/lib/intake";

export async function POST(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const intakeState = await getIntakeStateByJobSeekerId(auth.user.id);

  if (!intakeState) {
    return NextResponse.json(
      { error: "No intake state found for this account." },
      { status: 404 }
    );
  }

  if (intakeState.offer_path !== "strategy_preview") {
    return NextResponse.json(
      { error: "This account is not on the strategy preview path." },
      { status: 400 }
    );
  }

  if (!PREVIEW_APPROVAL_STATUSES.includes(intakeState.status)) {
    return NextResponse.json(
      { error: "This strategy preview cannot be converted from its current state." },
      { status: 409 }
    );
  }

  const selectedPlan = intakeState.selected_plan as SupportedPlanType | null;
  if (selectedPlan !== "essentials" && selectedPlan !== "premium") {
    return NextResponse.json(
      { error: "Select a plan before converting to full service." },
      { status: 400 }
    );
  }

  const quote = buildBaseOfferQuote(selectedPlan);

  const updatedIntake = await upsertJobSeekerIntakeState({
    jobSeekerId: auth.user.id,
    selectedPlan,
    offerPath: "strategy_preview",
    baseRegistrationFee: quote.baseFee,
    discountAmount: 0,
    finalRegistrationFee: quote.finalFee,
    metadata: {
      preview_conversion_requested_at: new Date().toISOString(),
    },
  });

  return NextResponse.json({
    ok: true,
    quote,
    intakeState: updatedIntake,
  });
}
