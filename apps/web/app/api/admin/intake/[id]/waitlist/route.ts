import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/audit";
import { upsertJobSeekerIntakeState } from "@/lib/intake";

type RouteContext = {
  params: { id: string };
};

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { notes?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const notes =
    typeof body.notes === "string" ? body.notes.trim() || null : null;

  const { data: intakeState, error } = await supabaseAdmin
    .from("job_seeker_intake_states")
    .select("id, job_seeker_id")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !intakeState) {
    return NextResponse.json({ error: "Intake state not found." }, { status: 404 });
  }

  const updatedIntake = await upsertJobSeekerIntakeState({
    jobSeekerId: intakeState.job_seeker_id,
    status: "waitlisted",
    reviewedBy: auth.user.id,
    notes,
  });

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    action: "intake.waitlist",
    targetType: "job_seeker_intake_state",
    targetId: params.id,
    details: {
      job_seeker_id: intakeState.job_seeker_id,
    },
  }).catch((auditError) => console.error("Audit log failed", auditError));

  return NextResponse.json({ ok: true, intakeState: updatedIntake });
}
