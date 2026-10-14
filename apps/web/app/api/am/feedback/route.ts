import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { recordFeedback, analyzeRejectionPatterns, applyWeightAdjustment } from "@/lib/feedback-loop";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const {
    job_seeker_id, job_post_id, run_id, interview_id,
    feedback_type, rejection_reason, rejection_category,
    ats_type, company, role_title, notes,
  } = body;

  if (!job_seeker_id || !feedback_type) {
    return NextResponse.json(
      { error: "job_seeker_id and feedback_type are required" },
      { status: 400 }
    );
  }

  // Verify access
  if (!isAdminRole(user.role)) {
    const { data: assignment } = await supabaseAdmin
      .from("job_seeker_assignments")
      .select("id")
      .eq("account_manager_id", user.id)
      .eq("job_seeker_id", job_seeker_id)
      .maybeSingle();
    if (!assignment) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const feedback = await recordFeedback({
      jobSeekerId: job_seeker_id,
      jobPostId: job_post_id,
      runId: run_id,
      interviewId: interview_id,
      feedbackType: feedback_type,
      rejectionReason: rejection_reason,
      rejectionCategory: rejection_category,
      source: "am_recorded",
      atsType: ats_type,
      company,
      roleTitle: role_title,
      notes,
      createdBy: user.id,
    });

    return NextResponse.json({ feedback });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to record feedback" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const seekerId = searchParams.get("job_seeker_id");
  const action = searchParams.get("action");

  if (!seekerId) {
    return NextResponse.json({ error: "job_seeker_id required" }, { status: 400 });
  }

  // Verify access
  if (!isAdminRole(user.role)) {
    const { data: assignment } = await supabaseAdmin
      .from("job_seeker_assignments")
      .select("id")
      .eq("account_manager_id", user.id)
      .eq("job_seeker_id", seekerId)
      .maybeSingle();
    if (!assignment) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (action === "analyze") {
    const analysis = await analyzeRejectionPatterns(seekerId);
    return NextResponse.json(analysis);
  }

  // Default: list feedback
  const { data: feedback } = await supabaseAdmin
    .from("application_feedback")
    .select("*")
    .eq("job_seeker_id", seekerId)
    .order("created_at", { ascending: false })
    .limit(100);

  return NextResponse.json({ feedback: feedback ?? [] });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { job_seeker_id, action } = body;

  if (!job_seeker_id) {
    return NextResponse.json({ error: "job_seeker_id required" }, { status: 400 });
  }

  if (action === "apply_weight_adjustment") {
    const result = await applyWeightAdjustment(
      job_seeker_id,
      "rejection_feedback",
      "Applied based on rejection pattern analysis"
    );
    if (!result) {
      return NextResponse.json({ error: "Not enough feedback data" }, { status: 400 });
    }
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
