import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";
import { logAdminAction } from "@/lib/audit";
import { NOTIFICATION_CATEGORIES, sendNotification } from "@/lib/notify";
import {
  EMPLOYEE_PERMISSION_REQUEST_STATUSES,
  calculatePermissionAllowanceSummary,
  type EmployeePermissionRequestStatus,
} from "@/lib/people";
import {
  listEmployeePermissionPolicies,
  listEmployeePermissionRequests,
} from "@/lib/people-server";

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
    const requests = await listEmployeePermissionRequests(employeeId);
    return NextResponse.json({ requests });
  } catch (error) {
    console.error("Failed to load permission requests:", error);
    return badRequest("Failed to load permission requests.", 500);
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

  const requestId =
    typeof body.id === "string" && body.id.trim() ? body.id.trim() : "";
  if (!requestId) {
    return badRequest("Permission request id is required.");
  }

  const nextStatus: EmployeePermissionRequestStatus =
    typeof body.status === "string" &&
    EMPLOYEE_PERMISSION_REQUEST_STATUSES.includes(
      body.status as EmployeePermissionRequestStatus
    )
      ? (body.status as EmployeePermissionRequestStatus)
      : "pending";

  if (nextStatus === "pending") {
    return badRequest("Use review actions to approve, reject, or cancel requests.");
  }

  try {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("employee_permission_requests")
      .select(
        `
        id,
        employee_id,
        policy_id,
        title,
        requested_days,
        approved_days,
        status,
        employee:employees!employee_permission_requests_employee_id_fkey(
          account_manager_id
        )
      `
      )
      .eq("id", requestId)
      .maybeSingle();

    if (existingError || !existing) {
      return badRequest("Permission request not found.", 404);
    }

    if (existing.status !== "pending") {
      return badRequest("Only pending requests can be reviewed.");
    }

    let approvedDays: number | null = null;
    if (nextStatus === "approved") {
      if (!existing.policy_id) {
        return badRequest("This request is not linked to an active policy window.");
      }

      const [policies, requests] = await Promise.all([
        listEmployeePermissionPolicies(existing.employee_id),
        listEmployeePermissionRequests(existing.employee_id),
      ]);

      const policy = policies.find((entry) => entry.id === existing.policy_id) ?? null;
      if (!policy) {
        return badRequest("Linked policy not found.");
      }

      const siblingRequests = requests.filter(
        (entry) => entry.policy_id === existing.policy_id && entry.id !== existing.id
      );
      const allowance = calculatePermissionAllowanceSummary({
        allowedDays: policy.allowed_days,
        requests: siblingRequests,
      });

      approvedDays = Math.round(
        Number(body.approved_days ?? existing.requested_days) || 0
      );
      if (approvedDays <= 0) {
        return badRequest("Approved days must be greater than 0.");
      }
      if (approvedDays > existing.requested_days) {
        return badRequest("Approved days cannot exceed requested days.");
      }
      if (approvedDays > allowance.remainingDays) {
        return badRequest(
          `Approval exceeds the remaining allowance in this policy window. Available days: ${Math.max(
            0,
            allowance.remainingDays
          )}.`
        );
      }
    }

    const { data: updatedRequest, error: updateError } = await supabaseAdmin
      .from("employee_permission_requests")
      .update({
        status: nextStatus,
        approved_days: approvedDays,
        decided_by: auth.user.id,
        decided_at: new Date().toISOString(),
        manager_comment:
          typeof body.manager_comment === "string"
            ? body.manager_comment.trim() || null
            : null,
      })
      .eq("id", requestId)
      .select("*")
      .single();

    if (updateError || !updatedRequest) {
      return badRequest(updateError?.message || "Failed to review request.", 500);
    }

    logAdminAction({
      adminId: auth.user.id,
      adminEmail: auth.user.email,
      adminRole: auth.user.role,
      action: "people.permission_request_update",
      targetType: "employee_permission_request",
      targetId: updatedRequest.id,
      details: {
        employee_id: existing.employee_id,
        status: nextStatus,
        approved_days: approvedDays,
      },
    }).catch(() => {});

    const employeeAccountManagerId =
      Array.isArray(existing.employee)
        ? existing.employee[0]?.account_manager_id ?? null
        : (existing.employee as { account_manager_id?: string | null } | null)
            ?.account_manager_id ?? null;

    if (employeeAccountManagerId) {
      await sendNotification({
        userId: employeeAccountManagerId,
        userType: "am",
        category: NOTIFICATION_CATEGORIES.employee_permission_decision,
        subject: `Your ${updatedRequest.request_type} request was ${nextStatus.replace(/_/g, " ")}`,
        body:
          nextStatus === "approved"
            ? `${updatedRequest.title} was approved for ${approvedDays} day${approvedDays === 1 ? "" : "s"}.`
            : `${updatedRequest.title} was ${nextStatus.replace(/_/g, " ")} by management.`,
        linkUrl: "/dashboard/me/permissions",
        channel: "in_app",
        payload: {
          request_id: updatedRequest.id,
          status: nextStatus,
          approved_days: approvedDays,
        },
      });
    }

    return NextResponse.json({ request: updatedRequest });
  } catch (error) {
    console.error("Failed to review permission request:", error);
    return badRequest("Failed to review permission request.", 500);
  }
}
