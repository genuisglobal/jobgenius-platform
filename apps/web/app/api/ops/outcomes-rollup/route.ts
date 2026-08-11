import { NextResponse } from "next/server";
import { refreshOutcomes } from "@/lib/application-outcomes";
import { enforceOpsRateLimit } from "@/lib/rate-limit-presets";

const OPS_API_KEY = process.env.OPS_API_KEY;

/**
 * POST /api/ops/outcomes-rollup
 *
 * Nightly rollup that materializes application_outcomes from existing tables
 * (application_runs, tailored_resumes, job_match_scores, interviews,
 * application_feedback) and re-evaluates still-pending applications so late
 * interviews / rejections are caught. Idempotent (upsert on the (seeker, job)
 * key). Also serves as the backfill — pass ?window_days=3650 for full history.
 *
 * Auth: x-ops-key (same as the other /api/ops/* crons).
 */
export async function POST(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;

  const key = request.headers.get("x-ops-key") ?? "";
  if (!OPS_API_KEY || key !== OPS_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const windowDaysRaw = Number(searchParams.get("window_days") ?? 45);
  const noResponseDaysRaw = Number(searchParams.get("no_response_days") ?? 21);

  const windowDays =
    Number.isFinite(windowDaysRaw) && windowDaysRaw > 0 && windowDaysRaw <= 3650
      ? windowDaysRaw
      : 45;
  const noResponseDays =
    Number.isFinite(noResponseDaysRaw) && noResponseDaysRaw > 0 && noResponseDaysRaw <= 180
      ? noResponseDaysRaw
      : 21;

  try {
    const result = await refreshOutcomes(windowDays, noResponseDays);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rollup failed.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
