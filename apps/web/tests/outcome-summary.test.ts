import { describe, it, expect } from "vitest";
import {
  summarizeOutcomes,
  MIN_SAMPLE,
  type OutcomeRow,
} from "@/lib/application-outcomes-summary";

function row(over: Partial<OutcomeRow>): OutcomeRow {
  return {
    outcome: "applied",
    resume_tailored: false,
    match_score: null,
    ats_type: null,
    account_manager_id: null,
    ai_answer_count: null,
    ...over,
  };
}

describe("summarizeOutcomes", () => {
  it("returns zeroed overall for no rows", () => {
    const s = summarizeOutcomes([]);
    expect(s.overall).toEqual({ applications: 0, interviews: 0, rate: null });
    expect(s.by_ats).toEqual([]);
  });

  it("suppresses the rate below MIN_SAMPLE", () => {
    const rows = Array.from({ length: MIN_SAMPLE - 1 }, () =>
      row({ outcome: "interview" })
    );
    expect(summarizeOutcomes(rows).overall.rate).toBeNull();
  });

  it("computes the rate at/above MIN_SAMPLE", () => {
    const rows = [
      ...Array.from({ length: MIN_SAMPLE }, () => row({ outcome: "interview" })),
      ...Array.from({ length: MIN_SAMPLE }, () => row({ outcome: "no_response" })),
    ];
    const s = summarizeOutcomes(rows);
    expect(s.overall.applications).toBe(MIN_SAMPLE * 2);
    expect(s.overall.interviews).toBe(MIN_SAMPLE);
    expect(s.overall.rate).toBeCloseTo(0.5, 5);
  });

  it("segments tailored vs untailored", () => {
    const rows = [
      ...Array.from({ length: MIN_SAMPLE }, () =>
        row({ resume_tailored: true, outcome: "interview" })
      ),
      ...Array.from({ length: MIN_SAMPLE }, () =>
        row({ resume_tailored: false, outcome: "no_response" })
      ),
    ];
    const s = summarizeOutcomes(rows);
    expect(s.by_tailored.tailored.rate).toBeCloseTo(1, 5);
    expect(s.by_tailored.untailored.rate).toBeCloseTo(0, 5);
  });

  it("segments AI-answer usage by presence of a count", () => {
    const rows = [
      row({ ai_answer_count: 3 }),
      row({ ai_answer_count: 0 }),
      row({ ai_answer_count: null }),
    ];
    const s = summarizeOutcomes(rows);
    expect(s.by_ai_usage.with_ai.applications).toBe(1);
    expect(s.by_ai_usage.without_ai.applications).toBe(2); // 0 and null both count as "without"
  });

  it("buckets score bands and sorts groups by volume", () => {
    const rows = [
      row({ match_score: 92 }),
      row({ match_score: 85 }),
      row({ match_score: 70 }),
      row({ match_score: 40 }),
      row({ match_score: null }),
    ];
    const s = summarizeOutcomes(rows);
    const top = s.by_score_band[0];
    expect(top.key).toBe("80+");
    expect(top.applications).toBe(2);
    expect(s.by_score_band.map((b) => b.key)).toContain("unknown");
  });
});
