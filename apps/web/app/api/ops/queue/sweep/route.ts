import { requireOpsAuth } from "@/lib/ops-auth";
import { enforceOpsRateLimit } from "@/lib/rate-limit-presets";
import { supabaseServer } from "@/lib/supabase/server";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import {
  evaluateAutoApplyPreflight,
  loadSavedRunnerStorageState,
} from "@/lib/auto-apply-preflight";
import { applyHostGraduation } from "@/lib/host-graduation";

const AUTO_APPLY_ALLOWED_ATS = new Set(
  (process.env.AUTO_APPLY_ALLOWED_ATS ?? "LINKEDIN,GREENHOUSE,WORKDAY,LEVER,SMARTRECRUITERS,GENERIC")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
);
const SWEEP_LIMIT = Math.min(
  Number(process.env.QUEUE_SWEEP_LIMIT ?? 50),
  200
);
// Items must be at least this old before the sweep considers them orphaned.
const SWEEP_MIN_AGE_MINUTES = Math.max(
  Number(process.env.QUEUE_SWEEP_MIN_AGE_MINUTES ?? 5),
  1
);

async function runSweep(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;

  const auth = requireOpsAuth(request.headers);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: 401 });
  }

  const cutoffIso = new Date(
    Date.now() - SWEEP_MIN_AGE_MINUTES * 60 * 1000
  ).toISOString();

  // 1. Find QUEUED items that are old enough to be considered orphaned.
  const { data: queuedItems, error: queueError } = await supabaseServer
    .from("application_queue")
    .select("id, job_seeker_id, job_post_id")
    .eq("status", "QUEUED")
    .lte("updated_at", cutoffIso)
    .order("updated_at", { ascending: true })
    .limit(SWEEP_LIMIT);

  if (queueError) {
    return Response.json(
      { success: false, error: "Failed to load queued items." },
      { status: 500 }
    );
  }

  if (!queuedItems || queuedItems.length === 0) {
    return Response.json({ success: true, enqueued: 0, skipped: 0 });
  }

  const queueIds = queuedItems.map((q) => q.id);

  // 2. Find which of these already have an application_run (any status).
  const { data: existingRuns } = await supabaseServer
    .from("application_runs")
    .select("queue_id")
    .in("queue_id", queueIds);

  const runCoveredIds = new Set(
    (existingRuns ?? []).map((r) => r.queue_id).filter(Boolean)
  );

  // 3. Find which have a pending background job (QUEUED / RUNNING / RETRY)
  //    of a type that will create a run for them.
  //    We fetch recent pending jobs and match queue_id from their JSONB payload.
  const { data: pendingJobs } = await supabaseServer
    .from("background_jobs")
    .select("id, type, payload, status")
    .in("type", ["AUTO_START_RUN", "TAILOR_RESUME"])
    .in("status", ["QUEUED", "RUNNING", "RETRY"])
    .limit(500);

  const jobCoveredIds = new Set<string>();
  for (const job of pendingJobs ?? []) {
    const payload = job.payload as Record<string, unknown> | null;
    const qid = typeof payload?.queue_id === "string" ? payload.queue_id : null;
    if (qid) {
      jobCoveredIds.add(qid);
    }
  }

  // 4. Items that need a new AUTO_START_RUN job enqueued.
  const orphans = queuedItems.filter(
    (q) => !runCoveredIds.has(q.id) && !jobCoveredIds.has(q.id)
  );

  if (orphans.length === 0) {
    return Response.json({
      success: true,
      enqueued: 0,
      skipped: queuedItems.length,
    });
  }

  // 5. Resolve ATS types so we can filter for allowed platforms.
  const jobPostIds = Array.from(new Set(orphans.map((q) => q.job_post_id)));
  const seekerIds = Array.from(new Set(orphans.map((q) => q.job_seeker_id)));
  const { data: jobPosts } = await supabaseServer
    .from("job_posts")
    .select("id, source, url")
    .in("id", jobPostIds);
  const { data: matchScores } = await supabaseServer
    .from("job_match_scores")
    .select("job_seeker_id, job_post_id, score, confidence, recommendation, reasons")
    .in("job_post_id", jobPostIds)
    .in("job_seeker_id", seekerIds);

  const jobPostMap = new Map(
    (jobPosts ?? []).map((jp) => [jp.id, jp])
  );
  const matchScoreMap = new Map(
    (matchScores ?? []).map((row) => [
      `${row.job_seeker_id}:${row.job_post_id}`,
      row,
    ])
  );
  const storageStateCache = new Map<string, Awaited<ReturnType<typeof loadSavedRunnerStorageState>>>();

  async function getStorageState(jobSeekerId: string) {
    if (!storageStateCache.has(jobSeekerId)) {
      storageStateCache.set(
        jobSeekerId,
        await loadSavedRunnerStorageState(jobSeekerId)
      );
    }
    return storageStateCache.get(jobSeekerId) ?? null;
  }

  async function flagQueueAttention(queueId: string, reason: string, message: string) {
    const nowIso = new Date().toISOString();
    const { error: queueFlagError } = await supabaseServer
      .from("application_queue")
      .update({
        status: "NEEDS_ATTENTION",
        category: "needs_attention",
        last_error: message,
        updated_at: nowIso,
      })
      .eq("id", queueId);

    if (queueFlagError) {
      console.error("[queue:sweep] failed to flag queue item:", queueFlagError);
    }

    const { error: attentionInsertError } = await supabaseServer.from("attention_items").insert({
      queue_id: queueId,
      status: "OPEN",
      reason,
    });

    if (attentionInsertError) {
      console.error("[queue:sweep] failed to insert attention item:", attentionInsertError);
    }
  }

  let enqueued = 0;
  let skipped = 0;
  let attentionFlagged = 0;

  for (const item of orphans) {
    const jp = jobPostMap.get(item.job_post_id);
    if (!jp) {
      await flagQueueAttention(
        item.id,
        "JOB_POST_MISSING",
        "Job post not found for autonomous apply preflight."
      );
      attentionFlagged++;
      continue;
    }

    let preflight = evaluateAutoApplyPreflight({
      source: jp.source,
      url: jp.url,
      matchScore:
        matchScoreMap.get(`${item.job_seeker_id}:${item.job_post_id}`) ?? null,
      storageState: await getStorageState(item.job_seeker_id),
      allowedAts: AUTO_APPLY_ALLOWED_ATS,
    });

    // Mode 3 graduation (flag-gated; only relaxes HOST_UNSUPPORTED).
    preflight = await applyHostGraduation(preflight);

    if (!preflight.eligible) {
      await flagQueueAttention(
        item.id,
        preflight.reasonCode || "AUTO_APPLY_PREFLIGHT_FAILED",
        preflight.message || "Autonomous apply preflight failed."
      );
      attentionFlagged++;
      skipped++;
      continue;
    }

    try {
      await enqueueBackgroundJob("AUTO_START_RUN", {
        queue_id: item.id,
        job_seeker_id: item.job_seeker_id,
        job_post_id: item.job_post_id,
      });
      enqueued++;
    } catch {
      skipped++;
    }
  }

  return Response.json({
    success: true,
    enqueued,
    skipped,
    attention_flagged: attentionFlagged,
    candidates: queuedItems.length,
    run_covered: runCoveredIds.size,
    job_covered: jobCoveredIds.size,
  });
}

export async function POST(request: Request) {
  return runSweep(request);
}

export async function GET(request: Request) {
  return runSweep(request);
}
