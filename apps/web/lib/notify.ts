import { supabaseAdmin } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

// ============================================================
// Notifications (migration 079).
//
// Durable record + queue for AM and job_seeker notifications.
// Channels:
//   - in_app : visible at /dashboard/notifications (Phase 1) and the
//              bell once integrated (follow-up).
//   - email  : drained by /api/cron/drain-notifications which calls
//              sendAndLogEmail.
//   - both   : insert + drain.
//
// Non-blocking by design — a notification failure must never break the
// triggering request (payslip update, application pause, etc.).
// ============================================================

const log = createLogger("notify");

export type NotificationChannel = "in_app" | "email" | "both";
export type NotificationUserType = "am" | "job_seeker";
export type NotificationStatus = "pending" | "sent" | "failed" | "read";

/** Stable category strings. Keep in sync with downstream consumers. */
export const NOTIFICATION_CATEGORIES = {
  payslip_issued: "payslip_issued",
  payslip_awaiting_sign: "payslip_awaiting_sign",
  payslip_paid: "payslip_paid",
  application_paused: "application_paused",
  interview_confirmed: "interview_confirmed",
  contract_sent: "contract_sent",
  ai_output_rejected: "ai_output_rejected",
  people_ops_review_digest: "people_ops_review_digest",
  social_lead_election_closing: "social_lead_election_closing",
  employee_scorecard_finalized: "employee_scorecard_finalized",
  employee_leadership_course_eligible: "employee_leadership_course_eligible",
  employee_leadership_course_updated: "employee_leadership_course_updated",
  employee_leadership_trial_updated: "employee_leadership_trial_updated",
  employee_probation_review_updated: "employee_probation_review_updated",
  employee_leader_of_month_selected: "employee_leader_of_month_selected",
  employee_social_candidate_approved: "employee_social_candidate_approved",
  employee_social_lead_selected: "employee_social_lead_selected",
  employee_social_nominations_open: "employee_social_nominations_open",
  employee_social_voting_open: "employee_social_voting_open",
  employee_offer_verified: "employee_offer_verified",
  people_bonus_pending_approval: "people_bonus_pending_approval",
  employee_bonus_payable_this_month: "employee_bonus_payable_this_month",
  employee_bonus_updated: "employee_bonus_updated",
  employee_social_fund_contribution_added: "employee_social_fund_contribution_added",
  people_permission_pending_review: "people_permission_pending_review",
  employee_permission_decision: "employee_permission_decision",
  work_report_missing: "work_report_missing",
  work_report_review_digest: "work_report_review_digest",
  delivery_next_action_overdue: "delivery_next_action_overdue",
  delivery_blocker_due: "delivery_blocker_due",
  delivery_case_stale: "delivery_case_stale",
  delivery_risk_review_due: "delivery_risk_review_due",
} as const;

export type NotificationCategory =
  (typeof NOTIFICATION_CATEGORIES)[keyof typeof NOTIFICATION_CATEGORIES];

export const INTERNAL_OPERATIONS_NOTIFICATION_CATEGORIES = [
  NOTIFICATION_CATEGORIES.people_ops_review_digest,
  NOTIFICATION_CATEGORIES.social_lead_election_closing,
  NOTIFICATION_CATEGORIES.employee_scorecard_finalized,
  NOTIFICATION_CATEGORIES.employee_leadership_course_eligible,
  NOTIFICATION_CATEGORIES.employee_leadership_course_updated,
  NOTIFICATION_CATEGORIES.employee_leadership_trial_updated,
  NOTIFICATION_CATEGORIES.employee_probation_review_updated,
  NOTIFICATION_CATEGORIES.employee_leader_of_month_selected,
  NOTIFICATION_CATEGORIES.employee_social_candidate_approved,
  NOTIFICATION_CATEGORIES.employee_social_lead_selected,
  NOTIFICATION_CATEGORIES.employee_social_nominations_open,
  NOTIFICATION_CATEGORIES.employee_social_voting_open,
  NOTIFICATION_CATEGORIES.employee_offer_verified,
  NOTIFICATION_CATEGORIES.people_bonus_pending_approval,
  NOTIFICATION_CATEGORIES.employee_bonus_payable_this_month,
  NOTIFICATION_CATEGORIES.employee_bonus_updated,
  NOTIFICATION_CATEGORIES.employee_social_fund_contribution_added,
  NOTIFICATION_CATEGORIES.people_permission_pending_review,
  NOTIFICATION_CATEGORIES.employee_permission_decision,
  NOTIFICATION_CATEGORIES.work_report_missing,
  NOTIFICATION_CATEGORIES.work_report_review_digest,
  NOTIFICATION_CATEGORIES.delivery_next_action_overdue,
  NOTIFICATION_CATEGORIES.delivery_blocker_due,
  NOTIFICATION_CATEGORIES.delivery_case_stale,
  NOTIFICATION_CATEGORIES.delivery_risk_review_due,
] as const;

export function getNotificationCategoryLabel(category: string): string {
  switch (category) {
    case NOTIFICATION_CATEGORIES.people_ops_review_digest:
      return "People Ops review digest";
    case NOTIFICATION_CATEGORIES.social_lead_election_closing:
      return "Social Lead closing reminder";
    case NOTIFICATION_CATEGORIES.employee_scorecard_finalized:
      return "Scorecard finalized";
    case NOTIFICATION_CATEGORIES.employee_leadership_course_eligible:
      return "Leadership course eligible";
    case NOTIFICATION_CATEGORIES.employee_leadership_course_updated:
      return "Leadership course updated";
    case NOTIFICATION_CATEGORIES.employee_leadership_trial_updated:
      return "Leadership trial updated";
    case NOTIFICATION_CATEGORIES.employee_probation_review_updated:
      return "Probation review updated";
    case NOTIFICATION_CATEGORIES.employee_leader_of_month_selected:
      return "Leader of the Month selected";
    case NOTIFICATION_CATEGORIES.employee_social_candidate_approved:
      return "Social Lead candidate approved";
    case NOTIFICATION_CATEGORIES.employee_social_lead_selected:
      return "Social Lead selected";
    case NOTIFICATION_CATEGORIES.employee_social_nominations_open:
      return "Social nominations open";
    case NOTIFICATION_CATEGORIES.employee_social_voting_open:
      return "Social voting open";
    case NOTIFICATION_CATEGORIES.employee_offer_verified:
      return "Accepted offer verified";
    case NOTIFICATION_CATEGORIES.people_bonus_pending_approval:
      return "Bonus pending approval";
    case NOTIFICATION_CATEGORIES.employee_bonus_payable_this_month:
      return "Bonus payable this month";
    case NOTIFICATION_CATEGORIES.employee_bonus_updated:
      return "Bonus updated";
    case NOTIFICATION_CATEGORIES.employee_social_fund_contribution_added:
      return "Social fund contribution added";
    case NOTIFICATION_CATEGORIES.people_permission_pending_review:
      return "Permission request pending review";
    case NOTIFICATION_CATEGORIES.employee_permission_decision:
      return "Permission request updated";
    case NOTIFICATION_CATEGORIES.work_report_missing:
      return "Daily work report reminder";
    case NOTIFICATION_CATEGORIES.work_report_review_digest:
      return "Work report review digest";
    case NOTIFICATION_CATEGORIES.delivery_next_action_overdue:
      return "Delivery next action overdue";
    case NOTIFICATION_CATEGORIES.delivery_blocker_due:
      return "Delivery blocker due";
    case NOTIFICATION_CATEGORIES.delivery_case_stale:
      return "Delivery case stale";
    case NOTIFICATION_CATEGORIES.delivery_risk_review_due:
      return "High-risk delivery review due";
    default:
      return category
        .replace(/_/g, " ")
        .replace(/\b\w/g, (value) => value.toUpperCase());
  }
}

export interface SendNotificationInput {
  userId: string;
  userType: NotificationUserType;
  category: NotificationCategory | string;
  subject: string;
  body?: string | null;
  linkUrl?: string | null;
  /** Defaults to 'in_app'. Use 'email' or 'both' to enqueue email delivery. */
  channel?: NotificationChannel;
  payload?: Record<string, unknown>;
}

export interface SendNotificationResult {
  /** May be null on insert failure — non-blocking by design. */
  id: string | null;
  channel: NotificationChannel;
}

/**
 * Enqueue a notification. Returns immediately; email delivery is async
 * via the drain-notifications cron.
 */
export async function sendNotification(
  input: SendNotificationInput
): Promise<SendNotificationResult> {
  const channel: NotificationChannel = input.channel ?? "in_app";

  try {
    const { data, error } = await supabaseAdmin
      .from("notifications")
      .insert({
        user_id: input.userId,
        user_type: input.userType,
        channel,
        category: input.category,
        subject: input.subject,
        body: input.body ?? null,
        link_url: input.linkUrl ?? null,
        payload: input.payload ?? {},
        // in_app-only rows are considered delivered the moment they're saved.
        status: channel === "in_app" ? "sent" : "pending",
        sent_at: channel === "in_app" ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (error) {
      log.warn("notification insert failed", {
        category: input.category,
        userType: input.userType,
        error: error.message,
      });
      return { id: null, channel };
    }
    return { id: data.id as string, channel };
  } catch (err) {
    log.warn("notification insert threw", {
      category: input.category,
      error: err instanceof Error ? err.message : String(err),
    });
    return { id: null, channel };
  }
}

/**
 * Mark a single notification read for the given user. Ownership-checked.
 */
export async function markRead(
  id: string,
  userId: string,
  userType: NotificationUserType
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("user_type", userType)
    .not("status", "eq", "read")
    .select("id")
    .maybeSingle();
  if (error) {
    log.warn("markRead failed", { id, error: error.message });
    return false;
  }
  return Boolean(data);
}

/**
 * Mark every unread notification read for the given user. Returns count.
 */
export async function markAllRead(
  userId: string,
  userType: NotificationUserType
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("user_type", userType)
    .not("status", "eq", "read")
    .select("id");
  if (error) {
    log.warn("markAllRead failed", { userId, error: error.message });
    return 0;
  }
  return (data ?? []).length;
}

/**
 * Best-effort email-address lookup. Used by the drain cron.
 */
export async function resolveRecipientEmail(
  userId: string,
  userType: NotificationUserType
): Promise<string | null> {
  if (userType === "am") {
    const { data } = await supabaseAdmin
      .from("account_managers")
      .select("email")
      .eq("id", userId)
      .maybeSingle();
    return data?.email ?? null;
  }
  const { data } = await supabaseAdmin
    .from("job_seekers")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  return data?.email ?? null;
}
