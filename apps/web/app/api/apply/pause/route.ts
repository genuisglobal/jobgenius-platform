import { requireAMAccessToSeeker } from "@/lib/am-access";
import { getActorFromHeaders } from "@/lib/actor";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/auth";
import { sendNotification, NOTIFICATION_CATEGORIES } from "@/lib/notify";
import { transitionRun } from "@/lib/runState";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { findLatestPendingTrialForRun, recordOutcome } from "@/lib/bandit";

type PausePayload = {
  run_id?: string;
  claim_token?: string;
  reason?: string;
  error_code?: string;
  message?: string;
  last_seen_url?: string;
  step?: string;
  dom_hint?: string;
  meta?: Record<string, unknown>;
};

function requiresClaimToken(headers: Headers) {
  const runner = (headers.get("x-runner") ?? "").toLowerCase();
  return runner === "extension" || runner === "cloud";
}

export async function POST(request: Request) {
  let payload: PausePayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.run_id) {
    return Response.json(
      { success: false, error: "Missing run_id." },
      { status: 400 }
    );
  }

  const { data: run, error: runError } = await supabaseServer
    .from("application_runs")
    .select("id, queue_id, current_step, job_seeker_id, ats_type, claim_token, status")
    .eq("id", payload.run_id)
    .single();

  if (runError || !run) {
    return Response.json(
      { success: false, error: "Run not found." },
      { status: 404 }
    );
  }

  const access = await requireAMAccessToSeeker(request.headers, run.job_seeker_id);
  if (!access.ok) return access.response;

  if (requiresClaimToken(request.headers)) {
    if (!payload.claim_token) {
      return Response.json(
        { success: false, error: "Missing claim_token." },
        { status: 400 }
      );
    }
    if (!run.claim_token || run.claim_token !== payload.claim_token) {
      return Response.json(
        { success: false, error: "Claim token mismatch." },
        { status: 409 }
      );
    }
  }

  const transition = transitionRun(run.status, "PAUSE");
  if (!transition.ok) {
    return Response.json(
      { success: false, error: transition.reason, current_status: run.status },
      { status: 409 }
    );
  }

  const nowIso = new Date().toISOString();
  const reason = payload.reason ?? payload.error_code ?? "UNKNOWN";

  const { error: stepError } = await supabaseServer.from("application_step_events").insert({
    run_id: run.id,
    step: run.current_step,
    event_type: "NEEDS_ATTENTION",
    message: payload.message ?? "Needs attention.",
    meta: { reason, ...(payload.meta ?? {}) },
  });

  if (stepError) {
    console.error("[apply:pause] failed to insert step event:", stepError);
  }

  if (run.queue_id) {
    const { error: queueError } = await supabaseServer
      .from("application_queue")
      .update({
        status: "NEEDS_ATTENTION",
        category: "needs_attention",
        last_error: payload.message ?? "Needs attention.",
        updated_at: nowIso,
      })
      .eq("id", run.queue_id);

    if (queueError) {
      console.error("[apply:pause] failed to update queue status:", queueError);
    }
  }

  const { error } = await supabaseServer
    .from("application_runs")
    .update({
      status: transition.to,
      needs_attention_reason: reason,
      last_error: payload.message ?? "Needs attention.",
      last_error_code: payload.error_code ?? reason,
      last_seen_url: payload.last_seen_url ?? null,
      locked_at: null,
      locked_by: null,
      claim_token: null,
      updated_at: nowIso,
    })
    .eq("id", run.id)
    .eq("status", transition.from); // race guard

  if (error) {
    return Response.json(
      { success: false, error: "Failed to pause run." },
      { status: 500 }
    );
  }

  const { error: eventError } = await supabaseServer.from("apply_run_events").insert({
    run_id: run.id,
    level: "WARN",
    event_type: "NEEDS_ATTENTION",
    actor: getActorFromHeaders(request.headers),
    payload: {
      reason,
      step: payload.step ?? run.current_step,
      message: payload.message ?? null,
      last_seen_url: payload.last_seen_url ?? null,
      dom_hint: payload.dom_hint ?? null,
      ...(payload.meta ?? {}),
    },
  });

  if (eventError) {
    console.error("[apply:pause] failed to insert run event:", eventError);
  }

  let urlHost: string | null = null;
  if (payload.last_seen_url) {
    try {
      urlHost = new URL(payload.last_seen_url).hostname;
    } catch {
      urlHost = null;
    }
  }

  const { error: sigError } = await supabaseServer.from("apply_error_signatures").insert({
    ats_type: run.ats_type ?? null,
    url_host: urlHost,
    step: payload.step ?? run.current_step,
    error_code: payload.error_code ?? reason,
    dom_hint: payload.dom_hint ?? null,
    message: payload.message ?? null,
  });

  if (sigError) {
    console.error("[apply:pause] failed to insert error signature:", sigError);
  }

  // Notify the assigned AM that a run needs attention (best-effort, non-blocking).
  void notifyAmOfPause({
    runId: run.id,
    jobSeekerId: run.job_seeker_id,
    atsType: run.ats_type,
    reason,
    message: payload.message ?? null,
    lastSeenUrl: payload.last_seen_url ?? null,
  });

  // Enqueue Vision-LLM failure diagnosis (PR-P). Paused runs usually have
  // the most useful screenshots (captcha, OTP, missing field, …).
  enqueueBackgroundJob("DIAGNOSE_FAILURE", { run_id: run.id }).catch((err) =>
    console.error("[apply:pause] enqueue DIAGNOSE_FAILURE failed:", err)
  );

  // Close the bandit loop with a partial outcome (neither full success nor
  // terminal failure). A subsequent retry might still succeed.
  findLatestPendingTrialForRun(run.id, "retry:")
    .then((trial) => trial && recordOutcome({ trialId: trial.trialId, outcome: "partial" }))
    .catch((err) => console.error("[apply:pause] bandit outcome failed:", err));

  return Response.json({ success: true, run_id: run.id, status: "NEEDS_ATTENTION", reason });
}

async function notifyAmOfPause(args: {
  runId: string;
  jobSeekerId: string;
  atsType: string | null;
  reason: string;
  message: string | null;
  lastSeenUrl: string | null;
}): Promise<void> {
  const { data: assignment } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("account_manager_id")
    .eq("job_seeker_id", args.jobSeekerId)
    .maybeSingle();
  if (!assignment?.account_manager_id) return;

  const { data: seeker } = await supabaseAdmin
    .from("job_seekers")
    .select("full_name")
    .eq("id", args.jobSeekerId)
    .maybeSingle();

  const seekerName = seeker?.full_name ?? "a seeker";
  const subject = `Application paused (${args.reason})`;
  const body = `${seekerName}'s application on ${args.atsType ?? "an ATS"} hit ${args.reason}. ${
    args.message ?? "It needs your attention."
  }`;

  await sendNotification({
    userId: assignment.account_manager_id,
    userType: "am",
    category: NOTIFICATION_CATEGORIES.application_paused,
    subject,
    body,
    linkUrl: `/dashboard/attention?run=${args.runId}`,
    channel: "both",
    payload: {
      run_id: args.runId,
      job_seeker_id: args.jobSeekerId,
      ats_type: args.atsType,
      reason: args.reason,
      last_seen_url: args.lastSeenUrl,
    },
  });
}
