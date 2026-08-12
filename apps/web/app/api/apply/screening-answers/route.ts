import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import {
  getAccountManagerFromRequest,
  hasJobSeekerAccess,
} from "@/lib/am-access";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const runner = request.headers.get("x-runner") ?? "";

  const { searchParams } = new URL(request.url);
  const jobSeekerId = searchParams.get("jobSeekerId");

  if (!jobSeekerId) {
    return NextResponse.json(
      { error: "jobSeekerId is required" },
      { status: 400 },
    );
  }

  // Cloud runner auth: validate x-runner against OPS_API_KEY
  if (runner) {
    if (runner !== process.env.OPS_API_KEY) {
      console.warn(
        `[screening-answers] Invalid runner key for seeker ${jobSeekerId}`,
      );
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (authHeader) {
    // AM auth: validate token and check seeker access
    const amResult = await getAccountManagerFromRequest(request.headers);
    if ("error" in amResult) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canAccess = await hasJobSeekerAccess(amResult.accountManager.id, jobSeekerId);
    if (!canAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: answers, error } = await supabaseAdmin
    .from("job_seeker_screening_answers")
    .select("*")
    .eq("job_seeker_id", jobSeekerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ answers: answers ?? [] });
}
