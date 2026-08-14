import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { getEmployeeByAccountManagerId } from "@/lib/people-server";
import { logAdminAction } from "@/lib/audit";

function getClientIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || null;
  }
  return request.headers.get("x-real-ip");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const employee = await getEmployeeByAccountManagerId(auth.user.id);
  if (!employee) {
    return NextResponse.json({ error: "Employee profile not found." }, { status: 404 });
  }

  const { id } = await params;
  const ip = getClientIp(request);
  const { data: scorecard, error: lookupError } = await supabaseAdmin
    .from("monthly_scorecards")
    .select("*")
    .eq("id", id)
    .eq("employee_id", employee.id)
    .maybeSingle();

  if (lookupError || !scorecard) {
    return NextResponse.json({ error: "Scorecard not found." }, { status: 404 });
  }

  if (scorecard.status !== "finalized" && scorecard.status !== "acknowledged") {
    return NextResponse.json(
      { error: "Only finalized scorecards can be acknowledged." },
      { status: 400 }
    );
  }

  const { data: updated, error } = await supabaseAdmin
    .from("monthly_scorecards")
    .update({
      status: "acknowledged",
      acknowledged_at: scorecard.acknowledged_at ?? new Date().toISOString(),
      acknowledged_ip: scorecard.acknowledged_ip ?? ip,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { error: error?.message || "Failed to acknowledge scorecard." },
      { status: 500 }
    );
  }

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "people.scorecard_acknowledge",
    targetType: "monthly_scorecard",
    targetId: id,
    details: {
      employee_id: employee.id,
    },
    ip: ip ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  }).catch(() => {});

  return NextResponse.json({ scorecard: updated });
}
