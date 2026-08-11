import { describe, expect, it } from "vitest";
import {
  calculatePermissionAllowanceSummary,
  calculateSocialFundBalance,
  calculatePermissionPolicyEndDate,
  calculatePermissionRequestDays,
  calculateWeightedScorecardTotal,
  calculateOnboardingCompletion,
  evaluateSocialLeadEligibility,
  evaluateLeadershipEligibility,
  getLatestProbationCheckpointDue,
  getMonthsCompletedSince,
  getNextCareerLevel,
  getProbationCheckpointLabel,
  isDateWithinNextHours,
  isAcceptedOfferReadyForBonus,
  mapCourseStatusToLeadershipStatus,
  mapTrialStatusToLeadershipStatus,
  type CareerLadderLevel,
  type ScorecardCategory,
} from "../people";
import {
  isFinanceRole,
  isPeopleManagerRole,
  normalizeAMRole,
} from "../auth/roles";

describe("people role helpers", () => {
  it("normalizes the new internal roles", () => {
    expect(normalizeAMRole("Operations Manager")).toBe("ops_manager");
    expect(normalizeAMRole("ops_manager")).toBe("ops_manager");
    expect(normalizeAMRole("Accountant")).toBe("accountant");
  });

  it("classifies people and finance access correctly", () => {
    expect(isPeopleManagerRole("ops_manager")).toBe(true);
    expect(isPeopleManagerRole("accountant")).toBe(false);
    expect(isFinanceRole("accountant")).toBe(true);
    expect(isFinanceRole("am")).toBe(false);
  });
});

describe("people progress helpers", () => {
  it("computes onboarding completion from acknowledgements and policies", () => {
    const completion = calculateOnboardingCompletion(
      {
        acknowledge_role_expectations: true,
        acknowledge_tentative_offer: true,
        acknowledge_probation_policy: true,
        acknowledge_bonus_policy: false,
        acknowledge_social_fund_policy: false,
        acknowledge_social_lead_policy: false,
        acknowledge_leadership_growth: false,
      },
      2,
      4
    );

    expect(completion).toBe(45);
  });

  it("returns the next ladder level by rank", () => {
    const levels: CareerLadderLevel[] = [
      {
        id: "1",
        slug: "trainee",
        title: "Trainee",
        department: "client_delivery",
        rank_order: 1,
        summary: null,
        requirements: [],
      },
      {
        id: "2",
        slug: "consultant",
        title: "Consultant",
        department: "client_delivery",
        rank_order: 2,
        summary: null,
        requirements: [],
      },
    ];

    expect(getNextCareerLevel(levels, "1")?.id).toBe("2");
    expect(getNextCareerLevel(levels, "2")).toBeNull();
  });

  it("calculates weighted scorecard totals", () => {
    const categories: ScorecardCategory[] = [
      {
        id: "a",
        slug: "task_execution_productivity",
        label: "Task execution and productivity",
        weight: 25,
        sort_order: 1,
      },
      {
        id: "b",
        slug: "quality_of_work",
        label: "Quality of work",
        weight: 20,
        sort_order: 2,
      },
      {
        id: "c",
        slug: "communication_reporting",
        label: "Communication and reporting",
        weight: 15,
        sort_order: 3,
      },
    ];

    const total = calculateWeightedScorecardTotal(
      [
        { category_id: "a", numeric_score: 80 },
        { category_id: "b", numeric_score: 90 },
        { category_id: "c", numeric_score: 70 },
      ],
      categories
    );

    expect(total).toBe(48.5);
  });

  it("derives probation checkpoint timing from tenure", () => {
    const now = new Date();
    const startDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1)
    )
      .toISOString()
      .slice(0, 10);

    expect(getMonthsCompletedSince(startDate)).toBeGreaterThanOrEqual(3);
    expect(getLatestProbationCheckpointDue(startDate, [1, 2])).toBe(3);
    expect(getProbationCheckpointLabel(4)).toContain("Month 4");
  });

  it("flags leadership eligibility from strong recent scorecards", () => {
    const eligible = evaluateLeadershipEligibility({
      recentTotals: [86, 84, 80],
      hasBlockingIssue: false,
    });
    expect(eligible.autoFlagged).toBe(true);
    expect(eligible.recommendedStatus).toBe("eligible_for_course");

    const blocked = evaluateLeadershipEligibility({
      recentTotals: [90, 88, 86],
      hasBlockingIssue: true,
    });
    expect(blocked.autoFlagged).toBe(false);
    expect(blocked.recommendedStatus).toBe("not_eligible");
  });

  it("maps course and trial stages into leadership pipeline states", () => {
    expect(mapCourseStatusToLeadershipStatus("approved")).toBe("eligible_for_course");
    expect(mapCourseStatusToLeadershipStatus("completed")).toBe("completed_course");
    expect(
      mapTrialStatusToLeadershipStatus({ status: "planned", finalDecision: null })
    ).toBe("ready_for_trial");
    expect(
      mapTrialStatusToLeadershipStatus({ status: "active", finalDecision: null })
    ).toBe("in_trial");
    expect(
      mapTrialStatusToLeadershipStatus({ status: "passed", finalDecision: null })
    ).toBe("promoted");
    expect(
      mapTrialStatusToLeadershipStatus({
        status: "failed",
        finalDecision: "under_observation",
      })
    ).toBe("under_observation");
  });

  it("requires verified offer checks before bonus readiness", () => {
    expect(
      isAcceptedOfferReadyForBonus({
        verificationStatus: "verified",
        backgroundCheckCompletedDate: "2026-06-01",
        clientStartDate: "2026-07-08",
      })
    ).toBe(true);

    expect(
      isAcceptedOfferReadyForBonus({
        verificationStatus: "pending_verification",
        backgroundCheckCompletedDate: "2026-06-01",
        clientStartDate: "2026-07-08",
      })
    ).toBe(false);
  });

  it("calculates social fund balance from contributions and reserved approvals", () => {
    expect(
      calculateSocialFundBalance({
        contributions: [{ amount: 40000 }, { amount: 20000 }],
        expenses: [
          { amount: 10000, status: "paid" },
          { amount: 5000, status: "approved" },
          { amount: 7000, status: "proposed" },
        ],
      })
    ).toEqual({
      contributed: 60000,
      spent: 10000,
      approvedReserved: 5000,
      balance: 45000,
    });
  });

  it("derives permission allowance windows and remaining days", () => {
    expect(calculatePermissionPolicyEndDate("2026-01-15", "six_months")).toBe(
      "2026-07-14"
    );
    expect(calculatePermissionPolicyEndDate("2026-01-15", "one_year")).toBe(
      "2027-01-14"
    );
    expect(calculatePermissionPolicyEndDate("2026-01-15", "two_years")).toBe(
      "2028-01-14"
    );

    expect(calculatePermissionRequestDays("2026-06-10", "2026-06-12")).toBe(3);
    expect(() => calculatePermissionRequestDays("2026-06-12", "2026-06-10")).toThrow(
      /End date must be on or after start date/i
    );

    expect(
      calculatePermissionAllowanceSummary({
        allowedDays: 14,
        requests: [
          { status: "approved", requested_days: 4, approved_days: 3 },
          { status: "pending", requested_days: 2, approved_days: null },
          { status: "cancelled", requested_days: 5, approved_days: null },
        ],
      })
    ).toEqual({
      allowedDays: 14,
      approvedDaysUsed: 3,
      pendingDays: 2,
      committedDays: 5,
      remainingDays: 9,
      overLimit: false,
    });
  });

  it("enforces the Social Lead eligibility gates", () => {
    expect(
      evaluateSocialLeadEligibility({
        tenureMonths: 5,
        averageScore: 78,
        hasActiveDisciplinaryIssue: false,
        hasIntegrityBlock: false,
        completedTerms: 1,
      })
    ).toEqual({
      eligible: true,
      reasons: [],
    });

    expect(
      evaluateSocialLeadEligibility({
        tenureMonths: 2,
        averageScore: 65,
        hasActiveDisciplinaryIssue: true,
        hasIntegrityBlock: false,
        completedTerms: 2,
      }).reasons
    ).toEqual([
      "Minimum 3 months with the company required.",
      "Average performance score must be at least 70%.",
      "Employee has an active disciplinary issue.",
      "Maximum of 2 Social Lead terms already reached.",
    ]);
  });

  it("detects dates that fall within the next reminder window", () => {
    const now = new Date("2026-06-05T12:00:00.000Z");

    expect(isDateWithinNextHours("2026-06-07T11:59:00.000Z", 48, now)).toBe(true);
    expect(isDateWithinNextHours("2026-06-07T12:01:00.000Z", 48, now)).toBe(false);
    expect(isDateWithinNextHours("2026-06-05T11:00:00.000Z", 48, now)).toBe(false);
    expect(isDateWithinNextHours(null, 48, now)).toBe(false);
  });
});
