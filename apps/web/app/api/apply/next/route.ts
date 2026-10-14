import {
  buildExecutionContract,
  getErrorCodeHint,
  getNextStep,
} from "@/lib/apply";
import {
  cancelDuplicateRun,
  findRecentDuplicateRun,
} from "@/lib/apply/duplicate-check";
import {
  GLOBAL_APPLY_KEY,
  atsPolicyKey,
  getDisabledPolicyKeys,
} from "@/lib/apply/kill-switch";
import { checkSeekerVelocity } from "@/lib/apply/velocity";
import { resolveJobTargetUrl } from "@/lib/job-url";
import { requireAMAccessToSeeker } from "@/lib/am-access";
import { getActorFromHeaders } from "@/lib/actor";
import { supabaseServer } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

type NextPayload = {
  run_id?: string;
  step?: string;
  success?: boolean;
  error_code?: string;
  error_message?: string;
  last_seen_url?: string;
  meta?: Record<string, unknown>;
};

export async function POST(request: Request) {
  let payload: NextPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.run_id || !payload.step || payload.success === undefined) {
    return Response.json(
      {
        success: false,
        error: "Missing required fields: run_id, step, success.",
      },
      { status: 400 }
    );
  }

  const { data: run, error: runError } = await supabaseServer
    .from("application_runs")
    .select(
      "id, queue_id, ats_type, status, current_step, step_attempts, total_attempts, max_step_retries"
    )
    .eq("id", payload.run_id)
    .single();

  if (runError || !run) {
    return Response.json(
      { success: false, error: "Application run not found." },
      { status: 404 }
    );
  }

  if (run.current_step !== payload.step) {
    return Response.json(
      {
        success: false,
        error: "Step does not match current step.",
        current_step: run.current_step,
      },
      { status: 409 }
    );
  }

  const nowIso = new Date().toISOString();
  const totalAttempts = (run.total_attempts ?? 0) + 1;

  await supabaseServer.from("application_step_events").insert({
    run_id: run.id,
    step: run.current_step,
    event_type: payload.success ? "STEP_DONE" : "STEP_FAILED",
    message: payload.success
      ? "Step completed."
      : payload.error_message ?? "Step failed.",
    meta: payload.meta ?? {},
  });

  const actor = getActorFromHeaders(request.headers);

  await supabaseServer.from("apply_run_events").insert({
    run_id: run.id,
    level: payload.success ? "INFO" : "WARN",
    event_type: payload.success ? "STEP_DONE" : "STEP_FAILED",
    actor,
    payload: {
      step: run.current_step,
      error_code: payload.error_code ?? null,
      message: payload.error_message ?? null,
      meta: payload.meta ?? {},
    },
  });

  if (!payload.success) {
    const stepAttempts = (run.step_attempts ?? 0) + 1;
    const shouldEscalate = stepAttempts > (run.max_step_retries ?? 2);

    if (shouldEscalate) {
      const errorCode = getErrorCodeHint(payload.error_code);

      await supabaseServer
        .from("application_runs")
        .update({
          status: "NEEDS_ATTENTION",
          needs_attention_reason: errorCode,
          step_attempts: stepAttempts,
          total_attempts: totalAttempts,
          last_error: payload.error_message ?? "Step failed.",
          last_error_code: errorCode,
          last_seen_url: payload.last_seen_url ?? null,
          updated_at: nowIso,
        })
        .eq("id", run.id);

      if (run.queue_id) {
        await supabaseServer
          .from("application_queue")
          .update({
            status: "NEEDS_ATTENTION",
            last_error: payload.error_message ?? "Step failed.",
            updated_at: nowIso,
          })
          .eq("id", run.queue_id);
      }

      await supabaseServer.from("application_step_events").insert({
        run_id: run.id,
        step: run.current_step,
        event_type: "NEEDS_ATTENTION",
        message: payload.error_message ?? "Step requires attention.",
        meta: { error_code: errorCode },
      });

      await supabaseServer.from("apply_run_events").insert({
        run_id: run.id,
        level: "WARN",
        event_type: "NEEDS_ATTENTION",
        actor,
        payload: {
          reason: errorCode,
          step: run.current_step,
          error_code: errorCode,
          message: payload.error_message ?? null,
        },
      });

      await supabaseServer.from("attention_items").insert({
        queue_id: run.queue_id,
        status: "OPEN",
        reason: errorCode,
      });

      return Response.json({
        success: true,
        status: "NEEDS_ATTENTION",
        reason: errorCode,
        next_action_hint: "Resolve manually and resume.",
      });
    }

    await supabaseServer
      .from("application_runs")
      .update({
        status: "RUNNING",
        step_attempts: stepAttempts,
        total_attempts: totalAttempts,
        last_error: payload.error_message ?? "Step failed.",
        last_error_code: payload.error_code ?? null,
        last_seen_url: payload.last_seen_url ?? null,
        updated_at: nowIso,
      })
      .eq("id", run.id);

    const contract = buildExecutionContract({
      runId: run.id,
      status: "RUNNING",
      atsType: run.ats_type,
      currentStep: run.current_step,
    });

    return Response.json({ success: true, ...contract });
  }

  const nextStep = getNextStep(run.ats_type, run.current_step);

  if (!nextStep) {
    await supabaseServer
      .from("application_runs")
      .update({
        status: "COMPLETED",
        step_attempts: 0,
        total_attempts: totalAttempts,
        last_error: null,
        last_error_code: null,
        last_seen_url: payload.last_seen_url ?? null,
        updated_at: nowIso,
      })
      .eq("id", run.id);

    if (run.queue_id) {
      await supabaseServer
        .from("application_queue")
        .update({ status: "COMPLETED", updated_at: nowIso })
        .eq("id", run.queue_id);
    }

    await supabaseServer.from("application_step_events").insert({
      run_id: run.id,
      step: run.current_step,
      event_type: "RUN_COMPLETED",
      message: "Run completed.",
    });

    await supabaseServer.from("apply_run_events").insert({
      run_id: run.id,
      level: "INFO",
      event_type: "RUN_COMPLETED",
      actor,
      payload: { step: run.current_step },
    });

    return Response.json({
      success: true,
      run_id: run.id,
      status: "COMPLETED",
    });
  }

  await supabaseServer
    .from("application_runs")
    .update({
      status: "RUNNING",
      current_step: nextStep,
      step_attempts: 0,
      total_attempts: totalAttempts,
      last_error: null,
      last_error_code: null,
      last_seen_url: payload.last_seen_url ?? null,
      updated_at: nowIso,
    })
    .eq("id", run.id);

  await supabaseServer.from("application_step_events").insert({
    run_id: run.id,
    step: nextStep,
    event_type: "STEP_STARTED",
    message: "Next step started.",
  });

  await supabaseServer.from("apply_run_events").insert({
    run_id: run.id,
    level: "INFO",
    event_type: "STEP_STARTED",
    actor,
    payload: { step: nextStep },
  });

  const contract = buildExecutionContract({
    runId: run.id,
    status: "RUNNING",
    atsType: run.ats_type,
    currentStep: nextStep,
  });

  return Response.json({ success: true, ...contract });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobSeekerId = searchParams.get("jobseekerId");
  const preferredRunId = searchParams.get("runId");

  if (!jobSeekerId) {
    return Response.json(
      { success: false, error: "Missing jobseekerId." },
      { status: 400 }
    );
  }

  const access = await requireAMAccessToSeeker(request.headers, jobSeekerId);
  if (!access.ok) return access.response;

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
  if (assignedIds.length === 0) {
    return Response.json({ success: true, status: "IDLE" });
  }

  const { data: runningRuns, error: runningError } = await supabaseServer
    .from("application_runs")
    .select("id")
    .in("job_seeker_id", assignedIds)
    .in("status", ["RUNNING", "RETRYING"]);

  if (runningError) {
    return Response.json(
      { success: false, error: "Failed to check concurrency." },
      { status: 500 }
    );
  }

  if ((runningRuns?.length ?? 0) >= 5) {
    return Response.json({
      success: false,
      blocked: true,
      reason: "MAX_CONCURRENCY",
      limit: 5,
    });
  }

  // Kill switches (mig 108): stop handing out runs the moment a switch is
  // flipped. Applies even to explicit resumes — a halt is a halt.
  const disabledPolicies = await getDisabledPolicyKeys();
  if (disabledPolicies.has(GLOBAL_APPLY_KEY)) {
    return Response.json({
      success: false,
      blocked: true,
      reason: "AUTOMATION_HALTED",
      policy_key: GLOBAL_APPLY_KEY,
    });
  }

  // Per-seeker velocity policy (daily cap / pacing / quiet hours, mig 104).
  // Only on the automatic path: an AM explicitly requesting a specific run
  // (preferredRunId, e.g. resuming a paused application) is a deliberate
  // human action and bypasses the throttle.
  if (!preferredRunId) {
    const velocity = await checkSeekerVelocity(jobSeekerId);
    if (!velocity.allowed) {
      return Response.json({
        success: false,
        blocked: true,
        reason: velocity.reason,
        ...(velocity.retryAfterMs
          ? { retry_after_seconds: Math.ceil(velocity.retryAfterMs / 1000) }
          : {}),
      });
    }
  }

  let nextRunQuery = supabaseServer
    .from("application_runs")
    .select(
      "id, queue_id, job_post_id, ats_type, status, current_step, attempt_count, max_retries, resume_url_used, resume_source"
    )
    .eq("job_seeker_id", jobSeekerId)
    .in("status", ["READY", "RETRYING"])
    .is("locked_at", null)
    .limit(1);

  if (preferredRunId) {
    nextRunQuery = nextRunQuery.eq("id", preferredRunId);
  } else {
    nextRunQuery = nextRunQuery.order("updated_at", { ascending: true });
  }

  const { data: nextRun, error: nextRunError } = await nextRunQuery.maybeSingle();

  if (nextRunError) {
    return Response.json(
      { success: false, error: "Failed to load next run." },
      { status: 500 }
    );
  }

  if (!nextRun) {
    if (preferredRunId) {
      return Response.json(
        { success: false, error: "Requested run is not ready." },
        { status: 409 }
      );
    }
    return Response.json({ success: true, status: "IDLE" });
  }

  // ATS-level kill switch: refuse before locking so the run stays claimable
  // by nothing until the switch is re-enabled.
  if (disabledPolicies.has(atsPolicyKey(nextRun.ats_type))) {
    return Response.json({
      success: false,
      blocked: true,
      reason: "ATS_HALTED",
      policy_key: atsPolicyKey(nextRun.ats_type),
    });
  }

  const nowIso = new Date().toISOString();
  const claimToken = randomUUID();
  const actor = getActorFromHeaders(request.headers);
  const lockedBy = `${actor}:${access.amEmail}`;

  const { data: lockedRun, error: lockError } = await supabaseServer
    .from("application_runs")
    .update({
      status: "RUNNING",
      locked_at: nowIso,
      locked_by: lockedBy,
      claim_token: claimToken,
      updated_at: nowIso,
    })
    .eq("id", nextRun.id)
    .is("locked_at", null)
    .in("status", ["READY", "RETRYING"])
    .select("id, queue_id, ats_type, current_step, attempt_count, max_retries, job_post_id, resume_url_used, resume_source")
    .single();

  if (lockError || !lockedRun) {
    return Response.json({ success: true, status: "IDLE" });
  }

  // Fuzzy duplicate gate (reposted job under a new job_post_id). Cancel the
  // run and tell the poller why; the next poll simply claims the next run.
  // Skipped for explicit preferredRunId requests — an AM resuming a specific
  // run has already made the call.
  if (!preferredRunId) {
    const duplicate = await findRecentDuplicateRun(
      jobSeekerId,
      lockedRun.job_post_id as string
    );
    if (duplicate) {
      await cancelDuplicateRun(
        { id: lockedRun.id, queue_id: lockedRun.queue_id },
        duplicate,
        actor
      );
      return Response.json({
        success: false,
        blocked: true,
        reason: "DUPLICATE_APPLICATION",
        duplicate_run_id: duplicate.duplicate_run_id,
      });
    }
  }

  if (lockedRun.queue_id) {
    await supabaseServer
      .from("application_queue")
      .update({ status: "RUNNING", updated_at: nowIso })
      .eq("id", lockedRun.queue_id);
  }

  await supabaseServer.from("apply_run_events").insert({
    run_id: lockedRun.id,
    level: "INFO",
    event_type: "RUNNING",
    actor,
    payload: { step: lockedRun.current_step },
  });

  const [{ data: jobSeeker }, { data: jobPost }, { data: tailoredResume }] = await Promise.all([
    supabaseServer
      .from("job_seekers")
      .select(
        "resume_url, full_name, email, phone, location, linkedin_url, portfolio_url, address_line1, address_city, address_state, address_zip, address_country"
      )
      .eq("id", jobSeekerId)
      .maybeSingle(),
    supabaseServer
      .from("job_posts")
      .select("id, url, title, company, source")
      .eq("id", lockedRun.job_post_id)
      .single(),
    supabaseServer
      .from("tailored_resumes")
      .select("tailored_text, resume_url")
      .eq("job_seeker_id", jobSeekerId)
      .eq("job_post_id", lockedRun.job_post_id)
      .maybeSingle(),
  ]);

  if (!jobPost?.id) {
    return Response.json(
      { success: false, error: "Job post not found." },
      { status: 404 }
    );
  }

  const tailoredResumeUrl = tailoredResume?.resume_url ?? null;
  const resumeUrl = tailoredResumeUrl ?? jobSeeker?.resume_url ?? null;
  const resumeSource = tailoredResumeUrl ? "TAILORED" : resumeUrl ? "BASE" : null;
  const jobUrl = resolveJobTargetUrl(jobPost.url ?? "") || jobPost.url;

  if (resumeUrl && !lockedRun.resume_url_used) {
    await supabaseServer
      .from("application_runs")
      .update({
        resume_url_used: resumeUrl,
        resume_source: resumeSource,
        updated_at: nowIso,
      })
      .eq("id", lockedRun.id)
      .is("resume_url_used", null);
  }

  return Response.json({
    success: true,
    run_id: lockedRun.id,
    claim_token: claimToken,
    status: "RUNNING",
    ats_type: lockedRun.ats_type,
    current_step: lockedRun.current_step,
    job_seeker_id: jobSeekerId,
    attempts: {
      attempt_count: lockedRun.attempt_count ?? 0,
      max_retries: lockedRun.max_retries ?? 2,
    },
    resume: {
      url: resumeUrl,
      tailored_url: tailoredResumeUrl,
      tailored_text: tailoredResume?.tailored_text ?? null,
    },
    profile: jobSeeker
      ? {
          full_name: jobSeeker.full_name ?? null,
          email: jobSeeker.email ?? null,
          phone: jobSeeker.phone ?? null,
          location: jobSeeker.location ?? null,
          linkedin_url: jobSeeker.linkedin_url ?? null,
          portfolio_url: jobSeeker.portfolio_url ?? null,
          address_line1: jobSeeker.address_line1 ?? null,
          address_city: jobSeeker.address_city ?? null,
          address_state: jobSeeker.address_state ?? null,
          address_zip: jobSeeker.address_zip ?? null,
          address_country: jobSeeker.address_country ?? null,
        }
      : null,
    job: {
      id: jobPost.id,
      url: jobUrl,
      source_url: jobPost.url,
      title: jobPost.title,
      company: jobPost.company,
      source: jobPost.source,
    },
  });
}
