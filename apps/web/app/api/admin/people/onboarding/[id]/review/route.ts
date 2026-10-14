import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";
import { logAdminAction } from "@/lib/audit";

function unauthorized() {
  return NextResponse.json({ error: "People manager access required." }, { status: 403 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isPeopleManagerRole(auth.user.role)) {
    return unauthorized();
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const status =
    body.status === "approved" || body.status === "needs_changes"
      ? body.status
      : null;

  if (!status) {
    return NextResponse.json(
      { error: "Status must be approved or needs_changes." },
      { status: 400 }
    );
  }

  const managerNotes =
    typeof body.manager_notes === "string" ? body.manager_notes.trim() || null : null;

  const { data: form, error: formLookupError } = await supabaseAdmin
    .from("employee_onboarding_forms")
    .select("id, employee_id")
    .eq("id", id)
    .maybeSingle();

  if (formLookupError || !form) {
    return NextResponse.json(
      { error: formLookupError?.message || "Onboarding form not found." },
      { status: formLookupError ? 500 : 404 }
    );
  }

  const nowIso = new Date().toISOString();
  const { data: updatedForm, error: updateError } = await supabaseAdmin
    .from("employee_onboarding_forms")
    .update({
      status,
      reviewed_at: nowIso,
      reviewed_by: auth.user.id,
      manager_notes: managerNotes,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (updateError || !updatedForm) {
    return NextResponse.json(
      { error: updateError?.message || "Failed to review onboarding form." },
      { status: 500 }
    );
  }

  await supabaseAdmin
    .from("employees")
    .update({ onboarding_status: status })
    .eq("id", form.employee_id);

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "people.onboarding_review",
    targetType: "employee_onboarding_form",
    targetId: id,
    details: {
      employee_id: form.employee_id,
      status,
      manager_notes: managerNotes,
    },
  }).catch(() => {});

  return NextResponse.json({ form: updatedForm });
}
