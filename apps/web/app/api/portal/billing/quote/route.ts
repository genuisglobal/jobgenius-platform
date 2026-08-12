import { NextResponse } from "next/server";
import { requireJobSeeker, supabaseAdmin } from "@/lib/auth";
import {
  normalizeOfferCode,
  resolveOfferQuote,
  type SupportedPlanType,
} from "@/lib/offers";

type QuoteRequestBody = {
  planType?: SupportedPlanType;
  code?: string | null;
};

export async function POST(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: QuoteRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const planType = body.planType;
  if (planType !== "essentials" && planType !== "premium") {
    return NextResponse.json({ error: "Invalid plan type." }, { status: 400 });
  }

  const normalizedCode = normalizeOfferCode(body.code);
  const quote = await resolveOfferQuote({
    planType,
    code: normalizedCode,
    currentJobSeekerId: auth.user.id,
  });

  const { error: seekerUpdateError } = await supabaseAdmin
    .from("job_seekers")
    .update({ offer_code: normalizedCode })
    .eq("id", auth.user.id);

  if (seekerUpdateError) {
    console.error("billing quote offer code save failed:", seekerUpdateError);
  }

  return NextResponse.json({ quote });
}
