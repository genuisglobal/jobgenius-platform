import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/audit";
import {
  getPreviewExpiryFromDate,
  upsertJobSeekerIntakeState,
} from "@/lib/intake";

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
    .select("id, job_seeker_id, offer_path, status, assigned_account_manager_id")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !intakeState) {
    return NextResponse.json({ error: "Intake state not found." }, { status: 404 });
  }

  if (intakeState.offer_path !== "strategy_preview") {
    return NextResponse.json(
      { error: "Only strategy preview intakes can be started here." },
      { status: 400 }
    );
  }

  if (!intakeState.assigned_account_manager_id) {
    return NextResponse.json(
      { error: "Assign and approve an account manager before starting the preview." },
      { status: 400 }
    );
  }

  if (!["approved_preview", "preview_active"].includes(intakeState.status)) {
    return NextResponse.json(
      { error: "This preview cannot be started from its current state." },
      { status: 409 }
    );
  }

  const startedAt = new Date();
  const previewExpiresAt = getPreviewExpiryFromDate(startedAt);
  const updatedIntake = await upsertJobSeekerIntakeState({
    jobSeekerId: intakeState.job_seeker_id,
    status: "preview_active",
    reviewedBy: auth.user.id,
    previewStartedAt: startedAt.toISOString(),
    previewExpiresAt,
    notes,
    metadata: {
      preview_started_by: auth.user.id,
    },
  });

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    action: "intake.start_preview",
    targetType: "job_seeker_intake_state",
    targetId: params.id,
    details: {
      job_seeker_id: intakeState.job_seeker_id,
      preview_expires_at: previewExpiresAt,
    },
  }).catch((auditError) => console.error("Audit log failed", auditError));

  return NextResponse.json({ ok: true, intakeState: updatedIntake });
}
