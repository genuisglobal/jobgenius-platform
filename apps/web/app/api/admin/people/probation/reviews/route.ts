import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";
import {
  PROBATION_DECISION_STATUSES,
  PROBATION_REVIEW_STATUSES,
  getProbationCheckpointLabel,
  type ProbationDecisionStatus,
  type ProbationReviewStatus,
} from "@/lib/people";
import { getProbationSummaryForEmployee } from "@/lib/people-server";
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
  const reviewMonthIndex = Math.max(
    1,
    Math.min(6, Number(body.review_month_index) || 0)
  );

  if (!employeeId || !reviewMonthIndex) {
    return NextResponse.json(
      { error: "Employee and review month are required." },
      { status: 400 }
    );
  }

  const status: ProbationReviewStatus =
    typeof body.status === "string" &&
    PROBATION_REVIEW_STATUSES.includes(body.status as ProbationReviewStatus)
      ? (body.status as ProbationReviewStatus)
      : "draft";
  const finalDecision: ProbationDecisionStatus =
    typeof body.final_decision === "string" &&
    PROBATION_DECISION_STATUSES.includes(
      body.final_decision as ProbationDecisionStatus
    )
      ? (body.final_decision as ProbationDecisionStatus)
      : "pending";

  const summary = await getProbationSummaryForEmployee(employeeId);
  if (!summary) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  const successfulAcceptedOffersCount =
    typeof body.successful_accepted_offers_count === "number"
      ? body.successful_accepted_offers_count
      : summary.verifiedAcceptedOffersCount;
  const monthlyAverageScore =
    typeof body.monthly_average_score === "number"
      ? body.monthly_average_score
      : summary.latestScorecardAverage;
  const earlyPermanentEligible =
    typeof body.early_permanent_eligible === "boolean"
      ? body.early_permanent_eligible
      : successfulAcceptedOffersCount >= 3;

  const payload = {
    employee_id: employeeId,
    review_month_index: reviewMonthIndex,
    checkpoint_label: getProbationCheckpointLabel(reviewMonthIndex),
    review_date:
      typeof body.review_date === "string" && body.review_date.trim()
        ? body.review_date.trim()
        : null,
    status,
    successful_accepted_offers_count: successfulAcceptedOffersCount,
    monthly_average_score: monthlyAverageScore,
    manager_notes:
      typeof body.manager_notes === "string" ? body.manager_notes.trim() || null : null,
    warnings_summary:
      typeof body.warnings_summary === "string"
        ? body.warnings_summary.trim() || null
        : null,
    early_permanent_eligible: earlyPermanentEligible,
    final_decision: finalDecision,
    reviewed_by: auth.user.id,
  };

  const { data: review, error } = await supabaseAdmin
    .from("probation_reviews")
    .upsert(payload, { onConflict: "employee_id,review_month_index" })
    .select("*")
    .single();

  if (error || !review) {
    return NextResponse.json(
      { error: error?.message || "Failed to save probation review." },
      { status: 500 }
    );
  }

  const employeeUpdates: Record<string, unknown> = {};
  if (finalDecision === "permanent_approved") {
    employeeUpdates.employment_status = "permanent";
  } else if (finalDecision === "probation_failed") {
    employeeUpdates.employment_status = "terminated";
    employeeUpdates.active = false;
  } else if (summary.employee.employment_status === "tentative") {
    employeeUpdates.employment_status = "probation";
  }

  if (Object.keys(employeeUpdates).length > 0) {
    await supabaseAdmin.from("employees").update(employeeUpdates).eq("id", employeeId);
  }

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "people.probation_review_update",
    targetType: "probation_review",
    targetId: review.id,
    details: {
      employee_id: employeeId,
      review_month_index: reviewMonthIndex,
      final_decision: finalDecision,
      early_permanent_eligible: earlyPermanentEligible,
    },
  }).catch(() => {});

  if (summary.employee.account_manager?.id) {
    sendNotification({
      userId: summary.employee.account_manager.id,
      userType: "am",
      category: "employee_probation_review_updated",
      subject: "Your probation review was updated",
      body: `Your ${getProbationCheckpointLabel(reviewMonthIndex)} record has been updated by management.`,
      linkUrl: "/dashboard/me/probation",
      channel: "in_app",
      payload: {
        probation_review_id: review.id,
        review_month_index: reviewMonthIndex,
        final_decision: finalDecision,
      },
    }).catch(() => {});
  }

  return NextResponse.json({ review });
}
