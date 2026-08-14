import { NextResponse } from "next/server";
import { requireJobSeeker } from "@/lib/auth";
import type { SupportedPlanType } from "@/lib/offers";
import {
  getIntakeDefaultsForSeeker,
  getIntakeStateByJobSeekerId,
  upsertJobSeekerIntakeState,
  type OfferPath,
} from "@/lib/intake";

type IntakeSubmitBody = {
  selectedPlan?: SupportedPlanType | null;
  offerPath?: OfferPath;
  submittedCode?: string | null;
  baseRegistrationFee?: number | null;
  discountAmount?: number | null;
  finalRegistrationFee?: number | null;
  previewAgreedAt?: string | null;
};

export async function POST(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: IntakeSubmitBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const existing = await getIntakeStateByJobSeekerId(auth.user.id);
  const defaults = await getIntakeDefaultsForSeeker(auth.user.id);
  const offerPath = body.offerPath ?? defaults.offerPath ?? "discount";
  const nextStatus: ReturnType<typeof resolveNextStatus> = resolveNextStatus(
    existing?.status ?? null
  );

  const intakeState = await upsertJobSeekerIntakeState({
    jobSeekerId: auth.user.id,
    selectedPlan: body.selectedPlan ?? defaults.selectedPlan,
    offerPath,
    submittedCode:
      offerPath === "discount"
        ? body.submittedCode ?? defaults.submittedCode
        : null,
    discountSource: offerPath === "discount" ? defaults.discountSource : null,
    discountCode: offerPath === "discount" ? defaults.discountCode : null,
    baseRegistrationFee: body.baseRegistrationFee ?? defaults.baseRegistrationFee,
    discountAmount: body.discountAmount ?? defaults.discountAmount,
    finalRegistrationFee: body.finalRegistrationFee ?? defaults.finalRegistrationFee,
    previewAgreedAt:
      body.previewAgreedAt ?? existing?.preview_agreed_at ?? null,
    onboardingCompletedAt:
      defaults.onboardingCompletedAt ?? new Date().toISOString(),
    status: nextStatus,
    metadata: {
      submitted_from: "onboarding_finish",
    },
  });

  if (!intakeState) {
    return NextResponse.json(
      { error: "Failed to submit your onboarding for review." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, intakeState });
}

function resolveNextStatus(currentStatus: string | null) {
  if (
    currentStatus === "waitlisted" ||
    currentStatus === "rejected" ||
    currentStatus === "approved_payment_pending" ||
    currentStatus === "active_client" ||
    currentStatus === "approved_preview" ||
    currentStatus === "preview_active" ||
    currentStatus === "preview_expired"
  ) {
    return currentStatus;
  }

  return "pending_review" as const;
}
