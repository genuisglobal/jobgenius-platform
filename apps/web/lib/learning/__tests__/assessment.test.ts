import { describe, expect, it } from "vitest";

import {
  computeReviewSchedule,
  mergeAssessmentState,
  scoreAssessment,
} from "../assessment";

describe("learning assessment helpers", () => {
  it("scores assessment questions and marks completion when all answers are provided", () => {
    const result = scoreAssessment(
      [
        {
          question: "Which library powers the UI?",
          options: ["Django", "React", "Rails", "Laravel"],
          correct_index: 1,
          explanation: "React powers the UI.",
        },
        {
          question: "Which database is relational?",
          options: ["PostgreSQL", "Redis", "S3", "Kafka"],
          correct_index: 0,
          explanation: "PostgreSQL is relational.",
        },
      ],
      [1, 3]
    );

    expect(result.completed).toBe(true);
    expect(result.correctCount).toBe(1);
    expect(result.totalQuestions).toBe(2);
    expect(result.score).toBe(50);
    expect(result.questions[0].is_correct).toBe(true);
    expect(result.questions[1].is_correct).toBe(false);
  });

  it("merges saved answer state back into questions", () => {
    const merged = mergeAssessmentState(
      [
        {
          question: "What does API stand for?",
          options: ["Application Programming Interface", "Advanced Program Input"],
          correct_index: 0,
          explanation: "API stands for Application Programming Interface.",
        },
      ],
      [
        {
          user_answer: 0,
          is_correct: true,
          answered_at: "2026-03-12T00:00:00.000Z",
        },
      ]
    );

    expect(merged[0].user_answer).toBe(0);
    expect(merged[0].is_correct).toBe(true);
  });

  it("computes a longer review interval for stronger scores", () => {
    const low = computeReviewSchedule(60, 1, new Date("2026-03-12T00:00:00.000Z"));
    const high = computeReviewSchedule(95, 1, new Date("2026-03-12T00:00:00.000Z"));

    expect(low.reviewStage).toBe(0);
    expect(high.reviewStage).toBe(2);
    expect(new Date(high.nextReviewAt).getTime()).toBeGreaterThan(
      new Date(low.nextReviewAt).getTime()
    );
  });
});
