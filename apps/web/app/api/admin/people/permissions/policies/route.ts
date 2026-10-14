import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";
import {
  EMPLOYEE_PERMISSION_PERIOD_KINDS,
  calculatePermissionPolicyEndDate,
  normalizeDateOnly,
  type EmployeePermissionPeriodKind,
} from "@/lib/people";
import {
  getEmployeeById,
  listEmployeePermissionAllowanceSummaries,
  listEmployeePermissionPolicies,
} from "@/lib/people-server";
import { logAdminAction } from "@/lib/audit";

function unauthorized() {
  return NextResponse.json({ error: "People manager access required." }, { status: 403 });
}

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
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
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId") || undefined;
    const [policies, summaries] = await Promise.all([
      listEmployeePermissionPolicies(employeeId),
      employeeId
        ? listEmployeePermissionAllowanceSummaries().then((rows) =>
            rows.filter((row) => row.employee.id === employeeId)
          )
        : listEmployeePermissionAllowanceSummaries(),
    ]);

    return NextResponse.json({ policies, summaries });
  } catch (error) {
    console.error("Failed to load permission policies:", error);
    return badRequest("Failed to load permission policies.", 500);
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
    return badRequest("Invalid JSON body.");
  }

  const policyId =
    typeof body.id === "string" && body.id.trim() ? body.id.trim() : null;
  const employeeId =
    typeof body.employee_id === "string" && body.employee_id.trim()
      ? body.employee_id.trim()
      : "";
  if (!employeeId) {
    return badRequest("Employee is required.");
  }

  const periodKind: EmployeePermissionPeriodKind =
    typeof body.period_kind === "string" &&
    EMPLOYEE_PERMISSION_PERIOD_KINDS.includes(
      body.period_kind as EmployeePermissionPeriodKind
    )
      ? (body.period_kind as EmployeePermissionPeriodKind)
      : "one_year";

  const allowedDays = Math.max(
    0,
    Math.min(365, Math.round(Number(body.allowed_days) || 0))
  );
  if (allowedDays <= 0) {
    return badRequest("Allowed days must be greater than 0.");
  }

  const periodStartDate =
    typeof body.period_start_date === "string" && body.period_start_date.trim()
      ? normalizeDateOnly(body.period_start_date.trim())
      : "";
  if (!periodStartDate) {
    return badRequest("Policy start date is required.");
  }

  try {
    const employee = await getEmployeeById(employeeId);
    if (!employee) {
      return badRequest("Employee not found.", 404);
    }

    const payload = {
      employee_id: employeeId,
      period_kind: periodKind,
      period_start_date: periodStartDate,
      period_end_date: calculatePermissionPolicyEndDate(periodStartDate, periodKind),
      allowed_days: allowedDays,
      active: true,
      notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
      configured_by: auth.user.id,
    };

    let savedPolicy:
      | {
          id: string;
          employee_id: string;
          period_kind: string;
          period_start_date: string;
          period_end_date: string;
          allowed_days: number;
          active: boolean;
          notes: string | null;
        }
      | null = null;

    if (policyId) {
      const { data, error } = await supabaseAdmin
        .from("employee_permission_policies")
        .update(payload)
        .eq("id", policyId)
        .select("*")
        .single();

      if (error || !data) {
        return badRequest(error?.message || "Failed to update policy.", 500);
      }
      savedPolicy = data;
    } else {
      const { error: deactivateError } = await supabaseAdmin
        .from("employee_permission_policies")
        .update({ active: false })
        .eq("employee_id", employeeId)
        .eq("active", true);

      if (deactivateError) {
        return badRequest(deactivateError.message, 500);
      }

      const { data, error } = await supabaseAdmin
        .from("employee_permission_policies")
        .insert(payload)
        .select("*")
        .single();

      if (error || !data) {
        return badRequest(error?.message || "Failed to create policy.", 500);
      }
      savedPolicy = data;
    }

    if (!savedPolicy) {
      return badRequest("Failed to save policy.", 500);
    }

    logAdminAction({
      adminId: auth.user.id,
      adminEmail: auth.user.email,
      adminRole: auth.user.role,
      action: "people.permission_policy_update",
      targetType: "employee_permission_policy",
      targetId: savedPolicy.id,
      details: {
        employee_id: employeeId,
        period_kind: payload.period_kind,
        period_start_date: payload.period_start_date,
        period_end_date: payload.period_end_date,
        allowed_days: payload.allowed_days,
      },
    }).catch(() => {});

    return NextResponse.json({ policy: savedPolicy });
  } catch (error) {
    console.error("Failed to save permission policy:", error);
    return badRequest("Failed to save permission policy.", 500);
  }
}
