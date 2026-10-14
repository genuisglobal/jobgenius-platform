import {
  type ClientDeliveryEscalationStatus,
  type ClientDeliveryHealthBand,
  type ClientDeliveryRiskLevel,
  type ClientDeliveryStaleStatus,
} from "@/lib/client-delivery";

export const DELIVERY_STALE_WARNING_DAYS = 4;
export const DELIVERY_STALE_DAYS = 5;
export const DELIVERY_SEVERE_STALE_DAYS = 8;
export const DELIVERY_PAUSED_WARNING_DAYS = 7;
export const DELIVERY_PAUSED_STALE_DAYS = 14;
export const DELIVERY_HIGH_RISK_REVIEW_DAYS = 7;
export const DELIVERY_CRITICAL_BLOCKER_OVERDUE_DAYS = 3;
export const DELIVERY_MANAGER_REVIEW_GRACE_HOURS = 48;

export type DeliveryBlockerDueState =
  | "not_due"
  | "due_soon"
  | "overdue"
  | "critical_overdue";

export type DeliveryBlockerSignals = {
  activeBlockerCount: number;
  overdueBlockerCount: number;
  criticalOverdueBlockerCount: number;
  blockerMaxAgeDays: number;
};

export type DeliveryHealthInput = {
  effectiveStage: string;
  riskLevel: ClientDeliveryRiskLevel;
  paused: boolean;
  overdueNextAction: boolean;
  activeBlockerCount: number;
  overdueBlockerCount: number;
  criticalOverdueBlockerCount: number;
  hasPaymentHold: boolean;
  hasActiveEscalation: boolean;
  applications7d: number;
  nextInterviewAt: string | null;
  hasOpenOffer: boolean;
  daysSinceLastTouch: number;
  daysSinceLastApplication: number | null;
  daysSinceLastManualReview: number | null;
  nextFollowUpAt: string | null;
  now?: Date;
};

export type DeliveryStaleInput = {
  paused: boolean;
  hasPlacedOffer: boolean;
  daysSinceLastTouch: number;
  daysSinceLastApplication: number | null;
  applications7d: number;
  lastManualReviewAt: string | null;
  overdueNextAction: boolean;
  activeThreadCount?: number;
  effectiveStage?: string;
  now?: Date;
};

function isPastDue(value: string | null | undefined, now = new Date()): boolean {
  if (!value) return false;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return false;
  return parsed <= now.getTime();
}

export function deriveBlockerAgeDays(
  createdAt: string,
  now = new Date()
): number {
  const parsed = Date.parse(createdAt);
  if (Number.isNaN(parsed)) return 0;
  const diffMs = now.getTime() - parsed;
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / 86_400_000);
}

export function deriveBlockerDueState(
  dueAt: string | null,
  now = new Date()
): DeliveryBlockerDueState {
  if (!dueAt) return "not_due";
  const parsed = Date.parse(dueAt);
  if (Number.isNaN(parsed)) return "not_due";

  const diffMs = parsed - now.getTime();
  if (diffMs >= 0 && diffMs <= 24 * 60 * 60 * 1000) return "due_soon";
  if (diffMs < 0 && diffMs >= -DELIVERY_CRITICAL_BLOCKER_OVERDUE_DAYS * 86_400_000) {
    return "overdue";
  }
  if (diffMs < -DELIVERY_CRITICAL_BLOCKER_OVERDUE_DAYS * 86_400_000) {
    return "critical_overdue";
  }
  return "not_due";
}

export function deriveDeliveryStaleStatus(
  input: DeliveryStaleInput
): ClientDeliveryStaleStatus {
  if (input.hasPlacedOffer) return "none";

  if (input.paused) {
    if (input.daysSinceLastTouch >= DELIVERY_PAUSED_STALE_DAYS) return "stale";
    if (input.daysSinceLastTouch >= DELIVERY_PAUSED_WARNING_DAYS) {
      return "approaching_stale";
    }
    return "none";
  }

  if (input.daysSinceLastTouch >= DELIVERY_SEVERE_STALE_DAYS) {
    return "severely_stale";
  }
  if (input.daysSinceLastTouch >= DELIVERY_STALE_DAYS) {
    return "stale";
  }
  if (input.daysSinceLastTouch >= DELIVERY_STALE_WARNING_DAYS) {
    return "approaching_stale";
  }

  if (
    input.effectiveStage === "active_search" &&
    (input.daysSinceLastApplication ?? 0) >= DELIVERY_STALE_DAYS &&
    input.applications7d === 0
  ) {
    return "stale";
  }

  if (input.overdueNextAction && input.daysSinceLastTouch >= 2) {
    return "approaching_stale";
  }

  return "none";
}

export function computeDeliveryHealthScore(input: DeliveryHealthInput): number {
  if (input.effectiveStage === "placed") return 100;

  let score = 100;

  if (input.overdueNextAction) score -= 20;

  if (input.activeBlockerCount >= 3) score -= 25;
  else if (input.activeBlockerCount >= 2) score -= 15;
  else if (input.activeBlockerCount >= 1) score -= 8;

  if (input.overdueBlockerCount > 0) score -= 8;
  if (input.criticalOverdueBlockerCount > 0) score -= 15;
  if (input.hasPaymentHold) score -= 20;
  if (input.hasActiveEscalation) score -= 15;

  if (input.riskLevel === "medium") score -= 5;
  if (input.riskLevel === "high") score -= 12;
  if (input.riskLevel === "critical") score -= 20;

  if (
    input.effectiveStage === "active_search" &&
    (input.daysSinceLastApplication ?? 0) >= DELIVERY_STALE_DAYS &&
    input.applications7d === 0
  ) {
    score -= 15;
  }

  if (input.daysSinceLastTouch >= DELIVERY_SEVERE_STALE_DAYS) score -= 25;
  else if (input.daysSinceLastTouch >= DELIVERY_STALE_DAYS) score -= 15;

  if (input.nextFollowUpAt && isPastDue(input.nextFollowUpAt, input.now)) {
    score -= 8;
  }

  if (
    (input.riskLevel === "high" || input.riskLevel === "critical") &&
    (input.daysSinceLastManualReview ?? 0) >= DELIVERY_HIGH_RISK_REVIEW_DAYS
  ) {
    score -= 10;
  }

  if (input.applications7d >= 7) score += 10;
  else if (input.applications7d >= 3) score += 6;

  if (input.nextInterviewAt) {
    const nextInterviewAt = Date.parse(input.nextInterviewAt);
    if (
      !Number.isNaN(nextInterviewAt) &&
      nextInterviewAt >= (input.now ?? new Date()).getTime() &&
      nextInterviewAt <= (input.now ?? new Date()).getTime() + 7 * 86_400_000
    ) {
      score += 8;
    }
  }

  if (input.hasOpenOffer && !input.hasPaymentHold) {
    score = Math.max(score, 70);
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function deriveDeliveryHealthBand(
  score: number
): ClientDeliveryHealthBand {
  if (score >= 80) return "healthy";
  if (score >= 60) return "watch";
  if (score >= 40) return "at_risk";
  return "critical";
}

export function deriveDeliveryNeedsManagerReview(args: {
  escalationStatus: ClientDeliveryEscalationStatus;
  healthBand: ClientDeliveryHealthBand;
  staleStatus: ClientDeliveryStaleStatus;
  criticalOverdueBlockerCount: number;
  hasPaymentHold: boolean;
  riskLevel: ClientDeliveryRiskLevel;
  daysSinceLastManualReview: number | null;
}): boolean {
  if (args.escalationStatus === "needs_manager_review") return true;
  if (args.healthBand === "critical") return true;
  if (args.staleStatus === "severely_stale") return true;
  if (args.criticalOverdueBlockerCount > 0) return true;
  if (args.hasPaymentHold && args.staleStatus !== "none") return true;
  if (
    (args.riskLevel === "high" || args.riskLevel === "critical") &&
    (args.daysSinceLastManualReview ?? 0) >= DELIVERY_HIGH_RISK_REVIEW_DAYS
  ) {
    return true;
  }
  return false;
}
