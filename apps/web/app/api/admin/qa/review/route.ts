import { NextResponse } from "next/server";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";

// POST /api/admin/qa/review — record a QA verdict for a sampled run.
// A sensitive-answer error is the zero-tolerance failure class: it raises a
// HIGH ops_alert (surfaced by the existing ops-alerts pipeline) in addition
// to the review row.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am" || !isAdminRole(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: {
    review_id?: string;
    verdict?: string;
    field_accuracy_score?: number;
    sensitive_answer_error?: boolean;
    issues?: Array<{ field?: string; expected?: string; actual?: string; note?: string }>;
    notes?: string;
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const verdict = payload.verdict ?? "";
  if (!payload.review_id || !["PASS", "MINOR_ISSUES", "MAJOR_ISSUES"].includes(verdict)) {
    return NextResponse.json(
      { error: "review_id and a valid verdict are required." },
      { status: 400 }
    );
  }

  const accuracy =
    typeof payload.field_accuracy_score === "number"
      ? Math.max(0, Math.min(100, Math.round(payload.field_accuracy_score)))
      : null;
  const sensitiveError = Boolean(payload.sensitive_answer_error);

  const { data: review, error } = await supabaseAdmin
    .from("qa_reviews")
    .update({
      status: "REVIEWED",
      reviewer_id: user.id,
      verdict,
      field_accuracy_score: accuracy,
      sensitive_answer_error: sensitiveError,
      issues: Array.isArray(payload.issues) ? payload.issues.slice(0, 20) : [],
      notes: (payload.notes ?? "").slice(0, 2000) || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", payload.review_id)
    .select("id, run_id, job_seeker_id")
    .single();

  if (error || !review) {
    return NextResponse.json({ error: "Review not found." }, { status: 404 });
  }

  if (sensitiveError) {
    await supabaseAdmin.from("ops_alerts").insert({
      severity: "HIGH",
      type: "QA_SENSITIVE_ANSWER_ERROR",
      message:
        "QA review found a sensitive question answered incorrectly on a submitted application.",
      meta: {
        qa_review_id: review.id,
        run_id: review.run_id,
        job_seeker_id: review.job_seeker_id,
        reviewer_id: user.id,
      },
      created_at: new Date().toISOString(),
    });
    // Also stamp the run's event trail so the AM sees it in the timeline.
    await supabaseAdmin.from("apply_run_events").insert({
      run_id: review.run_id,
      level: "ERROR",
      event_type: "QA_SENSITIVE_ANSWER_ERROR",
      actor: "qa",
      payload: { qa_review_id: review.id },
    });
  }

  return NextResponse.json({ success: true, review_id: review.id });
}
