import { NextResponse } from "next/server";
import { enforceOpsRateLimit } from "@/lib/rate-limit-presets";
import {
  getDigestWeek,
  sendWeeklyProductivityDigests,
} from "@/lib/productivity-digest";

const OPS_API_KEY = process.env.OPS_API_KEY;

/**
 * POST /api/ops/productivity-digest — Friday cron (scheduled-jobs.yml).
 *
 * Sends each account manager their own week: hours, activity, output per
 * hour, and where that sits against the team median. Idempotent — an AM
 * already sent this week's digest is skipped, so a retry cannot
 * double-send.
 */
export async function POST(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;

  const key = request.headers.get("x-ops-key") ?? "";
  if (!OPS_API_KEY || key !== OPS_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendWeeklyProductivityDigests(getDigestWeek());
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[ops:productivity-digest]", error);
    return NextResponse.json(
      { error: "Failed to send productivity digests." },
      { status: 500 }
    );
  }
}
