import { NextResponse } from "next/server";
import { generateWeeklyReports, getWeekStart } from "@/lib/client-reports";
import { enforceOpsRateLimit } from "@/lib/rate-limit-presets";

const OPS_API_KEY = process.env.OPS_API_KEY;

/**
 * POST /api/ops/client-reports — Friday cron (scheduled-jobs.yml).
 * Drafts one weekly activity report per active client for the current week.
 * Idempotent: seekers with an existing report for the week are skipped.
 */
export async function POST(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;

  const key = request.headers.get("x-ops-key") ?? "";
  if (!OPS_API_KEY || key !== OPS_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await generateWeeklyReports(getWeekStart());
  return NextResponse.json({ success: true, ...result });
}
