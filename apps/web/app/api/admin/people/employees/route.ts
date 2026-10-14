import crypto from "crypto";
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
import { listPeopleEmployees } from "@/lib/people-server";
import { logAdminAction } from "@/lib/audit";

function unauthorized() {
  return NextResponse.json({ error: "People manager access required." }, { status: 403 });
}

function randomEmployeeCode() {
  return `JG-EMP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function GET(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isPeopleManagerRole(auth.user.role)) {
    return unauthorized();
  }

  try {
    const employees = await listPeopleEmployees();
    return NextResponse.json({ employees });
  } catch (error) {
    console.error("Failed to list employees:", error);
    return NextResponse.json({ error: "Failed to load employees." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isPeopleManagerRole(auth.user.role)) {
    return unauthorized();
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const workerId =
    typeof body.worker_id === "string" && body.worker_id.trim()
      ? body.worker_id.trim()
      : "";
  if (!workerId) {
    return NextResponse.json({ error: "Worker is required." }, { status: 400 });
  }

  const accountManagerId =
    typeof body.account_manager_id === "string" && body.account_manager_id.trim()
      ? body.account_manager_id.trim()
      : null;
  const supervisorEmployeeId =
    typeof body.supervisor_employee_id === "string" && body.supervisor_employee_id.trim()
      ? body.supervisor_employee_id.trim()
      : null;

  const employmentStatus: EmployeeEmploymentStatus =
    typeof body.employment_status === "string" &&
    EMPLOYEE_EMPLOYMENT_STATUSES.includes(
      body.employment_status as EmployeeEmploymentStatus
    )
      ? (body.employment_status as EmployeeEmploymentStatus)
      : "tentative";

  const onboardingStatus: EmployeeOnboardingStatus =
    typeof body.onboarding_status === "string" &&
    EMPLOYEE_ONBOARDING_STATUSES.includes(
      body.onboarding_status as EmployeeOnboardingStatus
    )
      ? (body.onboarding_status as EmployeeOnboardingStatus)
      : "pending";

  const leadershipStatus: LeadershipPipelineStatus =
    typeof body.leadership_status === "string" &&
    LEADERSHIP_PIPELINE_STATUSES.includes(
      body.leadership_status as LeadershipPipelineStatus
    )
      ? (body.leadership_status as LeadershipPipelineStatus)
      : "not_eligible";

  const [workerLookup, existingEmployeeByWorker, existingEmployeeByAccount] =
    await Promise.all([
      supabaseAdmin
        .from("payroll_workers")
        .select("id, account_manager_id, full_name, email, job_title, start_date")
        .eq("id", workerId)
        .maybeSingle(),
      supabaseAdmin
        .from("employees")
        .select("id")
        .eq("worker_id", workerId)
        .maybeSingle(),
      accountManagerId
        ? supabaseAdmin
            .from("employees")
            .select("id")
            .eq("account_manager_id", accountManagerId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

  if (workerLookup.error || !workerLookup.data) {
    return NextResponse.json({ error: "Worker not found." }, { status: 404 });
  }
  if (existingEmployeeByWorker.error) {
    return NextResponse.json({ error: existingEmployeeByWorker.error.message }, { status: 500 });
  }
  if (existingEmployeeByWorker.data) {
    return NextResponse.json(
      { error: "This worker already has an employee profile." },
      { status: 409 }
    );
  }
  if (existingEmployeeByAccount.error) {
    return NextResponse.json({ error: existingEmployeeByAccount.error.message }, { status: 500 });
  }
  if (existingEmployeeByAccount.data) {
    return NextResponse.json(
      { error: "That staff login is already linked to another employee profile." },
      { status: 409 }
    );
  }

  const roleTitle =
    typeof body.role_title === "string" && body.role_title.trim()
      ? body.role_title.trim()
      : workerLookup.data.job_title ?? null;
  const startDate =
    typeof body.start_date === "string" && body.start_date.trim()
      ? body.start_date.trim()
      : workerLookup.data.start_date ?? null;

  const insert = {
    worker_id: workerId,
    account_manager_id: accountManagerId ?? workerLookup.data.account_manager_id ?? null,
    supervisor_employee_id: supervisorEmployeeId,
    employee_code: randomEmployeeCode(),
    phone_number:
      typeof body.phone_number === "string" ? body.phone_number.trim() || null : null,
    whatsapp_number:
      typeof body.whatsapp_number === "string"
        ? body.whatsapp_number.trim() || null
        : null,
    address_location:
      typeof body.address_location === "string"
        ? body.address_location.trim() || null
        : null,
    emergency_contact_name:
      typeof body.emergency_contact_name === "string"
        ? body.emergency_contact_name.trim() || null
        : null,
    emergency_contact_phone:
      typeof body.emergency_contact_phone === "string"
        ? body.emergency_contact_phone.trim() || null
        : null,
    role_title: roleTitle,
    start_date: startDate,
    probation_start_date:
      typeof body.probation_start_date === "string"
        ? body.probation_start_date.trim() || null
        : null,
    probation_end_date:
      typeof body.probation_end_date === "string"
        ? body.probation_end_date.trim() || null
        : null,
    employment_status: employmentStatus,
    onboarding_status: onboardingStatus,
    current_career_level_id:
      typeof body.current_career_level_id === "string" &&
      body.current_career_level_id.trim()
        ? body.current_career_level_id.trim()
        : null,
    leadership_status: leadershipStatus,
    created_by: auth.user.id,
  };

  const { data: employee, error: insertError } = await supabaseAdmin
    .from("employees")
    .insert(insert)
    .select("*")
    .single();

  if (insertError || !employee) {
    return NextResponse.json(
      { error: insertError?.message || "Failed to create employee profile." },
      { status: 500 }
    );
  }

  if (insert.account_manager_id) {
    await supabaseAdmin
      .from("payroll_workers")
      .update({ account_manager_id: insert.account_manager_id })
      .eq("id", workerId);
  }

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "people.employee_create",
    targetType: "employee",
    targetId: employee.id,
    details: {
      worker_id: workerId,
      account_manager_id: insert.account_manager_id,
      role_title: insert.role_title,
      employment_status: insert.employment_status,
    },
  }).catch(() => {});

  return NextResponse.json({ employee }, { status: 201 });
}
