import { describe, it, expect } from "vitest";
import {
  selectRunsForReview,
  runHashFraction,
  readSampleRate,
  DEFAULT_SAMPLE_RATE,
  FIRST_RUNS_ALWAYS_SAMPLED,
  type SampleCandidate,
} from "@/lib/apply/qa-sampling";

function candidate(runId: string, seekerId: string, n: number): SampleCandidate {
  return { run_id: runId, job_seeker_id: seekerId, seeker_run_number: n };
}

describe("selectRunsForReview", () => {
  it("always samples a seeker's first 3 completed runs", () => {
    const candidates = [1, 2, 3].map((n) => candidate(`run-${n}`, "seeker-a", n));
    const decisions = selectRunsForReview(candidates, 0); // 0% random rate
    expect(decisions).toHaveLength(FIRST_RUNS_ALWAYS_SAMPLED);
    expect(decisions.every((d) => d.sampled_reason === "NEW_SEEKER_FIRST_RUNS")).toBe(true);
  });

  it("samples ~rate of later runs, deterministically per run id", () => {
    const candidates = Array.from({ length: 400 }, (_, i) =>
      candidate(`later-run-${i}`, "seeker-b", i + 10)
    );
    const first = selectRunsForReview(candidates, 0.05);
    const second = selectRunsForReview(candidates, 0.05);

    // Deterministic: reruns of the same window pick identical runs.
    expect(first.map((d) => d.run_id)).toEqual(second.map((d) => d.run_id));
    expect(first.every((d) => d.sampled_reason === "RANDOM_SAMPLE")).toBe(true);

    // Statistically near 5% (sha256 is uniform; 400 draws → generous bounds).
    expect(first.length).toBeGreaterThanOrEqual(5);
    expect(first.length).toBeLessThanOrEqual(50);
  });

  it("rate 0 samples nothing beyond the first-runs guarantee; rate 1 samples all", () => {
    const later = Array.from({ length: 20 }, (_, i) =>
      candidate(`r-${i}`, "seeker-c", i + 4)
    );
    expect(selectRunsForReview(later, 0)).toHaveLength(0);
    expect(selectRunsForReview(later, 1)).toHaveLength(20);
  });

  it("run 4 onward is never a NEW_SEEKER pick", () => {
    const decisions = selectRunsForReview([candidate("r", "s", 4)], 1);
    expect(decisions[0]?.sampled_reason).toBe("RANDOM_SAMPLE");
  });
});

describe("runHashFraction", () => {
  it("is stable and within [0, 1)", () => {
    const a = runHashFraction("some-run-id");
    expect(a).toBe(runHashFraction("some-run-id"));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(runHashFraction("other-run-id")).not.toBe(a);
  });
});

describe("readSampleRate", () => {
  it("clamps invalid env values to the default", () => {
    const original = process.env.QA_SAMPLE_RATE;
    try {
      process.env.QA_SAMPLE_RATE = "0.1";
      expect(readSampleRate()).toBe(0.1);
      process.env.QA_SAMPLE_RATE = "5"; // >1 — invalid
      expect(readSampleRate()).toBe(DEFAULT_SAMPLE_RATE);
      process.env.QA_SAMPLE_RATE = "banana";
      expect(readSampleRate()).toBe(DEFAULT_SAMPLE_RATE);
      delete process.env.QA_SAMPLE_RATE;
      expect(readSampleRate()).toBe(DEFAULT_SAMPLE_RATE);
    } finally {
      if (original === undefined) delete process.env.QA_SAMPLE_RATE;
      else process.env.QA_SAMPLE_RATE = original;
    }
  });
});
