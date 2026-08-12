import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";
import {
  LEADERSHIP_PIPELINE_STATUSES,
  LEADERSHIP_TRIAL_STATUSES,
  mapTrialStatusToLeadershipStatus,
  type LeadershipPipelineStatus,
  type LeadershipTrialStatus,
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
  const title =
    typeof body.title === "string" && body.title.trim() ? body.title.trim() : "";
  if (!employeeId || !title) {
    return NextResponse.json(
      { error: "Employee and trial title are required." },
      { status: 400 }
    );
  }

  const status: LeadershipTrialStatus =
    typeof body.status === "string" &&
    LEADERSHIP_TRIAL_STATUSES.includes(body.status as LeadershipTrialStatus)
      ? (body.status as LeadershipTrialStatus)
      : "planned";

  const finalDecision: LeadershipPipelineStatus | null =
    typeof body.final_decision === "string" &&
    LEADERSHIP_PIPELINE_STATUSES.includes(
      body.final_decision as LeadershipPipelineStatus
    )
      ? (body.final_decision as LeadershipPipelineStatus)
      : null;

  const trialId =
    typeof body.id === "string" && body.id.trim() ? body.id.trim() : null;

  const { data: employee, error: employeeError } = await supabaseAdmin
    .from("employees")
    .select("id, account_manager_id")
    .eq("id", employeeId)
    .maybeSingle();

  if (employeeError || !employee) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  const payload = {
    employee_id: employeeId,
    title,
    description:
      typeof body.description === "string" ? body.description.trim() || null : null,
    start_date:
      typeof body.start_date === "string" && body.start_date.trim()
        ? body.start_date.trim()
        : null,
    end_date:
      typeof body.end_date === "string" && body.end_date.trim()
        ? body.end_date.trim()
        : null,
    status,
    reviewed_by: auth.user.id,
    outcome_notes:
      typeof body.outcome_notes === "string"
        ? body.outcome_notes.trim() || null
        : null,
    final_decision: finalDecision,
  };

  let query = supabaseAdmin.from("leadership_trials");
  const result = trialId
    ? await query.update(payload).eq("id", trialId).select("*").single()
    : await query.insert(payload).select("*").single();

  if (result.error || !result.data) {
    return NextResponse.json(
      { error: result.error?.message || "Failed to save leadership trial." },
      { status: 500 }
    );
  }

  const employeeLeadershipStatus = mapTrialStatusToLeadershipStatus({
    status,
    finalDecision,
  });
  await supabaseAdmin
    .from("employees")
    .update({ leadership_status: employeeLeadershipStatus })
    .eq("id", employeeId);

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "people.leadership_trial_update",
    targetType: "leadership_trial",
    targetId: result.data.id,
    details: {
      employee_id: employeeId,
      title,
      status,
      final_decision: finalDecision,
      leadership_status: employeeLeadershipStatus,
    },
  }).catch(() => {});

  if (employee.account_manager_id) {
    sendNotification({
      userId: employee.account_manager_id,
      userType: "am",
      category: "employee_leadership_trial_updated",
      subject: "Your leadership trial was updated",
      body: `Management updated your leadership trial "${title}" to ${status.replace(
        /_/g,
        " "
      )}.`,
      linkUrl: "/dashboard/me/career",
      channel: "in_app",
      payload: {
        leadership_trial_id: result.data.id,
        status,
        final_decision: finalDecision,
      },
    }).catch(() => {});
  }

  return NextResponse.json({ trial: result.data });
}
