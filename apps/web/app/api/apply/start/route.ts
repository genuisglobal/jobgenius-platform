import { detectAtsType, getInitialStep } from "@/lib/apply";
import { findRecentDuplicateRun } from "@/lib/apply/duplicate-check";
import { checkAutomationHalt } from "@/lib/apply/kill-switch";
import { getActorFromHeaders } from "@/lib/actor";
import { requireAMAccessToSeeker } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";
import { isActiveClient } from "@/lib/intake";

type StartPayload = {
  queue_id?: string;
  max_retries?: number;
};

const MAX_CONCURRENCY = 5;

export async function POST(request: Request) {
  let payload: StartPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.queue_id) {
    return Response.json(
      { success: false, error: "Missing queue_id." },
      { status: 400 }
    );
  }

  const { data: queueItem, error: queueError } = await supabaseServer
    .from("application_queue")
    .select("id, job_seeker_id, job_post_id, status")
    .eq("id", payload.queue_id)
    .single();

  if (queueError || !queueItem) {
    return Response.json(
      { success: false, error: "Queue item not found." },
      { status: 404 }
    );
  }

  const access = await requireAMAccessToSeeker(request.headers, queueItem.job_seeker_id);
  if (!access.ok) return access.response;

  if (!(await isActiveClient(queueItem.job_seeker_id))) {
    return Response.json(
      {
        success: false,
        error: "Live applications are only allowed for active clients.",
      },
      { status: 409 }
    );
  }

  const { data: existingRun, error: existingError } = await supabaseServer
    .from("application_runs")
    .select("id, status, ats_type, current_step")
    .eq("queue_id", queueItem.id)
    .maybeSingle();

  if (existingError) {
    return Response.json(
      { success: false, error: "Failed to load application run." },
      { status: 500 }
    );
  }

  if (!existingRun) {
    const { data: assignments, error: assignmentsError } = await supabaseServer
      .from("job_seeker_assignments")
      .select("job_seeker_id")
      .eq("account_manager_id", access.amId);

    if (assignmentsError) {
      return Response.json(
        { success: false, error: "Failed to load job seeker assignments." },
        { status: 500 }
      );
    }

    const assignedIds = (assignments ?? []).map((row) => row.job_seeker_id);

    const { data: runningCountRows, error: runningCountError } =
      await supabaseServer
        .from("application_runs")
        .select("id")
        .in("job_seeker_id", assignedIds)
        .in("status", ["RUNNING", "RETRYING"]);

    if (runningCountError) {
      return Response.json(
        { success: false, error: "Failed to check concurrency." },
        { status: 500 }
      );
    }

    const runningCount = runningCountRows?.length ?? 0;
    if (runningCount >= MAX_CONCURRENCY) {
      return Response.json({
        success: false,
        blocked: true,
        reason: "MAX_CONCURRENCY",
        limit: MAX_CONCURRENCY,
      });
    }
  }

  if (existingRun) {
    // Never re-drive an apply for a run that already reached a terminal
    // applied state — surface it so callers skip launching the runner.
    const alreadyApplied = ["APPLIED", "COMPLETED", "SUBMITTED"].includes(
      String(existingRun.status ?? "").toUpperCase()
    );
    return Response.json({
      success: true,
      run_id: existingRun.id,
      status: existingRun.status,
      ats_type: existingRun.ats_type,
      current_step: existingRun.current_step,
      already_applied: alreadyApplied,
    });
  }

  const { data: jobPost, error: jobPostError } = await supabaseServer
    .from("job_posts")
    .select("id, source, url")
    .eq("id", queueItem.job_post_id)
    .single();

  if (jobPostError || !jobPost) {
    return Response.json(
      { success: false, error: "Job post not found." },
      { status: 404 }
    );
  }

  // Fuzzy duplicate gate: the seeker may already have applied to this same
  // opening under a different job_post_id (repost / cross-source dupe). The
  // queue-item existingRun check above only catches the exact same item.
  const duplicate = await findRecentDuplicateRun(
    queueItem.job_seeker_id,
    queueItem.job_post_id
  );
  if (duplicate) {
    return Response.json({
      success: false,
      blocked: true,
      reason: "DUPLICATE_APPLICATION",
      duplicate_run_id: duplicate.duplicate_run_id,
      duplicate_status: duplicate.duplicate_status,
      duplicate_job: { company: duplicate.company, title: duplicate.title },
    });
  }

  const atsType = detectAtsType(jobPost.source, jobPost.url);

  // Kill switches (mig 108): refuse new run creation while halted.
  const halt = await checkAutomationHalt(atsType);
  if (halt.halted) {
    return Response.json({
      success: false,
      blocked: true,
      reason: halt.reason,
      policy_key: halt.key,
    });
  }

  const initialStep = getInitialStep(atsType);
  const nowIso = new Date().toISOString();

  const { data: createdRun, error: createError } = await supabaseServer
    .from("application_runs")
    .insert({
      queue_id: queueItem.id,
      job_seeker_id: queueItem.job_seeker_id,
      job_post_id: queueItem.job_post_id,
      ats_type: atsType,
      status: "READY",
      current_step: initialStep,
      max_retries:
        typeof payload.max_retries === "number" ? payload.max_retries : undefined,
      updated_at: nowIso,
    })
    .select("id, status, ats_type, current_step")
    .single();

  if (createError || !createdRun) {
    return Response.json(
      { success: false, error: "Failed to create application run." },
      { status: 500 }
    );
  }

  const { error: queueUpdateError } = await supabaseServer
    .from("application_queue")
    .update({ status: "READY", category: "in_progress", updated_at: nowIso })
    .eq("id", queueItem.id);

  if (queueUpdateError) {
    console.error("[apply:start] failed to update queue status:", queueUpdateError);
  }

  const { error: stepError } = await supabaseServer.from("application_step_events").insert({
    run_id: createdRun.id,
    step: initialStep,
    event_type: "READY",
    message: "Run ready for execution.",
  });

  if (stepError) {
    console.error("[apply:start] failed to insert step event:", stepError);
  }

  const { error: runEventError } = await supabaseServer.from("apply_run_events").insert({
    run_id: createdRun.id,
    level: "INFO",
    event_type: "READY",
    actor: getActorFromHeaders(request.headers),
    payload: { step: initialStep },
  });

  if (runEventError) {
    console.error("[apply:start] failed to insert run event:", runEventError);
  }

  return Response.json({
    success: true,
    run_id: createdRun.id,
    status: createdRun.status,
    ats_type: createdRun.ats_type,
    current_step: createdRun.current_step,
  });
}
