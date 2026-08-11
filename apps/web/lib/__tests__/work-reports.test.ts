import { describe, expect, it } from "vitest";
import {
  buildDailyWorkMetricSummary,
  classifyFollowUpMessageIds,
  deriveWorkReportReviewState,
  normalizeWorkReportDate,
} from "../work-reports";

describe("work report helpers", () => {
  it("normalizes invalid dates to today", () => {
    const now = new Date("2026-06-16T18:30:00.000Z");
    expect(normalizeWorkReportDate("bad-date", now)).toBe("2026-06-16");
    expect(normalizeWorkReportDate(undefined, now)).toBe("2026-06-16");
    expect(normalizeWorkReportDate("2026-06-01", now)).toBe("2026-06-01");
  });

  it("classifies only repeat outbound thread touches as follow-ups", () => {
    const allMessages = [
      {
        id: "m1",
        recruiterThreadId: "thread-1",
        createdAt: "2026-06-16T09:00:00.000Z",
        stepNumber: 1,
      },
      {
        id: "m2",
        recruiterThreadId: "thread-1",
        createdAt: "2026-06-16T13:00:00.000Z",
        stepNumber: 2,
      },
      {
        id: "m3",
        recruiterThreadId: "thread-2",
        createdAt: "2026-06-16T10:00:00.000Z",
        stepNumber: null,
      },
      {
        id: "m4",
        recruiterThreadId: "thread-2",
        createdAt: "2026-06-16T16:00:00.000Z",
        stepNumber: null,
      },
    ];

    const followUps = classifyFollowUpMessageIds(allMessages, allMessages);

    expect(followUps.has("m1")).toBe(false);
    expect(followUps.has("m2")).toBe(true);
    expect(followUps.has("m3")).toBe(false);
    expect(followUps.has("m4")).toBe(true);
  });

  it("builds split totals for system and manual work", () => {
    const summary = buildDailyWorkMetricSummary({
      automatedApplications: 8,
      manualApplications: 3,
      systemFollowUps: 5,
      manualFollowUps: 1,
      systemInterviews: 2,
      manualInterviews: 1,
      systemOffers: 1,
      manualOffers: 0,
    });

    expect(summary.applications).toEqual({ system: 8, manual: 3, total: 11 });
    expect(summary.followUps).toEqual({ system: 5, manual: 1, total: 6 });
    expect(summary.systemTotal).toBe(16);
    expect(summary.manualTotal).toBe(5);
    expect(summary.grandTotal).toBe(21);
  });

  it("derives missing vs draft vs reviewed states cleanly", () => {
    expect(deriveWorkReportReviewState({ hasReport: false })).toBe("missing");
    expect(deriveWorkReportReviewState({ hasReport: true })).toBe("draft");
    expect(deriveWorkReportReviewState({ hasReport: true, status: "draft" })).toBe("draft");
    expect(deriveWorkReportReviewState({ hasReport: true, status: "submitted" })).toBe(
      "submitted"
    );
    expect(deriveWorkReportReviewState({ hasReport: true, status: "locked" })).toBe("locked");
  });
});
