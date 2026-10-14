import { supabaseAdmin } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

// ============================================================
// AI HITL pipeline (ai_outputs, migration 079).
//
// Every AI-generated artifact that "ships" should pass through this
// library so we get: persistence, an audit trail tied back to
// ai_call_logs (Phase 0 PR-B), and an admin review surface.
//
// Two operating modes per call:
//   - autoApprove=true  -> status='auto_approved' immediately
//                         (existing behaviour; safe for low-risk content
//                         such as QA cards / quizzes / lessons today).
//                         The caller's downstream artifact is still
//                         created the same way it was before; the
//                         ai_outputs row is purely the audit trail.
//   - autoApprove=false -> status='pending', surfaces in
//                         /dashboard/admin/ai-outputs for human review.
//                         Caller stores the returned id and references it
//                         in its own table so approval can be wired up.
//
// Reviewer flow: approveAiOutput() / rejectAiOutput().
// On publish (artifact emitted), call markPublished() to close the loop.
// ============================================================

const log = createLogger("ai-outputs");

export type AiOutputKind =
  | "qa_card"
  | "quiz_card"
  | "lesson"
  | "outreach_draft"
  | "interview_followup"
  | "cover_letter"
  | "jobgenius_report"
  | "tailored_resume"
  | "other";

export type AiOutputStatus =
  | "pending"
  | "auto_approved"
  | "approved"
  | "rejected"
  | "published"
  | "expired";

export interface SubmitAiOutputInput {
  kind: AiOutputKind;
  payload: Record<string, unknown>;
  refType?: string | null;
  refId?: string | null;
  seekerId?: string | null;
  amId?: string | null;
  createdBy?: string | null;
  aiCallLogId?: string | null;
  /** ISO timestamp; if pending and unhandled by this time, status becomes 'expired'. */
  expiresAt?: string | null;
  /** When true, the row is written with status='auto_approved' and counts as already-reviewed. */
  autoApprove?: boolean;
}

export interface SubmitAiOutputResult {
  /** May be null on insert failure — non-blocking by design. Caller should still proceed. */
  id: string | null;
  status: AiOutputStatus;
}

/**
 * Submit an AI-generated output to the HITL pipeline.
 *
 * Non-blocking: a DB insert failure is logged and the function returns
 * { id: null, status }, so the caller's user-facing flow is never broken
 * by an HITL outage.
 */
export async function submitAiOutput(
  input: SubmitAiOutputInput
): Promise<SubmitAiOutputResult> {
  const status: AiOutputStatus = input.autoApprove ? "auto_approved" : "pending";

  try {
    const { data, error } = await supabaseAdmin
      .from("ai_outputs")
      .insert({
        kind: input.kind,
        payload: input.payload,
        ref_type: input.refType ?? null,
        ref_id: input.refId ?? null,
        seeker_id: input.seekerId ?? null,
        am_id: input.amId ?? null,
        created_by: input.createdBy ?? null,
        ai_call_log_id: input.aiCallLogId ?? null,
        expires_at: input.expiresAt ?? null,
        status,
        // For auto_approved rows, stamp the decision now so reviewer dashboards
        // can show "decided_at" consistently.
        decided_at: input.autoApprove ? new Date().toISOString() : null,
        reviewer_id: input.autoApprove ? input.amId ?? input.createdBy ?? null : null,
      })
      .select("id")
      .single();

    if (error) {
      log.warn("ai_outputs insert failed", {
        kind: input.kind,
        error: error.message,
      });
      return { id: null, status };
    }
    return { id: data.id as string, status };
  } catch (err) {
    log.warn("ai_outputs insert threw", {
      kind: input.kind,
      error: err instanceof Error ? err.message : String(err),
    });
    return { id: null, status };
  }
}

export interface DecisionInput {
  reviewerId: string;
  notes?: string;
}

/**
 * Approve a pending AI output. No-op if the row is already terminal
 * (rejected/published/expired).
 */
export async function approveAiOutput(
  id: string,
  decision: DecisionInput
): Promise<{ ok: boolean; status: AiOutputStatus | null }> {
  const { data, error } = await supabaseAdmin
    .from("ai_outputs")
    .update({
      status: "approved",
      reviewer_id: decision.reviewerId,
      decided_at: new Date().toISOString(),
      decision_notes: decision.notes ?? null,
    })
    .eq("id", id)
    .in("status", ["pending", "auto_approved"])
    .select("status")
    .maybeSingle();

  if (error) {
    log.warn("approveAiOutput failed", { id, error: error.message });
    return { ok: false, status: null };
  }
  if (!data) return { ok: false, status: null };
  return { ok: true, status: data.status as AiOutputStatus };
}

/**
 * Reject a pending AI output.
 */
export async function rejectAiOutput(
  id: string,
  decision: DecisionInput
): Promise<{ ok: boolean; status: AiOutputStatus | null }> {
  const { data, error } = await supabaseAdmin
    .from("ai_outputs")
    .update({
      status: "rejected",
      reviewer_id: decision.reviewerId,
      decided_at: new Date().toISOString(),
      decision_notes: decision.notes ?? null,
    })
    .eq("id", id)
    .in("status", ["pending", "auto_approved"])
    .select("status")
    .maybeSingle();

  if (error) {
    log.warn("rejectAiOutput failed", { id, error: error.message });
    return { ok: false, status: null };
  }
  if (!data) return { ok: false, status: null };
  return { ok: true, status: data.status as AiOutputStatus };
}

/**
 * Mark an approved/auto_approved output as having been shipped downstream
 * (e.g., an outreach email actually sent, a lesson actually published to the
 * seeker). The id can be left null and this is a no-op — callers don't have
 * to special-case the offline failure path.
 */
export async function markPublished(
  id: string | null,
  ref?: { refType?: string | null; refId?: string | null }
): Promise<void> {
  if (!id) return;
  try {
    const patch: Record<string, unknown> = { status: "published" };
    if (ref?.refType !== undefined) patch.ref_type = ref.refType;
    if (ref?.refId !== undefined) patch.ref_id = ref.refId;
    const { error } = await supabaseAdmin
      .from("ai_outputs")
      .update(patch)
      .eq("id", id)
      .in("status", ["approved", "auto_approved"]);
    if (error) {
      log.warn("markPublished failed", { id, error: error.message });
    }
  } catch (err) {
    log.warn("markPublished threw", {
      id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
