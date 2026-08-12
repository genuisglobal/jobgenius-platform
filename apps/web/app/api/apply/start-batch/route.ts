import { detectAtsType, getInitialStep } from "@/lib/apply";
import { getActorFromHeaders } from "@/lib/actor";
import { getAccountManagerFromRequest, isRunnerAccountManager } from "@/lib/am-access";
import { isActiveClient } from "@/lib/intake";
import { supabaseServer } from "@/lib/supabase/server";

type StartBatchPayload = {
  queue_ids?: string[];
  all_ready?: boolean;
};

const MAX_CONCURRENCY = 5;

function isAdminRole(role: string | null | undefined) {
  return role === "admin" || role === "superadmin";
}

export async function POST(request: Request) {
  let payload: StartBatchPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.queue_ids?.length && !payload?.all_ready) {
    return Response.json(
      { success: false, error: "Provide queue_ids or set all_ready: true." },
      { status: 400 }
    );
  }

  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json(
      { success: false, error: amResult.error },
      { status: 401 }
    );
  }

  const amId = amResult.accountManager.id;
  const isRunner = await isRunnerAccountManager(amId);
  const { data: amRecord } = await supabaseServer
    .from("account_managers")
    .select("role")
    .eq("id", amId)
    .maybeSingle();
  const canAccessAll = isRunner || isAdminRole(amRecord?.role);

  let assignedIds: string[] = [];
  if (!canAccessAll) {
    const { data: assignments, error: assignmentsError } = await supabaseServer
      .from("job_seeker_assignments")
      .select("job_seeker_id")
      .eq("account_manager_id", amId);

    if (assignmentsError) {
      return Response.json(
        { success: false, error: "Failed to load job seeker assignments." },
        { status: 500 }
      );
    }

    assignedIds = (assignments ?? []).map((row) => row.job_seeker_id);

    if (assignedIds.length === 0) {
      return Response.json({
        success: true,
        started: 0,
        blocked: 0,
        failed: 0,
        errors: [],
      });
    }
  }

  // Fetch queue items
  let queueItems: { id: string; job_seeker_id: string; job_post_id: string; status: string }[] = [];

  if (payload.all_ready) {
    let queueQuery = supabaseServer
      .from("application_queue")
      .select("id, job_seeker_id, job_post_id, status")
      .eq("status", "QUEUED");
    if (!canAccessAll) {
      queueQuery = queueQuery.in("job_seeker_id", assignedIds);
    }

    const { data, error } = await queueQuery;

    if (error) {
      return Response.json(
        { success: false, error: "Failed to fetch queued items." },
        { status: 500 }
      );
    }
    queueItems = data ?? [];
  } else if (payload.queue_ids?.length) {
    const { data, error } = await supabaseServer
      .from("application_queue")
      .select("id, job_seeker_id, job_post_id, status")
      .in("id", payload.queue_ids);

    if (error) {
      return Response.json(
        { success: false, error: "Failed to fetch queue items." },
        { status: 500 }
      );
    }
    queueItems = canAccessAll
      ? data ?? []
      : (data ?? []).filter((q) => assignedIds.includes(q.job_seeker_id));
  }

  if (queueItems.length === 0) {
    return Response.json({
      success: true,
      started: 0,
      blocked: 0,
      failed: 0,
      errors: [],
    });
  }

  // Check current running count across reachable seekers
  let runningQuery = supabaseServer
    .from("application_runs")
    .select("id")
    .in("status", ["RUNNING", "RETRYING"]);
  if (!canAccessAll) {
    runningQuery = runningQuery.in("job_seeker_id", assignedIds);
  }
  const { data: runningCountRows, error: runningCountError } = await runningQuery;

  if (runningCountError) {
    return Response.json(
      { success: false, error: "Failed to check concurrency." },
      { status: 500 }
    );
  }

  let currentRunning = runningCountRows?.length ?? 0;
  const actor = getActorFromHeaders(request.headers);
  const nowIso = new Date().toISOString();

  let started = 0;
  let blocked = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const item of queueItems) {
    if (!(await isActiveClient(item.job_seeker_id))) {
      blocked++;
      continue;
    }

    if (item.status !== "QUEUED") {
      continue;
    }

    if (currentRunning >= MAX_CONCURRENCY) {
      blocked += queueItems.length - started - failed;
      break;
    }

    // Check if a run already exists for this queue item
    const { data: existingRun } = await supabaseServer
      .from("application_runs")
      .select("id")
      .eq("queue_id", item.id)
      .maybeSingle();

    if (existingRun) {
      continue;
    }

    // Fetch job post for ATS detection
    const { data: jobPost, error: jobPostError } = await supabaseServer
      .from("job_posts")
      .select("id, source, url")
      .eq("id", item.job_post_id)
      .single();

    if (jobPostError || !jobPost) {
      failed++;
      errors.push(`Job post not found for queue item ${item.id}.`);
      continue;
    }

    const atsType = detectAtsType(jobPost.source, jobPost.url);
    const initialStep = getInitialStep(atsType);

    const { data: createdRun, error: createError } = await supabaseServer
      .from("application_runs")
      .insert({
        queue_id: item.id,
        job_seeker_id: item.job_seeker_id,
        job_post_id: item.job_post_id,
        ats_type: atsType,
        status: "READY",
        current_step: initialStep,
        updated_at: nowIso,
      })
      .select("id, status, ats_type, current_step")
      .single();

    if (createError || !createdRun) {
      failed++;
      errors.push(`Failed to create run for queue item ${item.id}.`);
      continue;
    }

    const { error: queueUpdateErr } = await supabaseServer
      .from("application_queue")
      .update({ status: "READY", category: "in_progress", updated_at: nowIso })
      .eq("id", item.id);

    if (queueUpdateErr) {
      console.error("[apply:start-batch] failed to update queue status:", queueUpdateErr);
    }

    const { error: stepErr } = await supabaseServer.from("application_step_events").insert({
      run_id: createdRun.id,
      step: initialStep,
      event_type: "READY",
      message: "Run ready for execution (batch start).",
    });

    if (stepErr) {
      console.error("[apply:start-batch] failed to insert step event:", stepErr);
    }

    const { error: runEventErr } = await supabaseServer.from("apply_run_events").insert({
      run_id: createdRun.id,
      level: "INFO",
      event_type: "READY",
      actor,
      payload: { step: initialStep, batch: true },
    });

    if (runEventErr) {
      console.error("[apply:start-batch] failed to insert run event:", runEventErr);
    }

    started++;
    currentRunning++;
  }

  return Response.json({
    success: true,
    started,
    blocked,
    failed,
    errors,
  });
}
