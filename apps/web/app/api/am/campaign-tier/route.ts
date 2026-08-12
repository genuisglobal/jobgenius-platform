import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { requireAMAccessToSeeker } from "@/lib/am-access";
import { PRICING_PLANS } from "@/app/components/homepage/marketingContent";

/**
 * POST  /api/am/campaign-tier    → assign the client's campaign plan (Essentials/Premium)
 *                                    and snapshot its setup fee onto the seeker record.
 * PATCH /api/am/campaign-tier    → mark the Campaign Setup & Execution Fee as paid.
 * Body (both): { job_seeker_id: string }
 * Body (POST only): { tier: "essentials" | "premium" }
 */

export async function POST(request: Request) {
  let body: { job_seeker_id?: unknown; tier?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const jobSeekerId = typeof body.job_seeker_id === "string" ? body.job_seeker_id : null;
  const tier = typeof body.tier === "string" ? body.tier : null;
  if (!jobSeekerId) {
    return NextResponse.json({ error: "job_seeker_id is required." }, { status: 400 });
  }

  const plan = PRICING_PLANS.find((p) => p.name.toLowerCase() === tier);
  if (!plan) {
    return NextResponse.json(
      { error: "tier must be one of: " + PRICING_PLANS.map((p) => p.name.toLowerCase()).join(", ") },
      { status: 400 }
    );
  }

  const access = await requireAMAccessToSeeker(request.headers, jobSeekerId);
  if (!access.ok) return access.response;

  const selectedAt = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("job_seekers")
    .update({
      campaign_tier: plan.name.toLowerCase(),
      campaign_tier_selected_at: selectedAt,
      campaign_tier_selected_by: access.amId,
      setup_fee_usd: plan.setupFeeUsd,
      // Changing plans resets any prior paid mark — re-confirm payment for the new fee.
      setup_fee_paid_at: null,
      setup_fee_marked_paid_by: null,
    })
    .eq("id", jobSeekerId);

  if (error) {
    console.error("Campaign tier update failed:", error);
    return NextResponse.json({ error: "Failed to set the campaign tier." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    campaign_tier: plan.name.toLowerCase(),
    setup_fee_usd: plan.setupFeeUsd,
    campaign_tier_selected_at: selectedAt,
  });
}

export async function PATCH(request: Request) {
  let body: { job_seeker_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const jobSeekerId = typeof body.job_seeker_id === "string" ? body.job_seeker_id : null;
  if (!jobSeekerId) {
    return NextResponse.json({ error: "job_seeker_id is required." }, { status: 400 });
  }

  const access = await requireAMAccessToSeeker(request.headers, jobSeekerId);
  if (!access.ok) return access.response;

  const { data: seeker } = await supabaseAdmin
    .from("job_seekers")
    .select("campaign_tier")
    .eq("id", jobSeekerId)
    .maybeSingle();

  if (!seeker?.campaign_tier) {
    return NextResponse.json(
      { error: "Set a campaign tier before marking the setup fee as paid." },
      { status: 400 }
    );
  }

  const paidAt = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("job_seekers")
    .update({
      setup_fee_paid_at: paidAt,
      setup_fee_marked_paid_by: access.amId,
    })
    .eq("id", jobSeekerId);

  if (error) {
    console.error("Setup fee paid-mark failed:", error);
    return NextResponse.json({ error: "Failed to mark the setup fee as paid." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, setup_fee_paid_at: paidAt });
}
