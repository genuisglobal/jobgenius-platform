import { supabaseServer } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/ops-auth";
import { enforceOpsRateLimit } from "@/lib/rate-limit-presets";

type Pair = { job_seeker_id: string; job_post_id: string };

async function runRetention(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;

  const auth = requireOpsAuth(request.headers, request.url);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dry_run") === "true";

  // The RPC cleanups perform their own deletes, so they only run for real.
  // In dry-run mode they're skipped and reported as null.
  let heartbeatsCount: number | null = null;
  let eventsCount: number | null = null;
  let alertsCount: number | null = null;

  if (!dryRun) {
    const hb = await supabaseServer.rpc("cleanup_runner_heartbeats", { days: 14 });
    if (hb.error) {
      return Response.json(
        { success: false, error: "Failed to cleanup runner heartbeats." },
        { status: 500 }
      );
    }
    heartbeatsCount = hb.data;

    const ev = await supabaseServer.rpc("cleanup_apply_run_events", { days: 30 });
    if (ev.error) {
      return Response.json(
        { success: false, error: "Failed to cleanup apply run events." },
        { status: 500 }
      );
    }
    eventsCount = ev.data;

    const al = await supabaseServer.rpc("cleanup_ops_alerts", { days: 30 });
    if (al.error) {
      return Response.json(
        { success: false, error: "Failed to cleanup ops alerts." },
        { status: 500 }
      );
    }
    alertsCount = al.data;
  }

  // Job Hub lifecycle: archive a job 2 weeks after it was discovered, keep it
  // archived for 2 more weeks, then permanently delete (~1 month total). Jobs
  // with an unresolved queue/run item are never deleted (see blockedIds
  // below); terminal statuses (completed/failed/cancelled/rejected/applied)
  // no longer block archival — otherwise any job ever touched by the
  // pipeline stays "active" forever, regardless of outcome. Union of both
  // tables' non-terminal vocabularies (application_queue and
  // application_runs use overlapping but not identical status strings —
  // see lib/runState.ts for the application_runs state machine); errs
  // toward NOT archiving when a status is ambiguous.
  const ACTIVE_STATUSES = ["QUEUED", "PENDING", "READY", "RUNNING", "RETRYING", "NEEDS_ATTENTION"];
  const now = Date.now();
  const archiveCutoff = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
  const deleteCutoff = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: archiveCandidates, error: archiveError } = await supabaseServer
    .from("job_posts")
    .select("id")
    .or(`created_at.lt.${archiveCutoff},discovered_at.lt.${archiveCutoff}`)
    .is("archived_at", null)
    .eq("is_active", true);

  if (archiveError) {
    return Response.json(
      { success: false, error: "Failed to load job post archive candidates." },
      { status: 500 }
    );
  }

  const { data: deleteCandidates, error: deleteError } = await supabaseServer
    .from("job_posts")
    .select("id")
    .lt("archived_at", deleteCutoff);

  if (deleteError) {
    return Response.json(
      { success: false, error: "Failed to load job post delete candidates." },
      { status: 500 }
    );
  }

  const archiveIds = (archiveCandidates ?? []).map((row) => row.id);
  const deleteIds = (deleteCandidates ?? []).map((row) => row.id);
  const candidateIds = Array.from(new Set([...archiveIds, ...deleteIds]));

  let jobPostsArchived = 0;
  let jobPostsDeleted = 0;

  if (candidateIds.length > 0) {
    const [{ data: queueRows, error: queueError }, { data: runRows, error: runError }] =
      await Promise.all([
        supabaseServer
          .from("application_queue")
          .select("job_post_id")
          .in("job_post_id", candidateIds)
          .in("status", ACTIVE_STATUSES),
        supabaseServer
          .from("application_runs")
          .select("job_post_id")
          .in("job_post_id", candidateIds)
          .in("status", ACTIVE_STATUSES),
      ]);

    if (queueError || runError) {
      return Response.json(
        { success: false, error: "Failed to load job post references." },
        { status: 500 }
      );
    }

    const blockedIds = new Set<string>();
    for (const row of queueRows ?? []) {
      if (row.job_post_id) blockedIds.add(row.job_post_id);
    }
    for (const row of runRows ?? []) {
      if (row.job_post_id) blockedIds.add(row.job_post_id);
    }

    const toArchive = archiveIds.filter((id) => !blockedIds.has(id));
    const toDelete = deleteIds.filter((id) => !blockedIds.has(id));

    if (dryRun) {
      jobPostsArchived = toArchive.length;
      jobPostsDeleted = toDelete.length;
    } else {
      const nowIso = new Date().toISOString();
      const chunkSize = 200;

      for (let i = 0; i < toArchive.length; i += chunkSize) {
        const chunk = toArchive.slice(i, i + chunkSize);
        const { error } = await supabaseServer
          .from("job_posts")
          .update({ is_active: false, archived_at: nowIso })
          .in("id", chunk);
        if (error) {
          return Response.json(
            { success: false, error: "Failed to archive job posts." },
            { status: 500 }
          );
        }
        jobPostsArchived += chunk.length;
      }

      for (let i = 0; i < toDelete.length; i += chunkSize) {
        const chunk = toDelete.slice(i, i + chunkSize);
        const { error } = await supabaseServer
          .from("job_posts")
          .delete()
          .in("id", chunk);
        if (error) {
          return Response.json(
            { success: false, error: "Failed to delete job posts." },
            { status: 500 }
          );
        }
        jobPostsDeleted += chunk.length;
      }
    }
  }

  // Tailored resume cleanup for rejected/failed jobs
  const { data: rejectedQueue, error: rejectedError } = await supabaseServer
    .from("application_queue")
    .select("job_seeker_id, job_post_id")
    .in("status", ["REJECTED", "FAILED"]);

  if (rejectedError) {
    return Response.json(
      { success: false, error: "Failed to load rejected queue items." },
      { status: 500 }
    );
  }

  const { data: failedRuns, error: failedRunsError } = await supabaseServer
    .from("application_runs")
    .select("job_seeker_id, job_post_id")
    .eq("status", "FAILED");

  if (failedRunsError) {
    return Response.json(
      { success: false, error: "Failed to load failed runs." },
      { status: 500 }
    );
  }

  const pairSet = new Set<string>();
  const addPair = (row: Pair) => {
    if (row.job_seeker_id && row.job_post_id) {
      pairSet.add(`${row.job_seeker_id}:${row.job_post_id}`);
    }
  };

  (rejectedQueue ?? []).forEach(addPair);
  (failedRuns ?? []).forEach(addPair);

  let tailoredResumesDeleted = 0;
  let tailoredResumeFilesDeleted = 0;

  if (pairSet.size > 0) {
    const jobSeekerIds = new Set<string>();
    const jobPostIds = new Set<string>();

    pairSet.forEach((key) => {
      const [jobSeekerId, jobPostId] = key.split(":");
      jobSeekerIds.add(jobSeekerId);
      jobPostIds.add(jobPostId);
    });

    const { data: tailoredRows, error: tailoredError } = await supabaseServer
      .from("tailored_resumes")
      .select("id, job_seeker_id, job_post_id")
      .in("job_seeker_id", Array.from(jobSeekerIds))
      .in("job_post_id", Array.from(jobPostIds));

    if (tailoredError) {
      return Response.json(
        { success: false, error: "Failed to load tailored resumes." },
        { status: 500 }
      );
    }

    const toDeleteRows = (tailoredRows ?? []).filter((row) =>
      pairSet.has(`${row.job_seeker_id}:${row.job_post_id}`)
    );

    if (toDeleteRows.length > 0) {
      if (dryRun) {
        tailoredResumesDeleted = toDeleteRows.length;
      } else {
        const paths = toDeleteRows.map(
          (row) => `${row.job_seeker_id}/tailored/${row.job_post_id}.pdf`
        );

        const { data: removedFiles, error: removeError } = await supabaseServer.storage
          .from("resumes")
          .remove(paths);

        if (removeError) {
          console.error("Failed to remove tailored resume files:", removeError);
        }

        tailoredResumeFilesDeleted = removedFiles?.length ?? 0;

        const chunkSize = 200;
        const ids = toDeleteRows.map((row) => row.id);
        for (let i = 0; i < ids.length; i += chunkSize) {
          const chunk = ids.slice(i, i + chunkSize);
          const { error } = await supabaseServer
            .from("tailored_resumes")
            .delete()
            .in("id", chunk);
          if (error) {
            return Response.json(
              { success: false, error: "Failed to delete tailored resumes." },
              { status: 500 }
            );
          }
        }

        tailoredResumesDeleted = toDeleteRows.length;
      }
    }
  }

  const cutoffIso = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
  let voiceSessionsCount = 0;
  if (dryRun) {
    const { count, error: voiceError } = await supabaseServer
      .from("voice_interview_sessions")
      .select("id", { count: "exact", head: true })
      .lt("created_at", cutoffIso);
    if (voiceError) {
      return Response.json(
        { success: false, error: "Failed to count voice interview transcripts." },
        { status: 500 }
      );
    }
    voiceSessionsCount = count ?? 0;
  } else {
    const { data: voiceSessions, error: voiceError } = await supabaseServer
      .from("voice_interview_sessions")
      .delete()
      .lt("created_at", cutoffIso)
      .select("id");
    if (voiceError) {
      return Response.json(
        { success: false, error: "Failed to cleanup voice interview transcripts." },
        { status: 500 }
      );
    }
    voiceSessionsCount = voiceSessions?.length ?? 0;
  }

  return Response.json({
    success: true,
    dry_run: dryRun,
    // In dry-run mode these are the counts that WOULD be archived/deleted.
    deleted: {
      runner_heartbeats: heartbeatsCount ?? 0,
      apply_run_events: eventsCount ?? 0,
      ops_alerts: alertsCount ?? 0,
      voice_sessions: voiceSessionsCount,
      job_posts_archived: jobPostsArchived,
      job_posts_deleted: jobPostsDeleted,
      tailored_resumes_deleted: tailoredResumesDeleted,
      tailored_resume_files_deleted: tailoredResumeFilesDeleted,
    },
  });
}

export async function POST(request: Request) {
  return runRetention(request);
}

export async function GET(request: Request) {
  return runRetention(request);
}
