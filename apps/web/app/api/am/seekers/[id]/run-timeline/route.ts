import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";

interface RouteContext {
  params: { id: string };
}

/**
 * Application run timeline: step-by-step execution log for a specific run.
 * GET ?run_id=...
 */
export async function GET(request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const seekerId = params.id;

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

  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("run_id");

  if (!runId) {
    return NextResponse.json({ error: "run_id required" }, { status: 400 });
  }

  // Verify run belongs to this seeker
  const { data: run } = await supabaseAdmin
    .from("application_runs")
    .select("id, status, ats_type, current_step, last_error, last_error_code, attempt_count, retry_strategy, retry_changes, created_at, updated_at, job_posts(title, company)")
    .eq("id", runId)
    .eq("job_seeker_id", seekerId)
    .single();

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // Get step events
  const { data: stepEvents } = await supabaseAdmin
    .from("application_step_events")
    .select("id, step, event_type, message, meta, created_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  // Get run events
  const { data: runEvents } = await supabaseAdmin
    .from("apply_run_events")
    .select("id, event_type, level, actor, payload, created_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  // Get screenshots for this run
  const { data: screenshots } = await supabaseAdmin
    .from("apply_run_screenshots")
    .select("id, step, reason, url, screenshot_path, created_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  // Get retry strategies
  const { data: retries } = await supabaseAdmin
    .from("retry_strategies")
    .select("id, attempt_number, strategy, changes_applied, outcome, created_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    run,
    step_events: stepEvents ?? [],
    run_events: runEvents ?? [],
    screenshots: screenshots ?? [],
    retries: retries ?? [],
  });
}
