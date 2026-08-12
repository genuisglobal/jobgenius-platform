import { createLogger } from "@/lib/logger";
import { supabaseAdmin } from "@/lib/auth";

const log = createLogger("audit");

type AuditAction =
  | "account.approve"
  | "account.reject"
  | "account.update"
  | "account.convert"
  | "account.delete"
  | "assignment.create"
  | "assignment.delete"
  | "assignment.bulk"
  | "billing.acknowledge_payment"
  | "billing.escalation"
  | "billing.settings_update"
  | "billing.offer_confirm"
  | "billing.flex_review"
  | "billing.payment_details"
  | "lead.import"
  | "broadcast.send"
  | "referral.update"
  | "recruiter_partner.send_workspace_link"
  | "intake.approve"
  | "intake.activate_override"
  | "intake.mark_call_complete"
  | "intake.waitlist"
  | "intake.reject"
  | "intake.start_preview"
  | "intake.expire_preview"
  | "job_agent.trigger"
  | "career_crawl.trigger"
  | "promote_jobs.run"
  | "voice.playbook_create"
  | "voice.playbook_update"
  | "voice.dispatch"
  | "reports.settings_update"
  | "people.employee_create"
  | "people.employee_update"
  | "people.permission_policy_update"
  | "people.permission_request_submit"
  | "people.permission_request_update"
  | "people.onboarding_submit"
  | "people.onboarding_review"
  | "people.policy_acknowledge"
  | "people.scorecard_update"
  | "people.scorecard_acknowledge"
  | "people.probation_review_update"
  | "people.disciplinary_record_update"
  | "people.leadership_recalculate"
  | "people.leadership_course_update"
  | "people.leadership_trial_update"
  | "people.leader_of_month_update"
  | "people.accepted_offer_update"
  | "people.bonus_update"
  | "people.social_fund_expense_update"
  | "people.social_event_update"
  | "people.social_election_update"
  | "people.social_candidate_update"
  | "people.social_vote_cast"
  | "people.social_term_update"
  | "delivery.case_update"
  | "delivery.case_review"
  | "delivery.blocker_create"
  | "delivery.blocker_update"
  | "delivery.escalation_create"
  | "delivery.escalation_update";

export interface AuditParams {
  adminId: string;
  adminEmail?: string;
  adminRole?: string;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

/**
 * Log an admin action.
 *
 * Writes both:
 *   1. Structured console JSON (queryable in Vercel Logs by module:"audit")
 *   2. A row in `audit_logs` (migration 078) for persistent forensics.
 *
 * Non-blocking — never throws. DB insert failures are logged and swallowed.
 */
export async function logAdminAction(params: AuditParams): Promise<void> {
  try {
    log.info(`admin:${params.action}`, {
      admin_id: params.adminId,
      admin_email: params.adminEmail,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId,
      ...params.details,
    });
  } catch {
    // Swallow console failure
  }

  try {
    const { error } = await supabaseAdmin.from("audit_logs").insert({
      actor_id: params.adminId,
      actor_email: params.adminEmail ?? null,
      actor_role: params.adminRole ?? null,
      action: params.action,
      target_type: params.targetType ?? null,
      target_id: params.targetId ?? null,
      details: params.details ?? {},
      ip: params.ip ?? null,
      user_agent: params.userAgent ?? null,
    });
    if (error) {
      // Persist failure to console so we can detect it without breaking the request.
      log.warn("audit_logs insert failed", { action: params.action, error: error.message });
    }
  } catch (err) {
    log.warn("audit_logs insert threw", {
      action: params.action,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
