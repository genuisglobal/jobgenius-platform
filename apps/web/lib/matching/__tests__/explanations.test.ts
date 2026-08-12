import { describe, expect, it } from "vitest";
import {
  buildAdjacentOpportunity,
  buildMatchExplanation,
} from "../explanations";

function buildReasons(penaltyReasons: string[] = []) {
  return {
    component_scores: {
      skills: {
        score: 20,
        max: 35,
        details: {
          matched_required: ["python", "sql"],
          matched_preferred: [],
          missing_required: [],
          coverage_pct: 60,
        },
      },
      title: {
        score: 0,
        max: 20,
        details: {
          matched_titles: [],
          partial_matches: [],
        },
      },
      experience: {
        score: 10,
        max: 10,
        details: {
          seeker_years: 5,
          job_min: 3,
          job_max: 7,
          match_type: "exact",
        },
      },
      salary: {
        score: 6,
        max: 10,
        details: {
          seeker_min: 100000,
          seeker_max: 130000,
          job_min: 95000,
          job_max: 120000,
          overlap_pct: 60,
          match_type: "partial",
        },
      },
      location: {
        score: 15,
        max: 15,
        details: {
          seeker_location: "Remote",
          seeker_work_type: "remote",
          job_location: "Remote",
          job_work_type: "remote",
          match_type: "remote",
        },
      },
      company_fit: {
        score: 5,
        max: 10,
        details: {
          industry_match: true,
          size_match: false,
          seeker_industries: ["technology"],
          job_industry: "technology",
        },
      },
      penalties: {
        score: -10,
        max: 15,
        details: {
          reasons: penaltyReasons,
          excluded_keywords_found: [],
          visa_mismatch: false,
        },
      },
    },
  };
}

describe("buildAdjacentOpportunity", () => {
  it("marks below-threshold title mismatches as adjacent when underlying fit is strong", () => {
    const adjacent = buildAdjacentOpportunity(buildReasons(["title_mismatch"]), {
      score: 52,
      threshold: 60,
      recommendation: "marginal",
    });

    expect(adjacent.eligible).toBe(true);
    expect(adjacent.headline).toBeTruthy();
    expect(adjacent.supportingReasons.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects matches with hard blockers even if score is near threshold", () => {
    const adjacent = buildAdjacentOpportunity(
      buildReasons(["title_mismatch", "visa_sponsorship_not_offered"]),
      {
        score: 52,
        threshold: 60,
        recommendation: "marginal",
      }
    );

    expect(adjacent.eligible).toBe(false);
  });
});

describe("buildMatchExplanation", () => {
  it("does not hard-block queueing for title mismatch alone", () => {
    const explanation = buildMatchExplanation(buildReasons(["title_mismatch"]), {
      score: 52,
      recommendation: "marginal",
    });

    expect(explanation.queueBlocked).toBe(false);
    expect(explanation.cautions).toContain(
      "Job title does not match the seeker's target role family"
    );
  });

  it("still hard-blocks visa sponsorship mismatches", () => {
    const explanation = buildMatchExplanation(
      buildReasons(["visa_sponsorship_not_offered"]),
      {
        score: 58,
        recommendation: "good_match",
      }
    );

    expect(explanation.queueBlocked).toBe(true);
    expect(explanation.queueBlockCode).toBe("visa_sponsorship_not_offered");
  });
});
