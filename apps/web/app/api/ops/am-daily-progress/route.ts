import { NextResponse } from "next/server";
import { enforceOpsRateLimit } from "@/lib/rate-limit-presets";
import { sendDailyAmProgress } from "@/lib/am-daily-progress";
import { isAuthorizedCron } from "@/lib/cron-auth";

async function run() {
  try {
    return NextResponse.json({ success: true, ...await sendDailyAmProgress() });
  } catch (error) {
    console.error("[ops:am-daily-progress]", error);
    return NextResponse.json({ error: "Could not send AM daily progress emails." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;
  if (!process.env.OPS_API_KEY || request.headers.get("x-ops-key") !== process.env.OPS_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return run();
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return run();
}
