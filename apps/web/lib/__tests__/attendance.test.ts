import { describe, expect, it } from "vitest";
import {
  actionRejectionReason,
  breakMs,
  canPerform,
  deriveStatus,
  formatDuration,
  isAttendanceAction,
  isStale,
  openBreak,
  watDate,
  watTime,
  workedHours,
  workedMs,
  type AttendanceDay,
} from "../attendance";

function makeDay(overrides: Partial<AttendanceDay> = {}): AttendanceDay {
  return {
    id: "day-1",
    account_manager_id: "am-1",
    work_date: "2026-08-13",
    signed_in_at: "2026-08-13T07:00:00.000Z", // 08:00 WAT
    signed_out_at: null,
    breaks: [],
    ...overrides,
  };
}

describe("WAT conversion", () => {
  it("uses UTC+1, so late-evening UTC is already the next WAT day", () => {
    // 23:30 UTC on the 12th is 00:30 WAT on the 13th.
    expect(watDate(new Date("2026-08-12T23:30:00Z"))).toBe("2026-08-13");
    expect(watDate(new Date("2026-08-12T22:30:00Z"))).toBe("2026-08-12");
  });

  it("formats clock times in WAT, not UTC", () => {
    expect(watTime("2026-08-13T07:00:00Z")).toBe("08:00");
    expect(watTime("2026-08-13T16:45:00Z")).toBe("17:45");
  });

  it("does not shift across the WAT date in mid-year or mid-winter", () => {
    // WAT has no daylight saving, so the offset is +1 in both.
    expect(watTime("2026-01-15T07:00:00Z")).toBe("08:00");
    expect(watTime("2026-07-15T07:00:00Z")).toBe("08:00");
  });

  it("returns a placeholder rather than crashing on bad input", () => {
    expect(watTime(null)).toBe("—");
    expect(watTime("not-a-date")).toBe("—");
  });
});

describe("status", () => {
  it("is off with no record, working after sign-in", () => {
    expect(deriveStatus(null)).toBe("off");
    expect(deriveStatus(makeDay())).toBe("working");
  });

  it("is on_break while a break has no end", () => {
    const day = makeDay({
      breaks: [{ id: "b1", started_at: "2026-08-13T11:00:00Z", ended_at: null }],
    });
    expect(deriveStatus(day)).toBe("on_break");
    expect(openBreak(day)?.id).toBe("b1");
  });

  it("is working again once the break is closed", () => {
    const day = makeDay({
      breaks: [
        {
          id: "b1",
          started_at: "2026-08-13T11:00:00Z",
          ended_at: "2026-08-13T11:30:00Z",
        },
      ],
    });
    expect(deriveStatus(day)).toBe("working");
    expect(openBreak(day)).toBeNull();
  });

  it("is done after sign-out, even with a break left open", () => {
    const day = makeDay({
      signed_out_at: "2026-08-13T16:00:00Z",
      breaks: [{ id: "b1", started_at: "2026-08-13T11:00:00Z", ended_at: null }],
    });
    expect(deriveStatus(day)).toBe("done");
  });
});

describe("permitted actions", () => {
  it("allows only signing in when off the clock", () => {
    expect(canPerform("sign_in", "off")).toBe(true);
    expect(canPerform("break_start", "off")).toBe(false);
    expect(canPerform("sign_out", "off")).toBe(false);
  });

  it("allows break and sign out while working", () => {
    expect(canPerform("break_start", "working")).toBe(true);
    expect(canPerform("break_end", "working")).toBe(false);
    expect(canPerform("sign_out", "working")).toBe(true);
    expect(canPerform("sign_in", "working")).toBe(false);
  });

  it("lets someone sign out straight from a break", () => {
    // People leave without ending the break; refusing would strand the day.
    expect(canPerform("sign_out", "on_break")).toBe(true);
    expect(canPerform("break_end", "on_break")).toBe(true);
    expect(canPerform("break_start", "on_break")).toBe(false);
  });

  it("refuses everything once the day is closed", () => {
    for (const action of ["sign_in", "break_start", "break_end", "sign_out"] as const) {
      expect(canPerform(action, "done")).toBe(false);
    }
    expect(actionRejectionReason("sign_in", "done")).toMatch(/already signed out/i);
  });

  it("validates the action name off the wire", () => {
    expect(isAttendanceAction("sign_in")).toBe(true);
    expect(isAttendanceAction("clock_in")).toBe(false);
    expect(isAttendanceAction(null)).toBe(false);
  });
});

describe("worked time", () => {
  const now = new Date("2026-08-13T16:00:00Z");

  it("counts sign-in to sign-out when there are no breaks", () => {
    const day = makeDay({ signed_out_at: "2026-08-13T16:00:00Z" });
    expect(workedMs(day, now)).toBe(9 * 3600000);
    expect(workedHours(day, now)).toBe(9);
  });

  it("subtracts closed breaks", () => {
    const day = makeDay({
      signed_out_at: "2026-08-13T16:00:00Z",
      breaks: [
        {
          id: "b1",
          started_at: "2026-08-13T11:00:00Z",
          ended_at: "2026-08-13T12:00:00Z",
        },
      ],
    });
    expect(workedHours(day, now)).toBe(8);
  });

  it("subtracts multiple breaks", () => {
    const day = makeDay({
      signed_out_at: "2026-08-13T16:00:00Z",
      breaks: [
        { id: "b1", started_at: "2026-08-13T09:00:00Z", ended_at: "2026-08-13T09:30:00Z" },
        { id: "b2", started_at: "2026-08-13T12:00:00Z", ended_at: "2026-08-13T13:00:00Z" },
      ],
    });
    expect(breakMs(day, now)).toBe(90 * 60000);
    expect(workedHours(day, now)).toBe(7.5);
  });

  it("counts an open break up to now, so the counter does not jump on return", () => {
    const day = makeDay({
      breaks: [{ id: "b1", started_at: "2026-08-13T15:30:00Z", ended_at: null }],
    });
    expect(breakMs(day, now)).toBe(30 * 60000);
    expect(workedHours(day, now)).toBe(8.5);
  });

  it("never reports negative time", () => {
    const day = makeDay({
      breaks: [{ id: "b1", started_at: "2026-08-13T06:00:00Z", ended_at: "2026-08-14T06:00:00Z" }],
    });
    expect(workedMs(day, now)).toBe(0);
  });

  it("formats durations compactly", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(-5)).toBe("0m");
    expect(formatDuration(45 * 60000)).toBe("45m");
    expect(formatDuration(72 * 60000)).toBe("1h 12m");
    expect(formatDuration(9 * 3600000)).toBe("9h 0m");
  });
});

describe("forgotten sign-outs", () => {
  it("flags an open shift once its WAT day has passed", () => {
    const day = makeDay(); // 2026-08-13, never signed out
    expect(isStale(day, new Date("2026-08-13T20:00:00Z"))).toBe(false);
    expect(isStale(day, new Date("2026-08-14T09:00:00Z"))).toBe(true);
  });

  it("never flags a closed shift", () => {
    const day = makeDay({ signed_out_at: "2026-08-13T16:00:00Z" });
    expect(isStale(day, new Date("2026-08-20T09:00:00Z"))).toBe(false);
  });
});
