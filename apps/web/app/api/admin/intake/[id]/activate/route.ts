import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { normalizeAMRole } from "@/lib/auth/roles";
import { logAdminAction } from "@/lib/audit";
import { upsertJobSeekerIntakeState } from "@/lib/intake";

type RouteContext = {
  params: { id: string };
};

/**
 * POST /api/admin/intake/[id]/activate
 *
 * Superadmin-only override to mark a client as active_client WITHOUT a confirmed
 * registration payment. Normally active_client is payment-derived (via approve
 * once funded, or billing/acknowledge-payment). This bypasses that gate — e.g.
 * for manual onboarding or testing — so it is restricted to superadmins and
 * always audit-logged. The current AM assignment is preserved (not required).
 */
export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (normalizeAMRole(auth.user.role) !== "superadmin") {
    return NextResponse.json(
      { error: "Superadmin access required to override activation." },
      { status: 403 }
    );
  }

  let body: { notes?: string | null } = {};
  try {
    body = await request.json();
  } catch {
    // Body is optional.
  }
  const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;

  const { data: intakeState, error: intakeError } = await supabaseAdmin
    .from("job_seeker_intake_states")
    .select("id, job_seeker_id, status")
    .eq("id", params.id)
    .maybeSingle();

  if (intakeError || !intakeState) {
    return NextResponse.json({ error: "Intake state not found." }, { status: 404 });
  }

  if (intakeState.status === "active_client") {
    return NextResponse.json({ ok: true, alreadyActive: true, intakeState });
  }

  const updatedIntake = await upsertJobSeekerIntakeState({
    jobSeekerId: intakeState.job_seeker_id,
    status: "active_client",
    reviewedBy: auth.user.id,
    notes,
    metadata: {
      activated_by_override: true,
      activated_by: auth.user.email,
      activated_at: new Date().toISOString(),
    },
  });

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    action: "intake.activate_override",
    targetType: "job_seeker_intake_state",
    targetId: params.id,
    details: {
      job_seeker_id: intakeState.job_seeker_id,
      previous_status: intakeState.status,
    },
  }).catch((error) => console.error("Audit log failed", error));

  return NextResponse.json({ ok: true, intakeState: updatedIntake });
}
