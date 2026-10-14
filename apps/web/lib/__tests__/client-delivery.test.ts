import { describe, expect, it } from "vitest";
import {
  buildClientDeliveryBoardSummary,
  calculateDaysSinceTimestamp,
  compareClientDeliverySnapshots,
  deriveDeliveryNeedsAttention,
  type ClientDeliverySnapshotRecord,
} from "../client-delivery";

function makeSnapshot(
  overrides: Partial<ClientDeliverySnapshotRecord> = {}
): ClientDeliverySnapshotRecord {
  return {
    caseId: "case-1",
    jobSeekerId: "seeker-1",
    accountManagerId: "am-1",
    fullName: "Alex Candidate",
    email: "alex@example.com",
    location: "New York, NY",
    seniority: "mid",
    targetTitles: ["Backend Engineer"],
    intakeStatus: "active_client",
    workStarted: true,
    paymentStatus: "complete",
    amountPaid: 500,
    totalAmount: 500,
    paymentDeadline: null,
    systemStage: "active_search",
    effectiveStage: "active_search",
    stageOverride: null,
    riskLevel: "low",
    paused: false,
    lastApplicationAt: "2026-06-15T10:00:00.000Z",
    applications7d: 4,
    applications30d: 12,
    openApplicationRuns: 1,
    openQueueCount: 2,
    lastOutreachAt: "2026-06-15T09:00:00.000Z",
    nextFollowUpAt: null,
    activeThreadCount: 1,
    followUpsDueCount: 0,
    nextInterviewAt: null,
    openInterviewCount: 0,
    prepCount: 0,
    lastOfferAt: null,
    hasOpenOffer: false,
    hasPlacedOffer: false,
    nextStartDate: null,
    hasPaymentHold: false,
    hasActiveEscalation: false,
    activeBlockerCount: 0,
    activeBlockerTitles: [],
    nextActionType: "application_push",
    nextActionTitle: "Push new applications",
    nextActionNotes: "",
    nextActionDueAt: null,
    nextActionCompletedAt: null,
    nextActionCompletedBy: null,
    managerNotes: "",
    lastManualReviewAt: null,
    overdueNextAction: false,
    lastTouchAt: "2026-06-15T12:00:00.000Z",
    daysSinceLastTouch: 1,
    healthScore: 88,
    healthBand: "healthy",
    staleStatus: "none",
    staleSinceAt: null,
    escalationStatus: "none",
    escalatedAt: null,
    managerReviewedAt: null,
    latestEscalationReason: null,
    latestEscalationOpenedAt: null,
    hasActiveEscalationRecord: false,
    overdueBlockerCount: 0,
    criticalOverdueBlockerCount: 0,
    blockerMaxAgeDays: 0,
    daysSinceLastApplication: 1,
    daysSinceLastManualReview: null,
    needsManagerReview: false,
    needsAttention: false,
    caseCreatedAt: "2026-06-01T09:00:00.000Z",
    caseUpdatedAt: "2026-06-15T12:00:00.000Z",
    ...overrides,
  };
}

describe("client delivery helpers", () => {
  it("calculates day gaps from timestamps", () => {
    const now = new Date("2026-06-16T12:00:00.000Z");
    expect(
      calculateDaysSinceTimestamp("2026-06-15T12:00:00.000Z", now)
    ).toBe(1);
    expect(calculateDaysSinceTimestamp("2026-06-16T13:00:00.000Z", now)).toBe(0);
    expect(calculateDaysSinceTimestamp(null, now)).toBeNull();
  });

  it("flags attention for overdue or high-risk delivery cases", () => {
    const now = new Date("2026-06-16T12:00:00.000Z");

    expect(
      deriveDeliveryNeedsAttention({
        riskLevel: "low",
        activeBlockerCount: 0,
        hasPaymentHold: false,
        hasActiveEscalation: false,
        nextActionDueAt: "2026-06-16T10:00:00.000Z",
        nextActionCompletedAt: null,
        daysSinceLastTouch: 1,
        now,
      })
    ).toBe(true);

    expect(
      deriveDeliveryNeedsAttention({
        riskLevel: "critical",
        activeBlockerCount: 0,
        hasPaymentHold: false,
        hasActiveEscalation: false,
        daysSinceLastTouch: 0,
        now,
      })
    ).toBe(true);

    expect(
      deriveDeliveryNeedsAttention({
        riskLevel: "low",
        activeBlockerCount: 0,
        hasPaymentHold: false,
        hasActiveEscalation: false,
        daysSinceLastTouch: 2,
        now,
      })
    ).toBe(false);
  });

  it("sorts attention-heavy rows ahead of normal rows", () => {
    const staleCritical = makeSnapshot({
      fullName: "Critical Casey",
      riskLevel: "critical",
      needsAttention: true,
      overdueNextAction: true,
      daysSinceLastTouch: 6,
    });
    const healthy = makeSnapshot({
      jobSeekerId: "seeker-2",
      fullName: "Healthy Harper",
      needsAttention: false,
      riskLevel: "low",
      daysSinceLastTouch: 0,
    });

    const rows = [healthy, staleCritical].sort(compareClientDeliverySnapshots);
    expect(rows[0].fullName).toBe("Critical Casey");
  });

  it("builds board summary counts by attention, stage, and risk", () => {
    const rows = [
      makeSnapshot({
        effectiveStage: "active_search",
        riskLevel: "low",
        needsAttention: false,
      }),
      makeSnapshot({
        jobSeekerId: "seeker-2",
        effectiveStage: "interviewing",
        riskLevel: "high",
        needsAttention: true,
        healthBand: "at_risk",
        healthScore: 48,
        staleStatus: "approaching_stale",
        overdueNextAction: true,
        activeBlockerCount: 1,
        overdueBlockerCount: 1,
      }),
      makeSnapshot({
        jobSeekerId: "seeker-3",
        effectiveStage: "offer",
        riskLevel: "critical",
        needsAttention: true,
        healthBand: "critical",
        healthScore: 28,
        staleStatus: "stale",
        hasPaymentHold: true,
        hasActiveEscalationRecord: true,
        escalationStatus: "needs_manager_review",
        needsManagerReview: true,
      }),
    ];

    expect(buildClientDeliveryBoardSummary(rows)).toEqual({
      totalCount: 3,
      needsAttentionCount: 2,
      overdueNextActionCount: 1,
      highRiskCount: 2,
      criticalHealthCount: 1,
      staleCount: 1,
      escalatedCount: 1,
      managerReviewCount: 1,
      activeBlockerCount: 1,
      paymentHoldCount: 1,
      stageCounts: {
        onboarding: 0,
        ready_to_launch: 0,
        active_search: 1,
        interviewing: 1,
        offer: 1,
        placed: 0,
        paused: 0,
      },
      riskCounts: {
        low: 1,
        medium: 0,
        high: 1,
        critical: 1,
      },
      healthBandCounts: {
        healthy: 1,
        watch: 0,
        at_risk: 1,
        critical: 1,
      },
      staleStatusCounts: {
        none: 1,
        approaching_stale: 1,
        stale: 1,
        severely_stale: 0,
      },
    });
  });
});
