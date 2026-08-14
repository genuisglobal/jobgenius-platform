import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/audit";
import { sendNotification, NOTIFICATION_CATEGORIES } from "@/lib/notify";
import {
  EMPLOYEE_PERMISSION_REQUEST_TYPES,
  calculatePermissionRequestDays,
  normalizeDateOnly,
  type EmployeePermissionRequestType,
} from "@/lib/people";
import {
  getEmployeeByAccountManagerId,
  getEmployeePermissionAllowanceSummary,
  listEmployeePermissionRequests,
  listPeopleManagerAccounts,
} from "@/lib/people-server";

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const employee = await getEmployeeByAccountManagerId(auth.user.id);
    if (!employee) {
      return badRequest("Employee profile not found.", 404);
    }

    const [summary, requests] = await Promise.all([
      getEmployeePermissionAllowanceSummary(employee.id),
      listEmployeePermissionRequests(employee.id),
    ]);

    return NextResponse.json({ employee, summary, requests });
  } catch (error) {
    console.error("Failed to load employee permissions:", error);
    return badRequest("Failed to load employee permissions.", 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  try {
    const employee = await getEmployeeByAccountManagerId(auth.user.id);
    if (!employee) {
      return badRequest("Employee profile not found.", 404);
    }

    const summary = await getEmployeePermissionAllowanceSummary(employee.id);
    if (!summary?.activePolicy) {
      return badRequest(
        "No active permission allowance is configured yet. Contact an operations manager or admin."
      );
    }

    const requestType: EmployeePermissionRequestType =
      typeof body.request_type === "string" &&
      EMPLOYEE_PERMISSION_REQUEST_TYPES.includes(
        body.request_type as EmployeePermissionRequestType
      )
        ? (body.request_type as EmployeePermissionRequestType)
        : "permission";

    const title =
      typeof body.title === "string" && body.title.trim() ? body.title.trim() : "";
    if (!title) {
      return badRequest("Request title is required.");
    }

    const requestedStartDate =
      typeof body.requested_start_date === "string" && body.requested_start_date.trim()
        ? normalizeDateOnly(body.requested_start_date.trim())
        : "";
    const requestedEndDate =
      typeof body.requested_end_date === "string" && body.requested_end_date.trim()
        ? normalizeDateOnly(body.requested_end_date.trim())
        : "";

    if (!requestedStartDate || !requestedEndDate) {
      return badRequest("Start date and end date are required.");
    }

    const requestedDays = calculatePermissionRequestDays(
      requestedStartDate,
      requestedEndDate
    );

    if (requestedDays > summary.remainingDays) {
      return badRequest(
        `This request exceeds your currently available allowance. Remaining requestable days: ${Math.max(
          0,
          summary.remainingDays
        )}.`
      );
    }

    const nowIso = new Date().toISOString();
    const { data: savedRequest, error: saveError } = await supabaseAdmin
      .from("employee_permission_requests")
      .insert({
        employee_id: employee.id,
        policy_id: summary.activePolicy.id,
        request_type: requestType,
        title,
        reason:
          typeof body.reason === "string" ? body.reason.trim() || null : null,
        requested_start_date: requestedStartDate,
        requested_end_date: requestedEndDate,
        requested_days: requestedDays,
        status: "pending",
        submitted_at: nowIso,
      })
      .select("*")
      .single();

    if (saveError || !savedRequest) {
      return badRequest(saveError?.message || "Failed to submit request.", 500);
    }

    logAdminAction({
      adminId: auth.user.id,
      adminEmail: auth.user.email,
      adminRole: auth.user.role,
      action: "people.permission_request_submit",
      targetType: "employee_permission_request",
      targetId: savedRequest.id,
      details: {
        employee_id: employee.id,
        policy_id: summary.activePolicy.id,
        request_type: requestType,
        requested_days: requestedDays,
      },
    }).catch(() => {});

    const peopleManagers = await listPeopleManagerAccounts();
    await Promise.all(
      peopleManagers.map((manager) =>
        sendNotification({
          userId: manager.id,
          userType: "am",
          category: NOTIFICATION_CATEGORIES.people_permission_pending_review,
          subject: "New permission request needs review",
          body: `${employee.worker?.full_name || employee.role_title || "An employee"} submitted a ${requestType} request for ${requestedDays} day${requestedDays === 1 ? "" : "s"}.`,
          linkUrl: "/dashboard/people/permissions",
          channel: "in_app",
          payload: {
            employee_id: employee.id,
            request_id: savedRequest.id,
            request_type: requestType,
            requested_days: requestedDays,
          },
        })
      )
    );

    return NextResponse.json({ request: savedRequest });
  } catch (error) {
    console.error("Failed to submit employee permission request:", error);
    return badRequest(
      error instanceof Error && error.message
        ? error.message
        : "Failed to submit request.",
      500
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
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
    return badRequest("Request id is required.");
  }

  try {
    const employee = await getEmployeeByAccountManagerId(auth.user.id);
    if (!employee) {
      return badRequest("Employee profile not found.", 404);
    }

    const { data: existingRequest, error: existingError } = await supabaseAdmin
      .from("employee_permission_requests")
      .select("id, employee_id, status")
      .eq("id", requestId)
      .eq("employee_id", employee.id)
      .maybeSingle();

    if (existingError || !existingRequest) {
      return badRequest("Permission request not found.", 404);
    }

    if (existingRequest.status !== "pending") {
      return badRequest("Only pending requests can be cancelled.");
    }

    const { data: updatedRequest, error: updateError } = await supabaseAdmin
      .from("employee_permission_requests")
      .update({
        status: "cancelled",
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
      return badRequest(updateError?.message || "Failed to cancel request.", 500);
    }

    logAdminAction({
      adminId: auth.user.id,
      adminEmail: auth.user.email,
      adminRole: auth.user.role,
      action: "people.permission_request_update",
      targetType: "employee_permission_request",
      targetId: updatedRequest.id,
      details: {
        employee_id: employee.id,
        status: "cancelled",
      },
    }).catch(() => {});

    return NextResponse.json({ request: updatedRequest });
  } catch (error) {
    console.error("Failed to cancel employee permission request:", error);
    return badRequest("Failed to cancel request.", 500);
  }
}
