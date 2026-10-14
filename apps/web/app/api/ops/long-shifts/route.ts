import { NextResponse } from "next/server";
import { enforceOpsRateLimit } from "@/lib/rate-limit-presets";
import { sweepLongShifts } from "@/lib/long-shift-alerts";

const OPS_API_KEY = process.env.OPS_API_KEY;

/**
 * POST /api/ops/long-shifts — hourly cron (scheduled-jobs.yml).
 *
 * Two rungs, neither of which closes anything: at 9 hours the worker is
 * asked whether they forgot to sign out, at 10 hours their people
 * managers are told so they can set the real time. Idempotent — each
 * rung fires once per shift.
 */
export async function POST(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;

  const key = request.headers.get("x-ops-key") ?? "";
  if (!OPS_API_KEY || key !== OPS_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sweepLongShifts();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[ops:long-shifts]", error);
    return NextResponse.json(
      { error: "Failed to sweep long-running shifts." },
      { status: 500 }
    );
  }
}
