import { NextRequest, NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import { logActivity, recordFeedback } from "@/lib/feedback-loop";
import { updateMatchOutcome, type MatchOutcome } from "@/lib/learned-ranker";
import { writeOutcomeEvents } from "@/lib/outcomes-server";
import type { OutcomeEventWriteInput } from "@/lib/outcomes";

interface RouteParams {
  params: { id: string; interviewId: string };
}

// PATCH /api/am/seekers/[id]/interviews/[interviewId]/outcome
// Record the outcome of an interview
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAM(req);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: seekerId, interviewId } = params;
  const amId = auth.user.id;

  if (!(await hasJobSeekerAccess(amId, seekerId))) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const {
    outcome,
    offer_amount,
    hire_date,
    rejection_reason,
    outcome_notes,
  } = body;

  const validOutcomes = ["pending", "offer_extended", "hired", "rejected", "ghosted", "declined"];
  if (!outcome || !validOutcomes.includes(outcome)) {
    return NextResponse.json(
      { error: `outcome must be one of: ${validOutcomes.join(", ")}` },
      { status: 400 }
    );
  }

  // Verify interview belongs to this seeker
  const { data: interview } = await supabaseAdmin
    .from("interviews")
    .select("id, job_seeker_id, job_post_id")
    .eq("id", interviewId)
    .eq("job_seeker_id", seekerId)
    .single();

  if (!interview) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  // Update interview outcome
  const updatePayload: Record<string, unknown> = {
    outcome,
    outcome_notes: outcome_notes || null,
    outcome_recorded_at: new Date().toISOString(),
    outcome_recorded_by: amId,
  };

  if (outcome === "offer_extended" || outcome === "hired") {
    updatePayload.offer_amount = offer_amount || null;
  }
  if (outcome === "hired") {
    updatePayload.hire_date = hire_date || null;
    // Update interview status to COMPLETED
    updatePayload.status = "COMPLETED";
  }
  if (outcome === "rejected") {
    updatePayload.rejection_reason = rejection_reason || null;
  }

  const { data: updated, error } = await supabaseAdmin
    .from("interviews")
    .update(updatePayload)
    .eq("id", interviewId)
    .select("id, outcome, outcome_recorded_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update outcome" }, { status: 500 });
  }

  const nowIso = new Date().toISOString();

  // If hired, update job_seeker placement fields
  if (outcome === "hired") {
    const { data: jobPost } = await supabaseAdmin
      .from("interviews")
      .select("job_posts(company_name, title)")
      .eq("id", interviewId)
      .single();

    const jp = (jobPost as unknown as { job_posts?: { company_name?: string; title?: string } })?.job_posts;

    const { error: placementError } = await supabaseAdmin
      .from("job_seekers")
      .update({
        placed_at: new Date().toISOString(),
        placed_company: jp?.company_name || null,
        placed_role: jp?.title || null,
        placed_salary: offer_amount || null,
        status: "placed",
      })
      .eq("id", seekerId);

    if (placementError) {
      console.error("[interview:outcome] failed to update seeker placement:", placementError);
    }

    // Mark any pending referral as placed (non-fatal)
    try {
      const { markReferralPlaced } = await import("@/lib/referrals");
      await markReferralPlaced(seekerId);
    } catch (err) {
      console.error("markReferralPlaced error (non-fatal):", err);
    }
  }

  // Log to activity feed (non-blocking)
  const outcomeLabels: Record<string, string> = {
    offer_extended: "Offer extended",
    hired: "Hired!",
    rejected: "Interview rejected",
    ghosted: "Ghosted after interview",
    declined: "Candidate declined",
  };

  logActivity(seekerId, {
    eventType: outcome === "hired" ? "seeker_placed" : "interview_outcome",
    title: outcomeLabels[outcome] ?? `Interview outcome: ${outcome}`,
    description: outcome_notes || undefined,
    meta: { interview_id: interviewId, outcome, offer_amount },
    refType: "interviews",
    refId: interviewId,
  }).catch((err) => console.error("[interview:outcome] activity log failed:", err));

  // Auto-record rejection feedback for learning
  if (outcome === "rejected" || outcome === "ghosted") {
    recordFeedback({
      jobSeekerId: seekerId,
      jobPostId: interview.job_post_id ?? undefined,
      interviewId,
      feedbackType: outcome === "rejected" ? "interview_rejected" : "ghosted",
      rejectionReason: rejection_reason || undefined,
      rejectionCategory: rejection_reason ? undefined : "no_response",
      source: "am_recorded",
      createdBy: amId,
    }).catch((err) => console.error("[interview:outcome] feedback recording failed:", err));
  }

  // Stamp the learned-ranker outcome on the (seeker, job_post) feature row.
  // Mapping: hired → offer, offer_extended → interview, rejected/ghosted/declined → rejection.
  if (interview.job_post_id) {
    const rankerOutcome: MatchOutcome | null =
      outcome === "hired"
        ? "offer"
        : outcome === "offer_extended"
        ? "interview"
        : outcome === "rejected" || outcome === "ghosted" || outcome === "declined"
        ? "rejection"
        : null;
    if (rankerOutcome) {
      void updateMatchOutcome({
        jobSeekerId: seekerId,
        jobPostId: interview.job_post_id,
        outcome: rankerOutcome,
      });
    }
  }

  const outcomeWrites: OutcomeEventWriteInput[] = [
    {
      eventType: "interview_outcome_recorded",
      occurredAt: updated?.outcome_recorded_at ?? nowIso,
      jobSeekerId: seekerId,
      interviewId,
      actorUserId: amId,
      actorAccountManagerId: amId,
      sourceChannel: "am_portal",
      sourceRecordType: `interview_outcome:${outcome}`,
      sourceRecordId: interviewId,
      metadata: {
        outcome,
        offer_amount: offer_amount || null,
        hire_date: hire_date || null,
        rejection_reason: rejection_reason || null,
      },
    },
  ];

  if (outcome === "hired") {
    outcomeWrites.push({
      eventType: "placement_confirmed",
      occurredAt: hire_date || updated?.outcome_recorded_at || nowIso,
      jobSeekerId: seekerId,
      interviewId,
      actorUserId: amId,
      actorAccountManagerId: amId,
      sourceChannel: "am_portal",
      sourceRecordType: "interview_placement",
      sourceRecordId: interviewId,
      metadata: {
        outcome,
        offer_amount: offer_amount || null,
        hire_date: hire_date || null,
      },
    });
  }

  try {
    await writeOutcomeEvents(outcomeWrites);
  } catch (err) {
    console.error("[outcomes] interview outcome shadow writes failed:", err);
  }

  return NextResponse.json({ interview: updated });
}
