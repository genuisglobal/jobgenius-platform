import { describe, expect, it } from "vitest";

import {
  calculateLearningStreak,
  computeDashboardStats,
  computeTrackSummary,
  isDueReview,
} from "../dashboard-metrics";

describe("learning dashboard metrics", () => {
  it("detects due reviews from past review dates", () => {
    expect(isDueReview("2026-03-10T00:00:00.000Z", "2026-03-12T00:00:00.000Z")).toBe(true);
    expect(isDueReview("2026-03-15T00:00:00.000Z", "2026-03-12T00:00:00.000Z")).toBe(false);
  });

  it("calculates streaks from completed lesson dates", () => {
    const streak = calculateLearningStreak(
      [
        {
          lesson_id: "lesson-1",
          status: "completed",
          completed_at: "2026-03-12T09:00:00.000Z",
        },
        {
          lesson_id: "lesson-2",
          status: "completed",
          completed_at: "2026-03-11T09:00:00.000Z",
        },
      ],
      new Date("2026-03-12T12:00:00.000Z")
    );

    expect(streak).toBe(2);
  });

  it("summarizes due review and mastery signals per track and dashboard", () => {
    const tracks = [
      {
        id: "track-1",
        creation_mode: "job_gap_refresh",
        learning_lessons: [
          { id: "lesson-1", skill_slug: "react" },
          { id: "lesson-2", skill_slug: "sql" },
        ],
      },
    ];
    const progress = [
      {
        lesson_id: "lesson-1",
        status: "completed",
        completed_at: "2026-03-12T09:00:00.000Z",
        time_spent_seconds: 600,
        mastery_score: 82,
        next_review_at: "2026-03-10T00:00:00.000Z",
      },
      {
        lesson_id: "lesson-2",
        status: "in_progress",
        completed_at: null,
        time_spent_seconds: 420,
        mastery_score: 55,
        next_review_at: null,
      },
    ];

    const progressMap = new Map(progress.map((record) => [record.lesson_id, record]));
    const trackSummary = computeTrackSummary(
      tracks[0],
      progressMap,
      "2026-03-12T12:00:00.000Z"
    );
    const dashboardStats = computeDashboardStats(
      tracks,
      progress,
      new Date("2026-03-12T12:00:00.000Z")
    );

    expect(trackSummary.completedLessons).toBe(1);
    expect(trackSummary.dueReviewCount).toBe(1);
    expect(trackSummary.masteryAverage).toBe(69);
    expect(trackSummary.weakSkills[0]?.skill).toBe("Sql");

    expect(dashboardStats.totalTracks).toBe(1);
    expect(dashboardStats.totalLessons).toBe(2);
    expect(dashboardStats.completedLessons).toBe(1);
    expect(dashboardStats.dueReviewCount).toBe(1);
    expect(dashboardStats.masteryAverage).toBe(69);
  });
});
