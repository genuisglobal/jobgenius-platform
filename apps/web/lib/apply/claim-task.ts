import { randomUUID } from "crypto";
import { getActorFromHeaders } from "@/lib/actor";
import { supabaseAdmin } from "@/lib/auth";
import {
  cancelDuplicateRun,
  findRecentDuplicateRun,
} from "@/lib/apply/duplicate-check";
import {
  GLOBAL_APPLY_KEY,
  atsPolicyKey,
  getDisabledPolicyKeys,
} from "@/lib/apply/kill-switch";
import { evaluateVelocityForSeekers } from "@/lib/apply/velocity";
import { resolveJobTargetUrl } from "@/lib/job-url";
import { supabaseServer } from "@/lib/supabase/server";

// ============================================================
// Shared apply-claim logic used by both the modern POST
// /api/apply/tasks/claim and the legacy GET /api/apply/next-global.
// ============================================================

export type ClaimContext = {
  request: Request;
  accountManagerId: string;
  accountManagerEmail: string;
  isRunner: boolean;
  /** Optional runner id from the modern POST body, kept for telemetry. */
  runnerId?: string | null;
};

export type ClaimResult =
  | { kind: "idle" }
  | {
      kind: "blocked";
      reason: string;
      limit?: number;
    }
  | { kind: "error"; status: number; error: string }
  | {
      kind: "claimed";
      payload: Record<string, unknown>;
    };

const MAX_CONCURRENT_RUNS_PER_AM = 5;

/**
 * Per-ATS concurrency cap. Set via MAX_CONCURRENT_PER_ATS env (default 3).
 * Prevents a fleet from hammering a single ATS host with all runners at once,
 * which is the fastest way to trigger captcha/rate-limit cascades.
 *
 * Set to 0 to disable per-ATS capping.
 */
function readMaxConcurrentPerAts(): number {
  const raw = Number(process.env.MAX_CONCURRENT_PER_ATS);
  if (!Number.isFinite(raw) || raw < 0) return 3;
  return Math.floor(raw);
}

async function getAtsAtCapacity(): Promise<Set<string>> {
  const cap = readMaxConcurrentPerAts();
  if (cap <= 0) return new Set();
  const { data } = await supabaseServer
    .from("application_runs")
    .select("ats_type")
    .in("status", ["RUNNING", "RETRYING"]);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const ats = (row.ats_type as string | null) ?? "UNKNOWN";
    counts.set(ats, (counts.get(ats) ?? 0) + 1);
  }
  const blocked = new Set<string>();
  counts.forEach((n, ats) => {
    if (n >= cap) blocked.add(ats);
  });
  return blocked;
}

export async function claimNextRun(ctx: ClaimContext): Promise<ClaimResult> {
  // Kill switches (mig 108): a flipped switch stops NEW claims on the next
  // poll; in-flight runs finish (stopping mid-wizard risks half-submitted
  // applications). ATS-level switches filter candidates below.
  const disabledPolicies = await getDisabledPolicyKeys();
  if (disabledPolicies.has(GLOBAL_APPLY_KEY)) {
    return { kind: "blocked", reason: "AUTOMATION_HALTED" };
  }

  let assignedIds: string[] = [];

  if (!ctx.isRunner) {
    const { data: assignments, error: assignmentsError } = await supabaseServer
      .from("job_seeker_assignments")
      .select("job_seeker_id")
      .eq("account_manager_id", ctx.accountManagerId);

    if (assignmentsError) {
      return {
        kind: "error",
        status: 500,
        error: "Failed to load job seeker assignments.",
      };
    }

    assignedIds = (assignments ?? []).map((row) => row.job_seeker_id);
    if (assignedIds.length === 0) {
      return { kind: "idle" };
    }

    const { data: runningRuns, error: runningError } = await supabaseServer
      .from("application_runs")
      .select("id")
      .in("job_seeker_id", assignedIds)
      .in("status", ["RUNNING", "RETRYING"]);

    if (runningError) {
      return { kind: "error", status: 500, error: "Failed to check concurrency." };
    }

    if ((runningRuns?.length ?? 0) >= MAX_CONCURRENT_RUNS_PER_AM) {
      return {
        kind: "blocked",
        reason: "MAX_CONCURRENCY",
        limit: MAX_CONCURRENT_RUNS_PER_AM,
      };
    }
  }

  // Identify ATSes currently at the per-ATS concurrency cap so we skip
  // their runs and let other ATSes get worked instead.
  const atsAtCapacity = await getAtsAtCapacity();

  // Fetch a batch of candidates (not just one) so a velocity-blocked seeker's
  // run doesn't stall the whole queue — we skip to the next eligible seeker.
  let nextRunQuery = supabaseServer
    .from("application_runs")
    .select(
      "id, queue_id, job_post_id, ats_type, status, current_step, attempt_count, max_retries, job_seeker_id, resume_url_used, resume_source, priority"
    )
    .in("status", ["READY", "RETRYING"])
    .is("locked_at", null)
    .order("priority", { ascending: true })   // 1 = highest priority
    .order("updated_at", { ascending: true }) // then oldest within priority
    .limit(25);

  if (!ctx.isRunner) {
    nextRunQuery = nextRunQuery.in("job_seeker_id", assignedIds);
  }
  if (atsAtCapacity.size > 0) {
    // Supabase has no "not in" array shortcut here that works cleanly with
    // empty sets; we build a filter string.
    const blocklist = Array.from(atsAtCapacity)
      .map((a) => `"${a.replace(/"/g, '\\"')}"`)
      .join(",");
    nextRunQuery = nextRunQuery.not("ats_type", "in", `(${blocklist})`);
  }

  const { data: candidates, error: nextRunError } = await nextRunQuery;
  if (nextRunError) {
    return { kind: "error", status: 500, error: "Failed to load next run." };
  }
  if (!candidates || candidates.length === 0) {
    return { kind: "idle" };
  }

  // ATS-level kill switches: drop candidates on halted ATSes.
  const policyEligible = candidates.filter(
    (c) => !disabledPolicies.has(atsPolicyKey(c.ats_type))
  );
  if (policyEligible.length === 0) {
    return { kind: "blocked", reason: "ATS_HALTED" };
  }

  // Per-seeker velocity policy (daily cap / pacing / quiet hours, mig 104).
  // Missing verdict = allowed (fail open — see evaluateVelocityForSeekers).
  const velocity = await evaluateVelocityForSeekers(
    policyEligible.map((c) => c.job_seeker_id as string)
  );
  const eligible = policyEligible.filter(
    (c) => velocity.get(c.job_seeker_id as string)?.allowed !== false
  );
  if (eligible.length === 0) {
    // Everything queued is throttled right now; report the first reason so
    // pollers can distinguish "empty queue" from "paced".
    const firstBlocked = velocity.get(policyEligible[0].job_seeker_id as string);
    return {
      kind: "blocked",
      reason:
        firstBlocked && !firstBlocked.allowed
          ? firstBlocked.reason
          : "VELOCITY_LIMITED",
    };
  }

  const nowIso = new Date().toISOString();
  const claimToken = randomUUID();
  const actor = getActorFromHeaders(ctx.request.headers);
  const lockedBy = `${actor}:${ctx.accountManagerEmail}`;

  // Try candidates in order; a lost claim race moves on to the next one
  // instead of returning idle (the old single-candidate behavior).
  type LockedRun = {
    id: string;
    queue_id: string | null;
    ats_type: string | null;
    current_step: string | null;
    attempt_count: number | null;
    max_retries: number | null;
    job_post_id: string;
    job_seeker_id: string;
    resume_url_used: string | null;
    resume_source: string | null;
  };
  let lockedRun: LockedRun | null = null;

  for (const candidate of eligible.slice(0, 5)) {
    const { data: locked, error: lockError } = await supabaseServer
      .from("application_runs")
      .update({
        status: "RUNNING",
        locked_at: nowIso,
        locked_by: lockedBy,
        claim_token: claimToken,
        updated_at: nowIso,
      })
      .eq("id", candidate.id)
      .is("locked_at", null)
      .in("status", ["READY", "RETRYING"])
      .select(
        "id, queue_id, ats_type, current_step, attempt_count, max_retries, job_post_id, job_seeker_id, resume_url_used, resume_source"
      )
      .maybeSingle();

    if (lockError || !locked) {
      continue; // lost the race — next candidate
    }

    // Fuzzy duplicate gate: reposted jobs get a fresh job_post_id, so the
    // exact /start guard misses them. If this seeker already applied (or is
    // applying) to the same normalized (company, title) in the last 30 days
    // — on any channel — cancel this run instead of double-applying.
    const duplicate = await findRecentDuplicateRun(
      locked.job_seeker_id as string,
      locked.job_post_id as string
    );
    if (duplicate) {
      await cancelDuplicateRun(
        { id: locked.id as string, queue_id: locked.queue_id as string | null },
        duplicate,
        actor
      );
      continue; // next candidate
    }

    lockedRun = locked as unknown as LockedRun;
    break;
  }

  // Every attempted candidate lost its race; poller will simply come back.
  if (!lockedRun) {
    return { kind: "idle" };
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
    payload: {
      step: lockedRun.current_step,
      runner_id: ctx.runnerId ?? null,
    },
  });

  const [{ data: jobSeeker }, { data: jobPost }, { data: tailoredResume }] =
    await Promise.all([
      supabaseServer
        .from("job_seekers")
        .select(
          "id, resume_url, full_name, email, phone, location, linkedin_url, portfolio_url, address_line1, address_city, address_state, address_zip, address_country"
        )
        .eq("id", lockedRun.job_seeker_id)
        .maybeSingle(),
      supabaseServer
        .from("job_posts")
        .select("id, url, title, company, source")
        .eq("id", lockedRun.job_post_id)
        .single(),
      supabaseServer
        .from("tailored_resumes")
        .select("tailored_text, resume_url")
        .eq("job_seeker_id", lockedRun.job_seeker_id)
        .eq("job_post_id", lockedRun.job_post_id)
        .maybeSingle(),
    ]);

  if (!jobPost?.id) {
    return { kind: "error", status: 404, error: "Job post not found." };
  }

  let storageStateUrl: string | null = null;
  try {
    const storagePath = `${lockedRun.job_seeker_id}/storage-state.json`;
    const { data: signedState } = await supabaseAdmin.storage
      .from("runner_state")
      .createSignedUrl(storagePath, 7 * 24 * 60 * 60);
    if (signedState?.signedUrl) {
      storageStateUrl = signedState.signedUrl;
    }
  } catch {
    storageStateUrl = null;
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

  return {
    kind: "claimed",
    payload: {
      success: true,
      task_id: lockedRun.id,
      run_id: lockedRun.id,
      queue_id: lockedRun.queue_id,
      claim_token: claimToken,
      status: "RUNNING",
      ats_type: lockedRun.ats_type,
      current_step: lockedRun.current_step,
      job_seeker_id: lockedRun.job_seeker_id,
      attempts: {
        attempt_count: lockedRun.attempt_count ?? 0,
        max_retries: lockedRun.max_retries ?? 2,
      },
      resume: {
        url: resumeUrl,
        tailored_url: tailoredResumeUrl,
        tailored_text: tailoredResume?.tailored_text ?? null,
      },
      storage_state_url: storageStateUrl,
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
    },
  };
}
