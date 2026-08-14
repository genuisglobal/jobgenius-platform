import { NextResponse } from "next/server";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";

// GET /api/admin/qa — the QA reviewer's queue + quality metrics.
// Pending sampled runs are returned with everything needed to grade them in
// place: job, seeker profile (the "expected" side), proof screenshots (the
// "actual" side), and the sampling reason.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am" || !isAdminRole(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: pending } = await supabaseAdmin
    .from("qa_reviews")
    .select("id, run_id, job_seeker_id, sampled_reason, created_at")
    .eq("status", "PENDING")
    .order("created_at", { ascending: true })
    .limit(25);

  const runIds = (pending ?? []).map((r) => r.run_id as string);
  const seekerIds = Array.from(
    new Set((pending ?? []).map((r) => r.job_seeker_id as string))
  );

  const [{ data: runs }, { data: seekers }, { data: screenshots }] =
    await Promise.all([
      runIds.length
        ? supabaseAdmin
            .from("application_runs")
            .select(
              "id, job_post_id, ats_type, resume_source, locked_by, updated_at"
            )
            .in("id", runIds)
        : Promise.resolve({ data: [] as never[] }),
      seekerIds.length
        ? supabaseAdmin
            .from("job_seekers")
            .select("id, full_name, email, phone, location, address_city, address_state")
            .in("id", seekerIds)
        : Promise.resolve({ data: [] as never[] }),
      runIds.length
        ? supabaseAdmin
            .from("apply_run_screenshots")
            .select("run_id, screenshot_path, reason, step, created_at")
            .in("run_id", runIds)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] as never[] }),
    ]);

  const jobPostIds = Array.from(
    new Set((runs ?? []).map((r) => r.job_post_id as string).filter(Boolean))
  );
  const { data: jobPosts } = jobPostIds.length
    ? await supabaseAdmin
        .from("job_posts")
        .select("id, title, company")
        .in("id", jobPostIds)
    : { data: [] as never[] };

  const runById = new Map((runs ?? []).map((r) => [r.id as string, r]));
  const seekerById = new Map((seekers ?? []).map((s) => [s.id as string, s]));
  const postById = new Map((jobPosts ?? []).map((p) => [p.id as string, p]));
  const shotsByRun = new Map<string, unknown[]>();
  for (const shot of screenshots ?? []) {
    const list = shotsByRun.get(shot.run_id as string) ?? [];
    list.push(shot);
    shotsByRun.set(shot.run_id as string, list);
  }

  const queue = (pending ?? []).map((review) => {
    const run = runById.get(review.run_id as string);
    const post = run ? postById.get(run.job_post_id as string) : null;
    return {
      id: review.id,
      run_id: review.run_id,
      sampled_reason: review.sampled_reason,
      sampled_at: review.created_at,
      run: run
        ? {
            ats_type: run.ats_type,
            resume_source: run.resume_source,
            channel: String(run.locked_by ?? "").split(":")[0] || "unknown",
            completed_at: run.updated_at,
          }
        : null,
      job: post ? { title: post.title, company: post.company } : null,
      seeker: seekerById.get(review.job_seeker_id as string) ?? null,
      screenshots: shotsByRun.get(review.run_id as string) ?? [],
    };
  });

  // ── Metrics (30 days) ──
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const since7 = new Date(Date.now() - 7 * 86400000).toISOString();

  const [{ data: reviewed }, { data: recentRuns }] = await Promise.all([
    supabaseAdmin
      .from("qa_reviews")
      .select("verdict, field_accuracy_score, sensitive_answer_error, reviewed_at")
      .eq("status", "REVIEWED")
      .gte("reviewed_at", since30),
    supabaseAdmin
      .from("application_runs")
      .select("id")
      .eq("status", "COMPLETED")
      .gte("updated_at", since30)
      .limit(500),
  ]);

  const completedIds = (recentRuns ?? []).map((r) => r.id as string);
  let withProof = 0;
  if (completedIds.length > 0) {
    const { data: proofRows } = await supabaseAdmin
      .from("apply_run_screenshots")
      .select("run_id")
      .in("run_id", completedIds);
    withProof = new Set((proofRows ?? []).map((r) => r.run_id as string)).size;
  }

  const reviewedRows = reviewed ?? [];
  const accuracyScores = reviewedRows
    .map((r) => r.field_accuracy_score as number | null)
    .filter((n): n is number => typeof n === "number");

  const metrics = {
    pending_count: (pending ?? []).length,
    reviewed_30d: reviewedRows.length,
    pass_rate_30d: reviewedRows.length
      ? Math.round(
          (reviewedRows.filter((r) => r.verdict === "PASS").length /
            reviewedRows.length) *
            100
        )
      : null,
    avg_accuracy_30d: accuracyScores.length
      ? Math.round(accuracyScores.reduce((a, b) => a + b, 0) / accuracyScores.length)
      : null,
    sensitive_errors_30d: reviewedRows.filter((r) => r.sensitive_answer_error).length,
    sensitive_errors_7d: reviewedRows.filter(
      (r) => r.sensitive_answer_error && String(r.reviewed_at) >= since7
    ).length,
    screenshot_presence_30d: completedIds.length
      ? Math.round((withProof / completedIds.length) * 100)
      : null,
    completed_runs_30d: completedIds.length,
  };

  return NextResponse.json({ queue, metrics });
}
