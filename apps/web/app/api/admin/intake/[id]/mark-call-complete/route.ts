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

  const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;

  const { data: intakeState, error } = await supabaseAdmin
    .from("job_seeker_intake_states")
    .select("id, job_seeker_id, offer_path, status")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !intakeState) {
    return NextResponse.json({ error: "Intake state not found." }, { status: 404 });
  }

  if (intakeState.offer_path !== "strategy_preview") {
    return NextResponse.json(
      { error: "Only strategy preview intakes can use this action." },
      { status: 400 }
    );
  }

  if (!["pending_review", "submitted"].includes(intakeState.status)) {
    return NextResponse.json(
      { error: "This intake cannot be moved to first-call complete from its current state." },
      { status: 409 }
    );
  }

  const nowIso = new Date().toISOString();
  const updatedIntake = await upsertJobSeekerIntakeState({
    jobSeekerId: intakeState.job_seeker_id,
    status: "call_completed",
    reviewedBy: auth.user.id,
    callCompletedAt: nowIso,
    notes,
    metadata: {
      call_completed_by: auth.user.id,
      call_completed_at: nowIso,
    },
  });

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    action: "intake.mark_call_complete",
    targetType: "job_seeker_intake_state",
    targetId: params.id,
    details: {
      job_seeker_id: intakeState.job_seeker_id,
      offer_path: intakeState.offer_path,
    },
  }).catch((auditError) => console.error("Audit log failed", auditError));

  return NextResponse.json({ ok: true, intakeState: updatedIntake });
}
