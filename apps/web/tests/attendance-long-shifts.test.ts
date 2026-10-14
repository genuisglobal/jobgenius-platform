import { describe, it, expect } from "vitest";
import {
  LONG_SHIFT_HOURS,
  SELF_NUDGE_HOURS,
  elapsedSinceSignIn,
  isLongOpenShift,
  isStale,
  needsSelfNudge,
  validateAdjustedSignOut,
  wasAdjusted,
  workedMs,
  type AttendanceBreak,
  type AttendanceDay,
} from "@/lib/attendance";
import {
  composeLongShiftMessage,
  composeSelfNudgeMessage,
} from "@/lib/long-shift-alerts";

/** Signed in 08:00 WAT (07:00 UTC) on the given date. */
function day(
  overrides: Partial<AttendanceDay> = {},
  workDate = "2026-08-13"
): AttendanceDay {
  return {
    id: "day-1",
    account_manager_id: "am-1",
    work_date: workDate,
    signed_in_at: `${workDate}T07:00:00Z`,
    signed_out_at: null,
    breaks: [],
    ...overrides,
  };
}

function br(started: string, ended: string | null = null): AttendanceBreak {
  return { id: `b-${started}`, started_at: started, ended_at: ended };
}

describe("isLongOpenShift", () => {
  it("fires once the shift passes the threshold", () => {
    const shift = day();
    const justUnder = new Date(
      `2026-08-13T07:00:00Z`
    ).getTime() + (LONG_SHIFT_HOURS - 0.5) * 3_600_000;
    const justOver =
      new Date(`2026-08-13T07:00:00Z`).getTime() + LONG_SHIFT_HOURS * 3_600_000;

    expect(isLongOpenShift(shift, new Date(justUnder))).toBe(false);
    expect(isLongOpenShift(shift, new Date(justOver))).toBe(true);
  });

  it("never fires for a shift that was signed out", () => {
    const closed = day({ signed_out_at: "2026-08-13T15:00:00Z" });
    // Days later — a closed shift is closed, however long ago it happened.
    expect(isLongOpenShift(closed, new Date("2026-08-20T00:00:00Z"))).toBe(false);
  });

  it("catches a long shift on the same day, before isStale would", () => {
    // 19:00 WAT the same day: 11 hours open, but the WAT date has not
    // rolled over, so the overnight check is still silent.
    const now = new Date("2026-08-13T18:00:00Z");
    const shift = day();
    expect(isStale(shift, now)).toBe(false);
    expect(isLongOpenShift(shift, now)).toBe(true);
  });
});

describe("the two rungs", () => {
  /** Hours after 08:00 WAT sign-in, as an instant. */
  function after(hours: number): Date {
    return new Date(new Date("2026-08-13T07:00:00Z").getTime() + hours * 3_600_000);
  }

  it("nudges the worker an hour before escalating to a manager", () => {
    expect(SELF_NUDGE_HOURS).toBeLessThan(LONG_SHIFT_HOURS);

    const shift = day();
    // Before either rung.
    expect(needsSelfNudge(shift, after(8))).toBe(false);
    expect(isLongOpenShift(shift, after(8))).toBe(false);

    // Worker's own to fix.
    expect(needsSelfNudge(shift, after(SELF_NUDGE_HOURS))).toBe(true);
    expect(isLongOpenShift(shift, after(SELF_NUDGE_HOURS))).toBe(false);

    // Escalated.
    expect(needsSelfNudge(shift, after(LONG_SHIFT_HOURS))).toBe(true);
    expect(isLongOpenShift(shift, after(LONG_SHIFT_HOURS))).toBe(true);
  });

  it("silences both rungs the moment the shift is signed out", () => {
    const closed = day({ signed_out_at: "2026-08-13T15:00:00Z" });
    expect(needsSelfNudge(closed, after(20))).toBe(false);
    expect(isLongOpenShift(closed, after(20))).toBe(false);
  });
});

describe("elapsedSinceSignIn", () => {
  it("measures wall clock, breaks included", () => {
    const shift = day({ breaks: [br("2026-08-13T09:00:00Z", "2026-08-13T10:00:00Z")] });
    const now = new Date("2026-08-13T17:00:00Z");
    expect(elapsedSinceSignIn(shift, now)).toBe(10 * 3_600_000);
    // Worked time nets the break off; the alert threshold does not.
    expect(workedMs(shift, now)).toBe(9 * 3_600_000);
  });
});

describe("validateAdjustedSignOut", () => {
  const now = new Date("2026-08-14T09:00:00Z");

  it("accepts a plausible time and returns it as an instant", () => {
    const result = validateAdjustedSignOut(day(), "2026-08-13T13:00:00Z", now);
    expect(result).toEqual({ ok: true, iso: "2026-08-13T13:00:00.000Z" });
  });

  it("rejects leaving before arriving", () => {
    const result = validateAdjustedSignOut(day(), "2026-08-13T06:00:00Z", now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/before sign-in/i);
  });

  it("rejects a time in the future", () => {
    const result = validateAdjustedSignOut(day(), "2026-08-14T18:00:00Z", now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/future/i);
  });

  it("tolerates a few seconds of staleness for an 'as of now' correction", () => {
    // Same-day shift, so the 24-hour rule is not what is under test here.
    const result = validateAdjustedSignOut(
      day({}, "2026-08-14"),
      "2026-08-14T09:00:30Z",
      now
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a shift longer than a day", () => {
    const result = validateAdjustedSignOut(
      day(),
      "2026-08-14T08:00:00Z",
      new Date("2026-08-15T00:00:00Z")
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/24 hours/i);
  });

  it("rejects a sign-out that lands before a break they had started", () => {
    const shift = day({ breaks: [br("2026-08-13T12:00:00Z")] });
    const result = validateAdjustedSignOut(shift, "2026-08-13T11:00:00Z", now);
    expect(result.ok).toBe(false);
    // The message names the break time so the admin can pick a later one.
    if (!result.ok) expect(result.error).toMatch(/13:00/);
  });

  it("accepts a sign-out after an open break started", () => {
    const shift = day({ breaks: [br("2026-08-13T12:00:00Z")] });
    expect(validateAdjustedSignOut(shift, "2026-08-13T13:00:00Z", now).ok).toBe(true);
  });

  it("rejects junk instead of coercing it", () => {
    for (const bad of ["", "   ", "not a time", null, undefined, 42]) {
      expect(validateAdjustedSignOut(day(), bad, now).ok).toBe(false);
    }
  });
});

describe("wasAdjusted", () => {
  it("is true only once a correction has been recorded", () => {
    expect(wasAdjusted(day({ signed_out_at: "2026-08-13T15:00:00Z" }))).toBe(false);
    expect(
      wasAdjusted(
        day({ signed_out_at: "2026-08-13T15:00:00Z", adjusted_at: "2026-08-14T09:00:00Z" })
      )
    ).toBe(true);
  });
});

const ALERT = {
  day_id: "day-1",
  account_manager_id: "am-1",
  am_name: "Ada Okafor",
  work_date: "2026-08-13",
  signed_in_at: "2026-08-13T07:00:00Z",
  elapsed_ms: 11 * 3_600_000,
};

describe("composeLongShiftMessage", () => {
  it("names the person, the times, and why nothing was closed", () => {
    const { subject, body } = composeLongShiftMessage(ALERT);

    expect(subject).toBe("Ada Okafor has been signed in for 11h 0m");
    expect(body).toContain("signed in at 08:00"); // 07:00 UTC is 08:00 WAT
    expect(body).toContain("Thursday, 13 August 2026");
    expect(body).toContain("Nothing has been closed automatically");
    // The manager should know the worker already had their chance.
    expect(body).toContain(`after ${SELF_NUDGE_HOURS} hours`);
  });
});

describe("composeSelfNudgeMessage", () => {
  it("addresses the worker, and covers both 'still here' and 'already left'", () => {
    const { subject, body } = composeSelfNudgeMessage({
      ...ALERT,
      elapsed_ms: 9 * 3_600_000,
    });

    expect(subject).toBe("You are still signed in — 9h 0m so far");
    expect(body).toContain("You signed in at 08:00");
    expect(body).toContain("If you are still working");
    expect(body).toContain("If you already left");
    // It must not imply they can fix a past time themselves — they cannot.
    expect(body).toContain("cannot backdate it yourself");
    expect(body).toContain(`after ${LONG_SHIFT_HOURS} hours`);
  });

  it("does not accuse the reader of anything", () => {
    const body = composeSelfNudgeMessage(ALERT).body.toLowerCase();
    for (const word of ["failed", "violation", "warning", "must explain"]) {
      expect(body).not.toContain(word);
    }
  });
});
