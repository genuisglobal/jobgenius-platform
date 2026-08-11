import { NextResponse } from "next/server";
import { generateFollowUpDrafts } from "@/lib/apply/follow-ups";
import { enforceOpsRateLimit } from "@/lib/rate-limit-presets";

const OPS_API_KEY = process.env.OPS_API_KEY;

/**
 * POST /api/ops/follow-ups — daily cron (scheduled-jobs.yml).
 * Drafts day-3/day-7 follow-up messages for applied-no-response runs into
 * the AM queue (/dashboard/follow-ups). Never sends anything itself.
 */
export async function POST(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;

  const key = request.headers.get("x-ops-key") ?? "";
  if (!OPS_API_KEY || key !== OPS_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await generateFollowUpDrafts();
  return NextResponse.json({ success: true, ...result });
}
