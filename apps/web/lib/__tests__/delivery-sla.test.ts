import { describe, expect, it } from "vitest";
import {
  computeDeliveryHealthScore,
  deriveBlockerAgeDays,
  deriveBlockerDueState,
  deriveDeliveryHealthBand,
  deriveDeliveryNeedsManagerReview,
  deriveDeliveryStaleStatus,
} from "../delivery-sla";

describe("delivery SLA helpers", () => {
  it("classifies blocker due states and age", () => {
    const now = new Date("2026-06-21T12:00:00.000Z");

    expect(
      deriveBlockerDueState("2026-06-22T06:00:00.000Z", now)
    ).toBe("due_soon");
    expect(
      deriveBlockerDueState("2026-06-20T18:00:00.000Z", now)
    ).toBe("overdue");
    expect(
      deriveBlockerDueState("2026-06-17T12:00:00.000Z", now)
    ).toBe("critical_overdue");
    expect(
      deriveBlockerAgeDays("2026-06-18T12:00:00.000Z", now)
    ).toBe(3);
  });

  it("marks active search cases stale when touch and application momentum collapse", () => {
    expect(
      deriveDeliveryStaleStatus({
        paused: false,
        hasPlacedOffer: false,
        daysSinceLastTouch: 8,
        daysSinceLastApplication: 8,
        applications7d: 0,
        lastManualReviewAt: null,
        overdueNextAction: true,
        effectiveStage: "active_search",
      })
    ).toBe("severely_stale");

    expect(
      deriveDeliveryStaleStatus({
        paused: true,
        hasPlacedOffer: false,
        daysSinceLastTouch: 8,
        daysSinceLastApplication: null,
        applications7d: 0,
        lastManualReviewAt: null,
        overdueNextAction: false,
        effectiveStage: "paused",
      })
    ).toBe("approaching_stale");
  });

  it("computes health score and band from delivery penalties", () => {
    const score = computeDeliveryHealthScore({
      effectiveStage: "active_search",
      riskLevel: "critical",
      paused: false,
      overdueNextAction: true,
      activeBlockerCount: 3,
      overdueBlockerCount: 2,
      criticalOverdueBlockerCount: 1,
      hasPaymentHold: true,
      hasActiveEscalation: true,
      applications7d: 0,
      nextInterviewAt: null,
      hasOpenOffer: false,
      daysSinceLastTouch: 8,
      daysSinceLastApplication: 8,
      daysSinceLastManualReview: 9,
      nextFollowUpAt: "2026-06-18T12:00:00.000Z",
      now: new Date("2026-06-21T12:00:00.000Z"),
    });

    expect(score).toBeLessThan(40);
    expect(deriveDeliveryHealthBand(score)).toBe("critical");
  });

  it("flags manager review for severe stale and escalation states", () => {
    expect(
      deriveDeliveryNeedsManagerReview({
        escalationStatus: "needs_manager_review",
        healthBand: "watch",
        staleStatus: "none",
        criticalOverdueBlockerCount: 0,
        hasPaymentHold: false,
        riskLevel: "medium",
        daysSinceLastManualReview: 1,
      })
    ).toBe(true);

    expect(
      deriveDeliveryNeedsManagerReview({
        escalationStatus: "none",
        healthBand: "healthy",
        staleStatus: "none",
        criticalOverdueBlockerCount: 0,
        hasPaymentHold: false,
        riskLevel: "low",
        daysSinceLastManualReview: 1,
      })
    ).toBe(false);
  });
});
