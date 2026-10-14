import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import {
  EMPLOYEE_EMPLOYMENT_STATUSES,
  EMPLOYEE_ONBOARDING_STATUSES,
  REQUIRED_ONBOARDING_ACK_KEYS,
  type EmployeeEmploymentStatus,
  type EmployeeOnboardingStatus,
} from "@/lib/people";
import {
  getEmployeeByAccountManagerId,
  getEmployeeOnboardingForm,
  listActivePolicyDocuments,
  listPolicyAcknowledgementsForEmployee,
} from "@/lib/people-server";
import { logAdminAction } from "@/lib/audit";

function getClientIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || null;
  }
  return request.headers.get("x-real-ip");
}

export async function GET(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const employee = await getEmployeeByAccountManagerId(auth.user.id);
    if (!employee) {
      return NextResponse.json({ error: "Employee profile not found." }, { status: 404 });
    }

    const [form, policies, acknowledgements] = await Promise.all([
      getEmployeeOnboardingForm(employee.id),
      listActivePolicyDocuments(),
      listPolicyAcknowledgementsForEmployee(employee.id),
    ]);

    return NextResponse.json({
      employee,
      form,
      policies,
      acknowledgements,
    });
  } catch (error) {
    console.error("Failed to load employee onboarding context:", error);
    return NextResponse.json(
      { error: "Failed to load onboarding context." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const employee = await getEmployeeByAccountManagerId(auth.user.id);
    if (!employee) {
      return NextResponse.json({ error: "Employee profile not found." }, { status: 404 });
    }

    const mode = body.mode === "submit" ? "submit" : "save";
    const [workerLookup, existingForm, policies] = await Promise.all([
      supabaseAdmin
        .from("payroll_workers")
        .select("full_name, email")
        .eq("id", employee.worker_id)
        .maybeSingle(),
      getEmployeeOnboardingForm(employee.id),
      listActivePolicyDocuments(),
    ]);

    if (workerLookup.error || !workerLookup.data) {
      return NextResponse.json({ error: "Linked worker not found." }, { status: 500 });
    }

    const fullName =
      typeof body.full_name === "string" && body.full_name.trim()
        ? body.full_name.trim()
        : workerLookup.data.full_name;
    const email =
      typeof body.email === "string" && body.email.trim()
        ? body.email.trim()
        : workerLookup.data.email ?? "";
    const signatureName =
      typeof body.signature_name === "string" ? body.signature_name.trim() : "";
    const acknowledgedPolicyIds = Array.isArray(body.acknowledged_policy_ids)
      ? body.acknowledged_policy_ids.filter(
          (value): value is string => typeof value === "string" && value.trim().length > 0
        )
      : [];

    if (!fullName || !email) {
      return NextResponse.json(
        { error: "Full name and email are required." },
        { status: 400 }
      );
    }

    const formState = REQUIRED_ONBOARDING_ACK_KEYS.reduce<Record<string, boolean>>(
      (acc, key) => {
        acc[key] = Boolean(body[key]);
        return acc;
      },
      {}
    );

    const allCheckboxesComplete = REQUIRED_ONBOARDING_ACK_KEYS.every(
      (key) => formState[key]
    );
    const allPoliciesComplete =
      policies.length === 0 || acknowledgedPolicyIds.length === policies.length;

    if (mode === "submit") {
      if (!signatureName) {
        return NextResponse.json(
          { error: "Signature name is required before submitting onboarding." },
          { status: 400 }
        );
      }
      if (!allCheckboxesComplete || !allPoliciesComplete) {
        return NextResponse.json(
          { error: "Complete all acknowledgements before submitting onboarding." },
          { status: 400 }
        );
      }
    }

    const employmentStatus: EmployeeEmploymentStatus =
      typeof body.employment_status === "string" &&
      EMPLOYEE_EMPLOYMENT_STATUSES.includes(
        body.employment_status as EmployeeEmploymentStatus
      )
        ? (body.employment_status as EmployeeEmploymentStatus)
        : employee.employment_status;

    const fallbackStatus: EmployeeOnboardingStatus =
      existingForm?.status === "needs_changes" ? "needs_changes" : "pending";
    const nextStatus: EmployeeOnboardingStatus =
      mode === "submit" ? "submitted" : fallbackStatus;
    const nowIso = new Date().toISOString();
    const signatureAt = mode === "submit" ? nowIso : existingForm?.signature_at ?? null;
    const ip = getClientIp(request);

    const formPayload = {
      employee_id: employee.id,
      full_name: fullName,
      email,
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
      role_title:
        typeof body.role_title === "string" ? body.role_title.trim() || null : null,
      start_date:
        typeof body.start_date === "string" ? body.start_date.trim() || null : null,
      supervisor_employee_id:
        typeof body.supervisor_employee_id === "string" &&
        body.supervisor_employee_id.trim()
          ? body.supervisor_employee_id.trim()
          : null,
      employment_status: employmentStatus,
      acknowledge_role_expectations: formState.acknowledge_role_expectations,
      acknowledge_tentative_offer: formState.acknowledge_tentative_offer,
      acknowledge_probation_policy: formState.acknowledge_probation_policy,
      acknowledge_bonus_policy: formState.acknowledge_bonus_policy,
      acknowledge_social_fund_policy: formState.acknowledge_social_fund_policy,
      acknowledge_social_lead_policy: formState.acknowledge_social_lead_policy,
      acknowledge_leadership_growth: formState.acknowledge_leadership_growth,
      signature_name: signatureName || existingForm?.signature_name || null,
      signature_at: signatureAt,
      status: nextStatus,
      submitted_at: mode === "submit" ? nowIso : existingForm?.submitted_at ?? null,
    };

    const { data: form, error: upsertError } = await supabaseAdmin
      .from("employee_onboarding_forms")
      .upsert(formPayload, { onConflict: "employee_id" })
      .select("*")
      .single();

    if (upsertError || !form) {
      return NextResponse.json(
        { error: upsertError?.message || "Failed to save onboarding form." },
        { status: 500 }
      );
    }

    const employeeUpdates = {
      phone_number: formPayload.phone_number,
      whatsapp_number: formPayload.whatsapp_number,
      address_location: formPayload.address_location,
      emergency_contact_name: formPayload.emergency_contact_name,
      emergency_contact_phone: formPayload.emergency_contact_phone,
      role_title: formPayload.role_title,
      start_date: formPayload.start_date,
      supervisor_employee_id: formPayload.supervisor_employee_id,
      employment_status: formPayload.employment_status,
      onboarding_status: nextStatus,
    };

    const { error: employeeUpdateError } = await supabaseAdmin
      .from("employees")
      .update(employeeUpdates)
      .eq("id", employee.id);

    if (employeeUpdateError) {
      return NextResponse.json(
        { error: employeeUpdateError.message },
        { status: 500 }
      );
    }

    const activePolicyIds = policies.map((policy) => policy.id);
    if (activePolicyIds.length > 0) {
      await supabaseAdmin
        .from("employee_policy_acknowledgements")
        .delete()
        .eq("employee_id", employee.id)
        .in("policy_document_id", activePolicyIds);
    }

    if (acknowledgedPolicyIds.length > 0) {
      const acknowledgementRows = acknowledgedPolicyIds.map((policyId) => ({
        employee_id: employee.id,
        policy_document_id: policyId,
        acknowledged: true,
        signature_name: signatureName || formPayload.signature_name,
        signature_at: mode === "submit" ? nowIso : signatureAt ?? nowIso,
        signature_ip: ip,
      }));

      const { error: acknowledgementError } = await supabaseAdmin
        .from("employee_policy_acknowledgements")
        .insert(acknowledgementRows);

      if (acknowledgementError) {
        return NextResponse.json(
          { error: acknowledgementError.message },
          { status: 500 }
        );
      }
    }

    logAdminAction({
      adminId: auth.user.id,
      adminEmail: auth.user.email,
      adminRole: auth.user.role,
      action: "people.onboarding_submit",
      targetType: "employee_onboarding_form",
      targetId: form.id,
      details: {
        employee_id: employee.id,
        mode,
        status: nextStatus,
      },
      ip: ip ?? undefined,
      userAgent: request.headers.get("user-agent") ?? undefined,
    }).catch(() => {});

    if (acknowledgedPolicyIds.length > 0) {
      logAdminAction({
        adminId: auth.user.id,
        adminEmail: auth.user.email,
        adminRole: auth.user.role,
        action: "people.policy_acknowledge",
        targetType: "employee",
        targetId: employee.id,
        details: {
          policy_document_ids: acknowledgedPolicyIds,
          mode,
        },
        ip: ip ?? undefined,
        userAgent: request.headers.get("user-agent") ?? undefined,
      }).catch(() => {});
    }

    return NextResponse.json({
      form,
      onboarding_status: nextStatus,
      policy_acknowledgement_count: acknowledgedPolicyIds.length,
    });
  } catch (error) {
    console.error("Failed to save employee onboarding:", error);
    return NextResponse.json(
      { error: "Failed to save onboarding form." },
      { status: 500 }
    );
  }
}
