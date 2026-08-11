import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { verifyExtensionSession } from "@/lib/extension-auth";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { isActiveClient } from "@/lib/intake";
import {
  buildAdjacentOpportunity,
  buildMatchExplanation,
} from "@/lib/matching/explanations";
import { resolveQueueCategory } from "@/lib/queue-categories";

/**
 * POST /api/extension/queue-job
 *
 * Queue a matched job for application from the extension.
 * Body: { job_post_id, job_seeker_id? }
 *
 * If job_seeker_id is omitted, uses the active seeker from the session.
 */
export async function POST(request: Request) {
  try {
    const session = await verifyExtensionSession(request);
    if (!session) {
      return NextResponse.json(
        { error: "Invalid or expired token." },
        { status: 401 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { job_post_id } = body;
    const job_seeker_id = body.job_seeker_id || session.active_job_seeker_id;

    if (!job_post_id) {
      return NextResponse.json(
        { error: "job_post_id is required." },
        { status: 400 }
      );
    }

    if (!job_seeker_id) {
      return NextResponse.json(
        { error: "No job seeker specified or active." },
        { status: 400 }
      );
    }

    // Verify AM has access to this job seeker
    const { data: assignment } = await supabaseAdmin
      .from("job_seeker_assignments")
      .select("id")
      .eq("account_manager_id", session.account_manager_id)
      .eq("job_seeker_id", job_seeker_id)
      .maybeSingle();

    if (!assignment) {
      return NextResponse.json(
        { error: "Not authorized for this job seeker." },
        { status: 403 }
      );
    }

    if (!(await isActiveClient(job_seeker_id))) {
      return NextResponse.json(
        { error: "Live applications are only allowed for active clients." },
        { status: 409 }
      );
    }

    // Check if already queued
    const { data: existingQueue } = await supabaseAdmin
      .from("application_queue")
      .select("id, status")
      .eq("job_post_id", job_post_id)
      .eq("job_seeker_id", job_seeker_id)
      .maybeSingle();

    if (existingQueue) {
      const { data: existingQueuedRun } = await supabaseAdmin
        .from("application_runs")
        .select("id, status")
        .eq("queue_id", existingQueue.id)
        .maybeSingle();

      return NextResponse.json({
        success: true,
        already_queued: true,
        queue_id: existingQueue.id,
        run_id: existingQueuedRun?.id ?? null,
        status: existingQueuedRun?.status ?? existingQueue.status,
      });
    }

    // Also check application_runs
    const { data: existingRun } = await supabaseAdmin
      .from("application_runs")
      .select("id, status, queue_id")
      .eq("job_post_id", job_post_id)
      .eq("job_seeker_id", job_seeker_id)
      .maybeSingle();

    if (existingRun) {
      return NextResponse.json({
        success: true,
        already_applied: true,
        queue_id: existingRun.queue_id ?? null,
        run_id: existingRun.id,
        status: existingRun.status,
      });
    }

    const { data: matchScore } = await supabaseAdmin
      .from("job_match_scores")
      .select("score, confidence, recommendation, reasons")
      .eq("job_seeker_id", job_seeker_id)
      .eq("job_post_id", job_post_id)
      .maybeSingle();

    const { data: seeker } = await supabaseAdmin
      .from("job_seekers")
      .select("match_threshold")
      .eq("id", job_seeker_id)
      .maybeSingle();

    const explanation = buildMatchExplanation(matchScore?.reasons, {
      score: matchScore?.score ?? null,
      confidence: matchScore?.confidence ?? null,
      recommendation: matchScore?.recommendation ?? null,
    });

    if (explanation.queueBlocked) {
      return NextResponse.json(
        {
          error: explanation.queueBlockReason || "This match is blocked from queueing.",
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
      defaultCategory: "matched",
      adjacentEligible: adjacent.eligible,
    });

    // Insert into application_queue
    const nowIso = new Date().toISOString();
    const { data: queuedItem, error: insertError } = await supabaseAdmin
      .from("application_queue")
      .insert({
        job_post_id,
        job_seeker_id,
        status: "QUEUED",
        category: queueCategory,
        updated_at: nowIso,
      })
      .select("id, job_seeker_id, job_post_id")
      .single();

    if (insertError) {
      console.error("Error queueing job:", insertError);
      return NextResponse.json(
        { error: "Failed to queue application." },
        { status: 500 }
      );
    }

    if (queuedItem?.id) {
      enqueueBackgroundJob("AUTO_START_RUN", {
        queue_id: queuedItem.id,
        job_seeker_id: queuedItem.job_seeker_id,
        job_post_id: queuedItem.job_post_id,
      }).catch((error) => {
        console.error("Extension queue AUTO_START_RUN enqueue failed:", error);
      });
    }

    return NextResponse.json({
      success: true,
      queue_id: queuedItem?.id ?? null,
      run_id: null,
      status: "QUEUED",
    });
  } catch (error) {
    console.error("Extension queue-job error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
