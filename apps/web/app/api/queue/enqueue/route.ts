import { requireAMAccessToSeeker } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";
import { isActiveClient } from "@/lib/intake";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { logActivity } from "@/lib/feedback-loop";
import {
  buildAdjacentOpportunity,
  buildMatchExplanation,
} from "@/lib/matching/explanations";
import { resolveQueueCategory } from "@/lib/queue-categories";

type EnqueuePayload = {
  job_post_id?: string;
  job_seeker_id?: string;
  category?: string;
};

export async function POST(request: Request) {
  let payload: EnqueuePayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.job_post_id || !payload?.job_seeker_id) {
    return Response.json(
      {
        success: false,
        error: "Missing required fields: job_post_id, job_seeker_id.",
      },
      { status: 400 }
    );
  }

  const access = await requireAMAccessToSeeker(request.headers, payload.job_seeker_id);
  if (!access.ok) return access.response;

  if (!(await isActiveClient(payload.job_seeker_id))) {
    return Response.json(
      {
        success: false,
        error: "Live applications are only allowed for active clients.",
      },
      { status: 409 }
    );
  }

  const { data: existingQueue, error: existingQueueError } = await supabaseServer
    .from("application_queue")
    .select("id, status")
    .eq("job_post_id", payload.job_post_id)
    .eq("job_seeker_id", payload.job_seeker_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingQueueError) {
    return Response.json(
      { success: false, error: "Failed to check existing queue item." },
      { status: 500 }
    );
  }

  if (existingQueue?.id) {
    const { data: existingRun, error: existingRunError } = await supabaseServer
      .from("application_runs")
      .select("id, status")
      .eq("queue_id", existingQueue.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingRunError) {
      return Response.json(
        { success: false, error: "Failed to check existing application run." },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      already_queued: true,
      queue_id: existingQueue.id,
      run_id: existingRun?.id ?? null,
      status: existingRun?.status ?? existingQueue.status,
    });
  }

  const [{ data: matchScore }, { data: seeker }] = await Promise.all([
    supabaseServer
      .from("job_match_scores")
      .select("score, confidence, recommendation, reasons")
      .eq("job_seeker_id", payload.job_seeker_id)
      .eq("job_post_id", payload.job_post_id)
      .maybeSingle(),
    supabaseServer
      .from("job_seekers")
      .select("match_threshold")
      .eq("id", payload.job_seeker_id)
      .maybeSingle(),
  ]);

  const explanation = buildMatchExplanation(matchScore?.reasons, {
    score: matchScore?.score ?? null,
    confidence: matchScore?.confidence ?? null,
    recommendation: matchScore?.recommendation ?? null,
  });

  if (explanation.queueBlocked) {
    return Response.json(
      {
        success: false,
        error:
          explanation.queueBlockReason ||
          "This match is blocked from queueing.",
        queue_blocked: true,
        reason: explanation.queueBlockCode,
      },
      { status: 400 }
    );
  }

  const adjacent = buildAdjacentOpportunity(matchScore?.reasons, {
    score: matchScore?.score ?? null,
    confidence: matchScore?.confidence ?? null,
    recommendation: matchScore?.recommendation ?? null,
    threshold: seeker?.match_threshold ?? 60,
  });
  const queueCategory = resolveQueueCategory({
    requestedCategory: payload.category,
    defaultCategory: "manual",
    adjacentEligible: adjacent.eligible,
  });

  const { data, error } = await supabaseServer.from("application_queue").insert({
    job_post_id: payload.job_post_id,
    job_seeker_id: payload.job_seeker_id,
    status: "QUEUED",
    category: queueCategory,
    updated_at: new Date().toISOString(),
  }).select("id").single();

  if (error) {
    return Response.json(
      { success: false, error: "Failed to enqueue application." },
      { status: 500 }
    );
  }

  // Log to activity feed (non-blocking)
  logActivity(payload.job_seeker_id, {
    eventType: "job_queued",
    title: "Job queued for application",
    description: `Manually queued by AM`,
    meta: { queue_id: data?.id, job_post_id: payload.job_post_id, category: queueCategory },
    refType: "application_queue",
    refId: data?.id,
  }).catch((err) => console.error("[queue:enqueue] activity log failed:", err));

  if (data?.id) {
    try {
      await enqueueBackgroundJob("AUTO_START_RUN", {
        queue_id: data.id,
        job_seeker_id: payload.job_seeker_id,
        job_post_id: payload.job_post_id,
      });
    } catch (err) {
      console.error("Failed to enqueue AUTO_START_RUN", err);
    }
  }

  return Response.json({ success: true });
}
