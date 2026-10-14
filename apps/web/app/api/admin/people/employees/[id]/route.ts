import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";
import {
  EMPLOYEE_EMPLOYMENT_STATUSES,
  EMPLOYEE_ONBOARDING_STATUSES,
  LEADERSHIP_PIPELINE_STATUSES,
  type EmployeeEmploymentStatus,
  type EmployeeOnboardingStatus,
  type LeadershipPipelineStatus,
} from "@/lib/people";
import { logAdminAction } from "@/lib/audit";

function unauthorized() {
  return NextResponse.json({ error: "People manager access required." }, { status: 403 });
}

export async function PATCH(
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

  const updates: Record<string, unknown> = {};

  if (
    typeof body.employment_status === "string" &&
    EMPLOYEE_EMPLOYMENT_STATUSES.includes(
      body.employment_status as EmployeeEmploymentStatus
    )
  ) {
    updates.employment_status = body.employment_status;
  }

  if (
    typeof body.onboarding_status === "string" &&
    EMPLOYEE_ONBOARDING_STATUSES.includes(
      body.onboarding_status as EmployeeOnboardingStatus
    )
  ) {
    updates.onboarding_status = body.onboarding_status;
  }

  if (
    typeof body.leadership_status === "string" &&
    LEADERSHIP_PIPELINE_STATUSES.includes(
      body.leadership_status as LeadershipPipelineStatus
    )
  ) {
    updates.leadership_status = body.leadership_status;
  }

  const passthroughFields = [
    "account_manager_id",
    "supervisor_employee_id",
    "phone_number",
    "whatsapp_number",
    "address_location",
    "emergency_contact_name",
    "emergency_contact_phone",
    "role_title",
    "start_date",
    "probation_start_date",
    "probation_end_date",
    "current_career_level_id",
  ] as const;

  for (const field of passthroughFields) {
    if (field in body) {
      const value = body[field];
      updates[field] =
        typeof value === "string" ? value.trim() || null : value ?? null;
    }
  }

  if ("active" in body) {
    updates.active = Boolean(body.active);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided." }, { status: 400 });
  }

  const { data: employee, error } = await supabaseAdmin
    .from("employees")
    .update(updates)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error || !employee) {
    return NextResponse.json(
      { error: error?.message || "Employee not found." },
      { status: error ? 500 : 404 }
    );
  }

  if ("account_manager_id" in updates && typeof updates.account_manager_id === "string") {
    await supabaseAdmin
      .from("payroll_workers")
      .update({ account_manager_id: updates.account_manager_id })
      .eq("id", employee.worker_id);
  }

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "people.employee_update",
    targetType: "employee",
    targetId: id,
    details: { updates },
  }).catch(() => {});

  return NextResponse.json({ employee });
}
