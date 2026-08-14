import { describe, it, expect } from "vitest";
import {
  getWeekStart,
  toIsoDate,
  formatReportMessage,
  shapeWeeklyStats,
  type WeeklyStats,
} from "@/lib/client-reports";

describe("getWeekStart", () => {
  it("returns the Monday (UTC) of the containing week", () => {
    // 2026-07-10 is a Friday → Monday is 2026-07-06.
    expect(toIsoDate(getWeekStart(new Date("2026-07-10T15:30:00Z")))).toBe("2026-07-06");
    // Monday maps to itself.
    expect(toIsoDate(getWeekStart(new Date("2026-07-06T00:00:00Z")))).toBe("2026-07-06");
    // Sunday belongs to the week that STARTED the previous Monday.
    expect(toIsoDate(getWeekStart(new Date("2026-07-12T23:00:00Z")))).toBe("2026-07-06");
  });
});

describe("shapeWeeklyStats", () => {
  it("joins runs to job posts and counts the rest", () => {
    const stats = shapeWeeklyStats(new Date("2026-07-06T00:00:00Z"), {
      completedRuns: [
        { job_post_id: "post-1" },
        { job_post_id: "post-2" },
        { job_post_id: null }, // orphaned run still counts as submitted
      ],
      jobPostsById: new Map([
        ["post-1", { title: "Data Analyst", company: "Acme" }],
        ["post-2", { title: "BI Engineer", company: "Globex" }],
      ]),
      inProgressCount: 4,
      needsAttentionCount: 1,
      interviews: [{ scheduled_at: "2026-07-08T17:00:00Z" }, { scheduled_at: null }],
      recruiterReplies: 2,
    });

    expect(stats.week_start).toBe("2026-07-06");
    expect(stats.applications_submitted).toBe(3);
    expect(stats.companies).toEqual([
      { company: "Acme", title: "Data Analyst" },
      { company: "Globex", title: "BI Engineer" },
    ]);
    expect(stats.in_progress).toBe(4);
    expect(stats.needs_attention).toBe(1);
    expect(stats.interviews_scheduled).toBe(2);
    expect(stats.interviews).toEqual([{ scheduled_at: "2026-07-08T17:00:00Z" }]);
    expect(stats.recruiter_replies).toBe(2);
  });
});

describe("formatReportMessage", () => {
  const stats: WeeklyStats = {
    week_start: "2026-07-06",
    applications_submitted: 2,
    companies: [
      { company: "Acme", title: "Data Analyst" },
      { company: "Globex", title: "BI Engineer" },
    ],
    in_progress: 3,
    needs_attention: 0,
    interviews_scheduled: 1,
    interviews: [{ scheduled_at: "2026-07-08T17:00:00Z" }],
    recruiter_replies: 1,
  };

  it("addresses the seeker by first name and includes the numbers", () => {
    const message = formatReportMessage({ seekerName: "Ada Lovelace", stats });
    expect(message).toContain("Hi Ada,");
    expect(message).toContain("week of July 6");
    expect(message).toContain("Applications submitted: 2");
    expect(message).toContain("Data Analyst @ Acme");
    expect(message).toContain("Interviews scheduled: 1");
    expect(message).toContain("Recruiter replies received: 1");
  });

  it("includes the AM note when present and omits the section when absent", () => {
    const withNote = formatReportMessage({
      seekerName: "Ada",
      stats,
      amNote: "Great momentum this week — let's prep for the Acme interview.",
    });
    expect(withNote).toContain("A note from your account manager:");
    expect(withNote).toContain("Great momentum this week");

    const withoutNote = formatReportMessage({ seekerName: "Ada", stats });
    expect(withoutNote).not.toContain("A note from your account manager:");
  });

  it("omits zero-count sections instead of reporting zeros", () => {
    const quiet: WeeklyStats = {
      ...stats,
      companies: [],
      applications_submitted: 0,
      interviews_scheduled: 0,
      recruiter_replies: 0,
      in_progress: 0,
    };
    const message = formatReportMessage({ seekerName: "Ada", stats: quiet });
    expect(message).toContain("Applications submitted: 0"); // headline stays honest
    expect(message).not.toContain("Interviews scheduled");
    expect(message).not.toContain("Recruiter replies");
  });

  it("caps the company list at 8 with an overflow line", () => {
    const many: WeeklyStats = {
      ...stats,
      applications_submitted: 12,
      companies: Array.from({ length: 12 }, (_, i) => ({
        company: `Company ${i}`,
        title: `Role ${i}`,
      })),
    };
    const message = formatReportMessage({ seekerName: "Ada", stats: many });
    expect(message).toContain("Role 7 @ Company 7");
    expect(message).not.toContain("Role 8 @ Company 8");
    expect(message).toContain("…and 4 more");
  });
});
