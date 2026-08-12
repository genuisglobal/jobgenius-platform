import { describe, expect, it } from "vitest";
import {
  ACTIVITY_METRICS,
  INTERVIEW_METRICS,
  buildLeaderboard,
  coerceCount,
  coerceCounts,
  emptyCounts,
  getRangeBounds,
  interviewTotal,
  normalizeSheetDate,
  rowTotal,
  shiftSheetDate,
  sumCounts,
  type SheetRow,
} from "../activity-sheet";

function makeRow(overrides: Partial<SheetRow>): SheetRow {
  return {
    id: "row-1",
    entry_date: "2026-08-11",
    job_seeker_id: "seeker-1",
    seeker_name: "Meheza Prince",
    account_manager_id: "am-1",
    am_name: "Evina Francine",
    note: null,
    updated_at: null,
    ...emptyCounts(),
    ...overrides,
  };
}

describe("sheet dates", () => {
  it("normalizes invalid dates to today, local calendar", () => {
    const now = new Date(2026, 7, 11, 18, 30); // 11 Aug 2026, local
    expect(normalizeSheetDate("bad-date", now)).toBe("2026-08-11");
    expect(normalizeSheetDate(undefined, now)).toBe("2026-08-11");
    expect(normalizeSheetDate("2026-02-24", now)).toBe("2026-02-24");
  });

  it("shifts across month and year boundaries", () => {
    expect(shiftSheetDate("2026-08-11", -1)).toBe("2026-08-10");
    expect(shiftSheetDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftSheetDate("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("bounds a day, a Monday-anchored week, and a calendar month", () => {
    // 2026-08-11 is a Tuesday.
    expect(getRangeBounds("2026-08-11", "day")).toEqual({
      start: "2026-08-11",
      end: "2026-08-11",
    });
    expect(getRangeBounds("2026-08-11", "week")).toEqual({
      start: "2026-08-10",
      end: "2026-08-16",
    });
    expect(getRangeBounds("2026-08-11", "month")).toEqual({
      start: "2026-08-01",
      end: "2026-08-31",
    });
  });

  it("treats Sunday as the end of the week it closes, not the start of the next", () => {
    expect(getRangeBounds("2026-08-16", "week")).toEqual({
      start: "2026-08-10",
      end: "2026-08-16",
    });
  });
});

describe("cell input coercion", () => {
  it("accepts numbers and numeric strings", () => {
    expect(coerceCount(13)).toBe(13);
    expect(coerceCount("17")).toBe(17);
  });

  it("turns a cleared or unusable cell into 0 rather than failing the row", () => {
    expect(coerceCount("")).toBe(0);
    expect(coerceCount(null)).toBe(0);
    expect(coerceCount("abc")).toBe(0);
    expect(coerceCount(Number.NaN)).toBe(0);
  });

  it("clamps to the range the DB check constraint allows", () => {
    expect(coerceCount(-5)).toBe(0);
    expect(coerceCount(9999)).toBe(500);
    expect(coerceCount(4.7)).toBe(4);
  });

  it("fills every metric even when the body is partial", () => {
    expect(coerceCounts({ easy_applications: 3, offers: "1" })).toEqual({
      ...emptyCounts(),
      easy_applications: 3,
      offers: 1,
    });
  });
});

describe("totals", () => {
  it("sums a row across every metric", () => {
    expect(
      rowTotal({
        easy_applications: 17,
        company_applications: 13,
        follow_ups: 1,
        phone_interviews: 2,
        video_interviews: 1,
        offers: 0,
      })
    ).toBe(34);
  });

  it("sums rows metric by metric", () => {
    expect(
      sumCounts([
        { easy_applications: 3, phone_interviews: 1 },
        { easy_applications: 2, offers: 1 },
      ])
    ).toEqual({
      ...emptyCounts(),
      easy_applications: 5,
      phone_interviews: 1,
      offers: 1,
    });
  });
});

describe("interview types", () => {
  it("treats interviews as the sum of the three types, never a stored number", () => {
    expect(ACTIVITY_METRICS).not.toContain("interviews");
    expect(INTERVIEW_METRICS).toEqual([
      "phone_interviews",
      "ai_interviews",
      "video_interviews",
    ]);
    expect(
      interviewTotal({ phone_interviews: 2, ai_interviews: 1, video_interviews: 3 })
    ).toBe(6);
  });

  it("excludes non-interview metrics from the interview total", () => {
    expect(
      interviewTotal({ easy_applications: 40, follow_ups: 9, offers: 2, phone_interviews: 1 })
    ).toBe(1);
  });

  it("counts every interview type toward a row's grand total", () => {
    const counts = { phone_interviews: 1, ai_interviews: 1, video_interviews: 1 };
    expect(rowTotal(counts)).toBe(3);
    expect(rowTotal(counts)).toBe(interviewTotal(counts));
  });
});

describe("leaderboard", () => {
  it("ranks outcomes above volume", () => {
    const board = buildLeaderboard([
      makeRow({
        job_seeker_id: "s1",
        account_manager_id: "am-volume",
        am_name: "High Volume",
        easy_applications: 200,
        company_applications: 100,
      }),
      makeRow({
        job_seeker_id: "s2",
        account_manager_id: "am-outcome",
        am_name: "One Offer",
        easy_applications: 4,
        offers: 1,
      }),
    ]);

    expect(board.map((entry) => entry.am_name)).toEqual(["One Offer", "High Volume"]);
    expect(board[1].total).toBe(300);
  });

  it("breaks an offer tie on combined interviews before volume", () => {
    const board = buildLeaderboard([
      makeRow({
        job_seeker_id: "s1",
        account_manager_id: "am-a",
        am_name: "A",
        offers: 1,
        easy_applications: 50,
      }),
      makeRow({
        job_seeker_id: "s2",
        account_manager_id: "am-b",
        am_name: "B",
        offers: 1,
        // Spread across types — the tie-break must not favour one kind.
        phone_interviews: 1,
        video_interviews: 1,
        easy_applications: 3,
      }),
    ]);

    expect(board.map((entry) => entry.am_name)).toEqual(["B", "A"]);
    expect(board[0].interviews).toBe(2);
  });

  it("aggregates an AM's clients across days and counts only clients with activity", () => {
    const board = buildLeaderboard([
      makeRow({ job_seeker_id: "s1", entry_date: "2026-08-10", easy_applications: 3 }),
      makeRow({ job_seeker_id: "s1", entry_date: "2026-08-11", easy_applications: 4 }),
      makeRow({ job_seeker_id: "s2", entry_date: "2026-08-11", ai_interviews: 1 }),
      // A blank row for a third client should not inflate the client count.
      makeRow({ job_seeker_id: "s3", entry_date: "2026-08-11" }),
    ]);

    expect(board).toHaveLength(1);
    expect(board[0].counts.easy_applications).toBe(7);
    expect(board[0].interviews).toBe(1);
    expect(board[0].clients).toBe(2);
    expect(board[0].total).toBe(8);
  });
});
