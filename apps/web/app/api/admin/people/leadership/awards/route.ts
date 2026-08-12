import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";
import { normalizeReviewMonth } from "@/lib/people";
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
  const reason =
    typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "";
  const awardMonthRaw =
    typeof body.award_month === "string" && body.award_month.trim()
      ? body.award_month.trim()
      : "";

  if (!employeeId || !reason || !awardMonthRaw) {
    return NextResponse.json(
      { error: "Award month, employee, and reason are required." },
      { status: 400 }
    );
  }

  try {
    const normalizedAwardMonth = normalizeReviewMonth(awardMonthRaw);

    const { data: employee, error: employeeError } = await supabaseAdmin
      .from("employees")
      .select("id, account_manager_id")
      .eq("id", employeeId)
      .maybeSingle();

    if (employeeError || !employee) {
      return NextResponse.json({ error: "Employee not found." }, { status: 404 });
    }

    const scorecardId =
      typeof body.scorecard_id === "string" && body.scorecard_id.trim()
        ? body.scorecard_id.trim()
        : null;

    if (scorecardId) {
      const { data: scorecard, error: scorecardError } = await supabaseAdmin
        .from("monthly_scorecards")
        .select("id, employee_id")
        .eq("id", scorecardId)
        .maybeSingle();
      if (scorecardError || !scorecard || scorecard.employee_id !== employeeId) {
        return NextResponse.json(
          { error: "Selected scorecard does not belong to the employee." },
          { status: 400 }
        );
      }
    }

    const payload = {
      award_month: normalizedAwardMonth,
      employee_id: employeeId,
      scorecard_id: scorecardId,
      award_title:
        typeof body.award_title === "string" && body.award_title.trim()
          ? body.award_title.trim()
          : "Leader of the Month",
      reason,
      award_description:
        typeof body.award_description === "string"
          ? body.award_description.trim() || null
          : null,
      created_by: auth.user.id,
    };

    const { data: award, error } = await supabaseAdmin
      .from("leader_of_month_awards")
      .upsert(payload, { onConflict: "award_month" })
      .select("*")
      .single();

    if (error || !award) {
      return NextResponse.json(
        { error: error?.message || "Failed to save leader of the month award." },
        { status: 500 }
      );
    }

    logAdminAction({
      adminId: auth.user.id,
      adminEmail: auth.user.email,
      adminRole: auth.user.role,
      action: "people.leader_of_month_update",
      targetType: "leader_of_month_award",
      targetId: award.id,
      details: {
        award_month: normalizedAwardMonth,
        employee_id: employeeId,
        scorecard_id: scorecardId,
      },
    }).catch(() => {});

    if (employee.account_manager_id) {
      sendNotification({
        userId: employee.account_manager_id,
        userType: "am",
        category: "employee_leader_of_month_selected",
        subject: "You were selected as Leader of the Month",
        body: `Management recognized you as Leader of the Month for ${normalizedAwardMonth}.`,
        linkUrl: "/dashboard/me/career",
        channel: "in_app",
        payload: {
          leader_of_month_award_id: award.id,
          award_month: normalizedAwardMonth,
        },
      }).catch(() => {});
    }

    return NextResponse.json({ award });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to save leader of the month award.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
