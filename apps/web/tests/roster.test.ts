import { describe, it, expect } from "vitest";
import {
  MONDAY_TO_FRIDAY,
  coerceWorkDays,
  datesInRange,
  exemptionFor,
  formatWorkDays,
  isoWeekday,
  rosterForRange,
  summariseAttendance,
  workDaysFor,
  type Exemption,
} from "@/lib/roster";

// 2026-08-10 is a Monday.
const MON = "2026-08-10";
const SAT = "2026-08-15";
const SUN = "2026-08-16";

function exemption(overrides: Partial<Exemption> = {}): Exemption {
  return {
    id: "ex-1",
    account_manager_id: "am-1",
    start_date: MON,
    end_date: MON,
    reason: "leave",
    ...overrides,
  };
}

describe("isoWeekday", () => {
  it("maps Monday to 1 and Sunday to 7", () => {
    expect(isoWeekday(MON)).toBe(1);
    expect(isoWeekday(SAT)).toBe(6);
    expect(isoWeekday(SUN)).toBe(7);
  });
});

describe("datesInRange", () => {
  it("is inclusive of both ends", () => {
    expect(datesInRange(MON, "2026-08-12")).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
    ]);
  });

  it("returns a single day for a one-day range", () => {
    expect(datesInRange(MON, MON)).toEqual([MON]);
  });

  it("returns nothing for a reversed range rather than spinning", () => {
    expect(datesInRange("2026-08-12", MON)).toEqual([]);
  });

  it("crosses a month boundary", () => {
    expect(datesInRange("2026-08-30", "2026-09-01")).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
    ]);
  });
});

describe("workDaysFor", () => {
  it("defaults a missing schedule to Monday-Friday", () => {
    expect(workDaysFor("am-1", [])).toEqual(MONDAY_TO_FRIDAY);
  });

  it("treats an empty array as no schedule, not as never working", () => {
    // A row with no days would otherwise report someone permanently absent.
    expect(
      workDaysFor("am-1", [{ account_manager_id: "am-1", work_days: [] }])
    ).toEqual(MONDAY_TO_FRIDAY);
  });

  it("uses an explicit schedule when there is one", () => {
    expect(
      workDaysFor("am-1", [{ account_manager_id: "am-1", work_days: [1, 3, 5] }])
    ).toEqual([1, 3, 5]);
  });
});

describe("exemptionFor", () => {
  it("matches a date inside the range", () => {
    const ex = exemption({ start_date: MON, end_date: "2026-08-14" });
    expect(exemptionFor("am-1", "2026-08-12", [ex])).toBe(ex);
    expect(exemptionFor("am-1", "2026-08-17", [ex])).toBeNull();
  });

  it("applies a company-wide exemption to everybody", () => {
    const holiday = exemption({ account_manager_id: null, reason: "holiday" });
    expect(exemptionFor("anyone-at-all", MON, [holiday])).toBe(holiday);
  });

  it("does not leak one person's leave onto another", () => {
    expect(exemptionFor("am-2", MON, [exemption()])).toBeNull();
  });
});

describe("rosterForRange", () => {
  it("marks weekends off and weekdays expected by default", () => {
    const roster = rosterForRange("am-1", MON, SUN, [], []);
    expect(roster).toHaveLength(7);
    expect(roster.filter((d) => d.kind === "expected")).toHaveLength(5);
    expect(roster.filter((d) => d.kind === "off").map((d) => d.date)).toEqual([
      SAT,
      SUN,
    ]);
  });

  it("lets an exemption beat the roster without knowing the schedule", () => {
    const roster = rosterForRange(
      "am-1",
      MON,
      SUN,
      [],
      [exemption({ account_manager_id: null, reason: "holiday" })]
    );
    const monday = roster.find((d) => d.date === MON);
    expect(monday?.kind).toBe("exempt");
    expect(monday?.reason).toBe("holiday");
  });

  it("respects a part-time schedule", () => {
    const roster = rosterForRange(
      "am-1",
      MON,
      SUN,
      [{ account_manager_id: "am-1", work_days: [1, 2, 3] }],
      []
    );
    expect(roster.filter((d) => d.kind === "expected")).toHaveLength(3);
  });
});

describe("summariseAttendance", () => {
  const roster = rosterForRange("am-1", MON, SUN, [], []);

  it("counts a full week present", () => {
    const appeared = new Set([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
    ]);
    const summary = summariseAttendance(roster, appeared);
    expect(summary).toEqual({
      expected_days: 5,
      exempt_days: 0,
      absent_days: 0,
      present_days: 5,
      attendance_rate: 1,
    });
  });

  it("reports the gap when somebody never appeared at all", () => {
    // The whole point: no shift, no activity, previously invisible.
    const summary = summariseAttendance(roster, new Set());
    expect(summary.expected_days).toBe(5);
    expect(summary.absent_days).toBe(5);
    expect(summary.attendance_rate).toBe(0);
  });

  it("does not count excused days as absence", () => {
    const withLeave = rosterForRange(
      "am-1",
      MON,
      SUN,
      [],
      [exemption({ start_date: MON, end_date: "2026-08-11" })]
    );
    const summary = summariseAttendance(withLeave, new Set(["2026-08-12"]));
    expect(summary.exempt_days).toBe(2);
    expect(summary.expected_days).toBe(3);
    expect(summary.absent_days).toBe(2);
  });

  it("ignores appearances on days off — weekend work is not attendance credit", () => {
    const summary = summariseAttendance(roster, new Set([SAT, SUN]));
    expect(summary.present_days).toBe(0);
    expect(summary.absent_days).toBe(5);
  });

  it("returns a null rate when nothing was expected", () => {
    const allExempt = rosterForRange(
      "am-1",
      MON,
      "2026-08-14",
      [],
      [exemption({ start_date: MON, end_date: "2026-08-14", reason: "holiday" })]
    );
    expect(summariseAttendance(allExempt, new Set()).attendance_rate).toBeNull();
  });
});

describe("formatWorkDays", () => {
  it("collapses a contiguous run", () => {
    expect(formatWorkDays([1, 2, 3, 4, 5])).toBe("Mon–Fri");
  });

  it("lists a scattered week", () => {
    expect(formatWorkDays([1, 3, 5])).toBe("Mon, Wed, Fri");
  });

  it("lists a two-day week rather than writing it as a range", () => {
    expect(formatWorkDays([1, 2])).toBe("Mon, Tue");
  });
});

describe("coerceWorkDays", () => {
  it("sorts, dedupes and drops anything outside a week", () => {
    expect(coerceWorkDays([5, 1, 1, 9, 0, -2, 3])).toEqual([1, 3, 5]);
  });

  it("rejects input that would leave nobody working", () => {
    expect(coerceWorkDays([])).toBeNull();
    expect(coerceWorkDays([0, 8])).toBeNull();
    expect(coerceWorkDays("mon")).toBeNull();
    expect(coerceWorkDays(null)).toBeNull();
  });
});
