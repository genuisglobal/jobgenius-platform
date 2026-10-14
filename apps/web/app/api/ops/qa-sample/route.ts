import { NextResponse } from "next/server";
import { sampleCompletedRuns } from "@/lib/apply/qa-sampling";
import { enforceOpsRateLimit } from "@/lib/rate-limit-presets";

const OPS_API_KEY = process.env.OPS_API_KEY;

/**
 * POST /api/ops/qa-sample — nightly QA sampling (scheduled-jobs.yml).
 * Selects COMPLETED runs from the window into qa_reviews as PENDING:
 * 100% of each seeker's first 3 completed runs + QA_SAMPLE_RATE (default
 * 5%) of the rest. Idempotent (seeded sampling + unique run_id).
 */
export async function POST(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;

  const key = request.headers.get("x-ops-key") ?? "";
  if (!OPS_API_KEY || key !== OPS_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const windowHours = Number(searchParams.get("window_hours") ?? 26);

  const result = await sampleCompletedRuns(
    Number.isFinite(windowHours) && windowHours > 0 && windowHours <= 24 * 14
      ? windowHours
      : 26
  );

  return NextResponse.json({ success: true, ...result });
}
