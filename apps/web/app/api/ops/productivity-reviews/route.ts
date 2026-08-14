import { NextResponse } from "next/server";
import { enforceOpsRateLimit } from "@/lib/rate-limit-presets";
import { sweepProductivityReviews } from "@/lib/productivity-reviews-sweep";

const OPS_API_KEY = process.env.OPS_API_KEY;

/**
 * POST /api/ops/productivity-reviews — Friday cron (scheduled-jobs.yml),
 * after the weekly digest.
 *
 * Raises a review item for anyone whose pace has been sustained in the
 * same band for three consecutive rated weeks, in either direction. Never
 * disciplines anyone — see migration 119.
 */
export async function POST(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;

  const key = request.headers.get("x-ops-key") ?? "";
  if (!OPS_API_KEY || key !== OPS_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sweepProductivityReviews();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[ops:productivity-reviews]", error);
    return NextResponse.json(
      { error: "Failed to sweep productivity reviews." },
      { status: 500 }
    );
  }
}
