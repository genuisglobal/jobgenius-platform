import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";
import {
  SCORECARD_STATUSES,
  normalizeReviewMonth,
  type ScorecardStatus,
} from "@/lib/people";
import {
  listMonthlyScorecards,
  listScorecardCategories,
  recalculateLeadershipEligibilityForEmployee,
} from "@/lib/people-server";
import { calculateWeightedScorecardTotal, clampScore } from "@/lib/people";
import { logAdminAction } from "@/lib/audit";
import { sendNotification } from "@/lib/notify";

function unauthorized() {
  return NextResponse.json({ error: "People manager access required." }, { status: 403 });
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
    const [categories, scorecards] = await Promise.all([
      listScorecardCategories(),
      listMonthlyScorecards(employeeId),
    ]);
    return NextResponse.json({ categories, scorecards });
  } catch (error) {
    console.error("Failed to load scorecards:", error);
    return NextResponse.json({ error: "Failed to load scorecards." }, { status: 500 });
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

  const employeeId =
    typeof body.employee_id === "string" && body.employee_id.trim()
      ? body.employee_id.trim()
      : "";
  if (!employeeId) {
    return NextResponse.json({ error: "Employee is required." }, { status: 400 });
  }

  const reviewMonthValue =
    typeof body.review_month === "string" && body.review_month.trim()
      ? body.review_month.trim()
      : "";
  if (!reviewMonthValue) {
    return NextResponse.json({ error: "Review month is required." }, { status: 400 });
  }

  const status: ScorecardStatus =
    typeof body.status === "string" &&
    SCORECARD_STATUSES.includes(body.status as ScorecardStatus)
      ? (body.status as ScorecardStatus)
      : "draft";

  if (status === "acknowledged") {
    return NextResponse.json(
      { error: "Employees acknowledge scorecards from self-service." },
      { status: 400 }
    );
  }

  const itemsInput = Array.isArray(body.items)
    ? body.items.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object"
      )
    : [];

  if (itemsInput.length === 0) {
    return NextResponse.json(
      { error: "At least one scorecard item is required." },
      { status: 400 }
    );
  }

  try {
    const [employeeRes, categories, existingScorecards] = await Promise.all([
      supabaseAdmin
        .from("employees")
        .select("id, account_manager_id, leadership_status")
        .eq("id", employeeId)
        .maybeSingle(),
      listScorecardCategories(),
      listMonthlyScorecards(employeeId),
    ]);

    if (employeeRes.error || !employeeRes.data) {
      return NextResponse.json({ error: "Employee not found." }, { status: 404 });
    }

    const categoryMap = new Map(categories.map((category) => [category.id, category]));
    const normalizedReviewMonth = normalizeReviewMonth(reviewMonthValue);
    const existingScorecard =
      existingScorecards.find(
        (scorecard) => scorecard.review_month === normalizedReviewMonth
      ) ?? null;

    const normalizedItems = itemsInput.map((item) => {
      const categoryId =
        typeof item.category_id === "string" ? item.category_id.trim() : "";
      if (!categoryMap.has(categoryId)) {
        throw new Error("Invalid scorecard category.");
      }
      return {
        category_id: categoryId,
        numeric_score: clampScore(Number(item.numeric_score) || 0),
        manager_comments:
          typeof item.manager_comments === "string"
            ? item.manager_comments.trim() || null
            : null,
        evidence_notes:
          typeof item.evidence_notes === "string"
            ? item.evidence_notes.trim() || null
            : null,
        attachment_url:
          typeof item.attachment_url === "string"
            ? item.attachment_url.trim() || null
            : null,
      };
    });

    const categoryIds = new Set(normalizedItems.map((item) => item.category_id));
    if (status === "finalized" && categoryIds.size !== categories.length) {
      return NextResponse.json(
        { error: "Finalize requires scores for all scorecard categories." },
        { status: 400 }
      );
    }

    const finalTotal = calculateWeightedScorecardTotal(normalizedItems, categories);
    const nowIso = new Date().toISOString();
    const scorecardPayload = {
      employee_id: employeeId,
      review_month: normalizedReviewMonth,
      status,
      final_total: finalTotal,
      reviewer_account_manager_id: auth.user.id,
      overall_comments:
        typeof body.overall_comments === "string"
          ? body.overall_comments.trim() || null
          : null,
      reviewed_at: status === "finalized" ? nowIso : null,
    };

    const { data: scorecard, error: upsertError } = await supabaseAdmin
      .from("monthly_scorecards")
      .upsert(scorecardPayload, { onConflict: "employee_id,review_month" })
      .select("*")
      .single();

    if (upsertError || !scorecard) {
      return NextResponse.json(
        { error: upsertError?.message || "Failed to save scorecard." },
        { status: 500 }
      );
    }

    await supabaseAdmin
      .from("monthly_scorecard_items")
      .delete()
      .eq("scorecard_id", scorecard.id);

    const itemRows = normalizedItems.map((item) => ({
      scorecard_id: scorecard.id,
      ...item,
    }));

    const { error: itemsError } = await supabaseAdmin
      .from("monthly_scorecard_items")
      .insert(itemRows);

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    const leadershipRecord = await recalculateLeadershipEligibilityForEmployee({
      employeeId,
      reviewMonth: normalizedReviewMonth,
      reviewedBy: auth.user.id,
    });

    logAdminAction({
      adminId: auth.user.id,
      adminEmail: auth.user.email,
      adminRole: auth.user.role,
      action: "people.scorecard_update",
      targetType: "monthly_scorecard",
      targetId: scorecard.id,
      details: {
        employee_id: employeeId,
        review_month: normalizedReviewMonth,
        status,
        final_total: finalTotal,
        leadership_status: leadershipRecord.status,
      },
    }).catch(() => {});

    logAdminAction({
      adminId: auth.user.id,
      adminEmail: auth.user.email,
      adminRole: auth.user.role,
      action: "people.leadership_recalculate",
      targetType: "employee",
      targetId: employeeId,
      details: {
        review_month: normalizedReviewMonth,
        leadership_status: leadershipRecord.status,
        auto_flagged: leadershipRecord.auto_flagged,
      },
    }).catch(() => {});

    if (
      leadershipRecord.auto_flagged &&
      leadershipRecord.status === "eligible_for_course" &&
      employeeRes.data.account_manager_id &&
      employeeRes.data.leadership_status !== "eligible_for_course"
    ) {
      sendNotification({
        userId: employeeRes.data.account_manager_id,
        userType: "am",
        category: "employee_leadership_course_eligible",
        subject: "You are now eligible for leadership course review",
        body: `Your ${normalizedReviewMonth} performance history now qualifies you for leadership course consideration. Management can review your growth path in the leadership pipeline.`,
        linkUrl: "/dashboard/me/career",
        channel: "in_app",
        payload: {
          employee_id: employeeId,
          review_month: normalizedReviewMonth,
          leadership_record_id: leadershipRecord.id,
        },
      }).catch(() => {});
    }

    if (
      status === "finalized" &&
      employeeRes.data.account_manager_id &&
      existingScorecard?.status !== "finalized"
    ) {
      sendNotification({
        userId: employeeRes.data.account_manager_id,
        userType: "am",
        category: "employee_scorecard_finalized",
        subject: "Your monthly scorecard is ready",
        body: `Your ${normalizedReviewMonth} JobGenuis scorecard has been finalized and is available for review.`,
        linkUrl: "/dashboard/me/performance",
        channel: "in_app",
        payload: {
          scorecard_id: scorecard.id,
          review_month: normalizedReviewMonth,
        },
      }).catch(() => {});
    }

    return NextResponse.json({
      scorecard,
      leadership_record: leadershipRecord,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to save scorecard.";
    const statusCode =
      message === "Invalid review month." || message === "Invalid scorecard category."
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
