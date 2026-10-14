import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";
import {
  LEADERSHIP_COURSE_STATUSES,
  mapCourseStatusToLeadershipStatus,
  type LeadershipCourseStatus,
} from "@/lib/people";
import { logAdminAction } from "@/lib/audit";
import { sendNotification } from "@/lib/notify";

function unauthorized() {
  return NextResponse.json({ error: "People manager access required." }, { status: 403 });
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

  const employeeId =
    typeof body.employee_id === "string" && body.employee_id.trim()
      ? body.employee_id.trim()
      : "";
  if (!employeeId) {
    return NextResponse.json({ error: "Employee is required." }, { status: 400 });
  }

  const status: LeadershipCourseStatus =
    typeof body.status === "string" &&
    LEADERSHIP_COURSE_STATUSES.includes(body.status as LeadershipCourseStatus)
      ? (body.status as LeadershipCourseStatus)
      : "approved";

  const enrollmentId =
    typeof body.id === "string" && body.id.trim() ? body.id.trim() : null;

  const { data: employee, error: employeeError } = await supabaseAdmin
    .from("employees")
    .select("id, account_manager_id")
    .eq("id", employeeId)
    .maybeSingle();

  if (employeeError || !employee) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const payload = {
    employee_id: employeeId,
    approved_by: auth.user.id,
    status,
    approved_at:
      typeof body.approved_at === "string" && body.approved_at.trim()
        ? body.approved_at.trim()
        : nowIso,
    enrolled_at:
      status === "enrolled" || status === "completed"
        ? typeof body.enrolled_at === "string" && body.enrolled_at.trim()
          ? body.enrolled_at.trim()
          : nowIso
        : null,
    completed_at:
      status === "completed"
        ? typeof body.completed_at === "string" && body.completed_at.trim()
          ? body.completed_at.trim()
          : nowIso
        : null,
    notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
  };

  let query = supabaseAdmin.from("leadership_course_enrollments");
  const result = enrollmentId
    ? await query.update(payload).eq("id", enrollmentId).select("*").single()
    : await query.insert(payload).select("*").single();

  if (result.error || !result.data) {
    return NextResponse.json(
      { error: result.error?.message || "Failed to save leadership course record." },
      { status: 500 }
    );
  }

  const employeeLeadershipStatus = mapCourseStatusToLeadershipStatus(status);
  await supabaseAdmin
    .from("employees")
    .update({ leadership_status: employeeLeadershipStatus })
    .eq("id", employeeId);

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "people.leadership_course_update",
    targetType: "leadership_course_enrollment",
    targetId: result.data.id,
    details: {
      employee_id: employeeId,
      status,
      leadership_status: employeeLeadershipStatus,
    },
  }).catch(() => {});

  if (employee.account_manager_id) {
    sendNotification({
      userId: employee.account_manager_id,
      userType: "am",
      category: "employee_leadership_course_updated",
      subject: "Your leadership course status was updated",
      body: `Management updated your JobGenuis leadership course record to ${status.replace(
        /_/g,
        " "
      )}.`,
      linkUrl: "/dashboard/me/career",
      channel: "in_app",
      payload: {
        leadership_course_enrollment_id: result.data.id,
        status,
      },
    }).catch(() => {});
  }

  return NextResponse.json({ enrollment: result.data });
}
