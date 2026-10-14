import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";
import { resolveDecision } from "@/lib/consultant/decision-engine";

interface RouteContext {
  params: { id: string };
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: decision } = await supabaseAdmin
    .from("consultant_decisions")
    .select("id, job_seeker_id, status")
    .eq("id", params.id)
    .maybeSingle();

  if (!decision) {
    return NextResponse.json({ error: "Decision not found" }, { status: 404 });
  }

  if (!isAdminRole(user.role)) {
    const { data: assignment } = await supabaseAdmin
      .from("job_seeker_assignments")
      .select("id")
      .eq("account_manager_id", user.id)
      .eq("job_seeker_id", decision.job_seeker_id)
      .maybeSingle();
    if (!assignment) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let body: { resolution?: string } = {};
  try {
    body = await request.json();
  } catch {
    // optional
  }

  await resolveDecision(params.id, {
    resolvedBy: user.id,
    resolution: typeof body.resolution === "string" && body.resolution.trim()
      ? body.resolution.trim()
      : "resolved_by_am",
  });

  return NextResponse.json({ ok: true });
}
