import { getAccountManagerFromRequest } from "@/lib/am-access";
import { isManualQueueCategory } from "@/lib/queue-categories";
import { supabaseServer } from "@/lib/supabase/server";

type Counts = {
  matched: number;
  below_threshold: number;
  manual: number;
  in_progress: number;
  applied: number;
  needs_attention: number;
  failed: number;
};

export async function GET(request: Request) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  const { data: assignments, error: assignmentsError } = await supabaseServer
    .from("job_seeker_assignments")
    .select("job_seeker_id, job_seekers (id, full_name, location, seniority, target_titles, work_type, match_threshold)")
    .eq("account_manager_id", amResult.accountManager.id);

  if (assignmentsError) {
    return Response.json(
      { success: false, error: "Failed to load job seekers." },
      { status: 500 }
    );
  }

  const seekers = (assignments ?? []).flatMap((assignment) => {
    const seeker = assignment.job_seekers;
    if (!seeker) {
      return [];
    }
    return Array.isArray(seeker) ? seeker : [seeker];
  });

  const seekerRows = seekers as Array<{
    id: string;
    full_name: string | null;
    location: string | null;
    seniority: string | null;
    target_titles: string[] | null;
    work_type: string | null;
    match_threshold: number | null;
  }>;

  const seekerIds = seekerRows.map((seeker) => seeker.id);

  if (seekerIds.length === 0) {
    return Response.json({ success: true, job_seekers: [] });
  }

  const { data: scores, error: scoresError } = await supabaseServer
    .from("job_match_scores")
    .select("job_seeker_id, job_post_id, score")
    .in("job_seeker_id", seekerIds);

  if (scoresError) {
    return Response.json(
      { success: false, error: "Failed to load match scores." },
      { status: 500 }
    );
  }

  const { data: decisions, error: decisionsError } = await supabaseServer
    .from("job_routing_decisions")
    .select("job_seeker_id, job_post_id, decision")
    .in("job_seeker_id", seekerIds);

  if (decisionsError) {
    return Response.json(
      { success: false, error: "Failed to load routing decisions." },
      { status: 500 }
    );
  }

  const { data: queueItems, error: queueError } = await supabaseServer
    .from("application_queue")
    .select("job_seeker_id, category")
    .in("job_seeker_id", seekerIds);

  if (queueError) {
    return Response.json(
      { success: false, error: "Failed to load application queue." },
      { status: 500 }
    );
  }

  const { data: runs, error: runsError } = await supabaseServer
    .from("application_runs")
    .select("job_seeker_id, status")
    .in("job_seeker_id", seekerIds);

  if (runsError) {
    return Response.json(
      { success: false, error: "Failed to load application runs." },
      { status: 500 }
    );
  }

  const decisionMap = new Map<string, string>();
  for (const decision of decisions ?? []) {
    decisionMap.set(`${decision.job_seeker_id}:${decision.job_post_id}`, decision.decision);
  }

  const countsBySeeker = new Map<string, Counts>();
  for (const seekerId of seekerIds) {
    countsBySeeker.set(seekerId, {
      matched: 0,
      below_threshold: 0,
      manual: 0,
      in_progress: 0,
      applied: 0,
      needs_attention: 0,
      failed: 0,
    });
  }

  const thresholdMap = new Map<string, number>();
  for (const seeker of seekerRows) {
    thresholdMap.set(seeker.id, seeker.match_threshold ?? 60);
  }

  for (const scoreRow of scores ?? []) {
    const threshold = thresholdMap.get(scoreRow.job_seeker_id) ?? 60;
    const decision = decisionMap.get(`${scoreRow.job_seeker_id}:${scoreRow.job_post_id}`);
    const counts = countsBySeeker.get(scoreRow.job_seeker_id);
    if (!counts) continue;

    if (scoreRow.score >= threshold && decision !== "OVERRIDDEN_OUT") {
      counts.matched += 1;
    }

    if (scoreRow.score < threshold && decision !== "OVERRIDDEN_IN") {
      counts.below_threshold += 1;
    }
  }

  for (const queueItem of queueItems ?? []) {
    const counts = countsBySeeker.get(queueItem.job_seeker_id);
    if (!counts) continue;
    if (isManualQueueCategory(queueItem.category)) {
      counts.manual += 1;
    }
  }

  for (const run of runs ?? []) {
    const counts = countsBySeeker.get(run.job_seeker_id);
    if (!counts) continue;
    if (
      run.status === "RUNNING" ||
      run.status === "PAUSED" ||
      run.status === "READY" ||
      run.status === "RETRYING"
    ) {
      counts.in_progress += 1;
    } else if (run.status === "APPLIED" || run.status === "COMPLETED") {
      counts.applied += 1;
    } else if (run.status === "NEEDS_ATTENTION") {
      counts.needs_attention += 1;
    } else if (run.status === "FAILED") {
      counts.failed += 1;
    }
  }

  const response = seekerRows.map((seeker) => ({
    ...seeker,
    counts: countsBySeeker.get(seeker.id),
  }));

  return Response.json({ success: true, job_seekers: response });
}
