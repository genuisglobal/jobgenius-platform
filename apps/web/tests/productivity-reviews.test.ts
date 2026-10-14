import { describe, it, expect } from "vitest";
import {
  SUSTAINED_WEEKS,
  composeReviewMessage,
  detectStreak,
  shiftWeeks,
  weekStartOf,
  type WeeklyPace,
} from "@/lib/productivity-reviews";
import type { PaceBand } from "@/lib/am-productivity";

/** A rated week in the given band, `n` weeks after 2026-08-03 (a Monday). */
function week(n: number, pace: PaceBand, index: number | null = 0.5): WeeklyPace {
  return {
    week_start: shiftWeeks("2026-08-03", n),
    pace,
    pace_index: pace === "unrated" ? null : index,
    measured_hours: pace === "unrated" ? 1 : 35,
    score_per_hour: pace === "unrated" ? null : 1.2,
    team_median: 2.4,
  };
}

function run(pace: PaceBand, count = SUSTAINED_WEEKS): WeeklyPace[] {
  return Array.from({ length: count }, (_, i) => week(i, pace));
}

describe("weekStartOf / shiftWeeks", () => {
  it("snaps to the containing Monday", () => {
    // 2026-08-14 is a Friday.
    expect(weekStartOf("2026-08-14")).toBe("2026-08-10");
    expect(weekStartOf("2026-08-10")).toBe("2026-08-10");
  });

  it("moves whole weeks", () => {
    expect(shiftWeeks("2026-08-10", 1)).toBe("2026-08-17");
    expect(shiftWeeks("2026-08-10", -2)).toBe("2026-07-27");
  });
});

describe("detectStreak", () => {
  it("needs the full run of weeks", () => {
    expect(detectStreak(run("slow", SUSTAINED_WEEKS - 1))).toBeNull();
    expect(detectStreak(run("slow"))?.kind).toBe("concern");
  });

  it("raises a commendation for a sustained fast run", () => {
    const streak = detectStreak(run("fast"));
    expect(streak?.kind).toBe("commendation");
    expect(streak?.weeks).toHaveLength(SUSTAINED_WEEKS);
  });

  it("ignores a steady run entirely", () => {
    expect(detectStreak(run("steady"))).toBeNull();
  });

  it("does not fire on a mixed run", () => {
    const weeks = [week(0, "slow"), week(1, "steady"), week(2, "slow")];
    expect(detectStreak(weeks)).toBeNull();
  });

  it("breaks the streak on an unrated week rather than counting it as slow", () => {
    // Otherwise leave, sickness, or an uncaptured week reads as bad work.
    const weeks = [week(0, "slow"), week(1, "unrated"), week(2, "slow")];
    expect(detectStreak(weeks)).toBeNull();
  });

  it("requires the weeks to be consecutive", () => {
    const weeks = [week(0, "slow"), week(1, "slow"), week(5, "slow")];
    expect(detectStreak(weeks)).toBeNull();
  });

  it("assesses only the most recent window", () => {
    // An old slow run followed by recovery must not still flag.
    const weeks = [
      week(0, "slow"),
      week(1, "slow"),
      week(2, "slow"),
      week(3, "steady"),
    ];
    expect(detectStreak(weeks)).toBeNull();
  });

  it("fires on the newest window when the run continues", () => {
    const weeks = [week(0, "steady"), ...run("slow").map((_, i) => week(i + 1, "slow"))];
    expect(detectStreak(weeks)?.kind).toBe("concern");
  });

  it("handles an empty history", () => {
    expect(detectStreak([])).toBeNull();
  });
});

describe("composeReviewMessage", () => {
  it("frames a concern as a question, not a verdict", () => {
    const streak = detectStreak(run("slow"))!;
    const { subject, body } = composeReviewMessage("Ada Okafor", streak);

    expect(subject).toContain("Ada Okafor");
    expect(subject).toContain(`${SUSTAINED_WEEKS} weeks running`);
    expect(body).toContain("not a conclusion");
    expect(body).toContain("Nothing has been recorded against them");
    // It must not imply the platform has done anything disciplinary.
    expect(body).not.toMatch(/warning|disciplinary action|violation/i);
  });

  it("lists the evidence week by week", () => {
    const streak = detectStreak(run("slow"))!;
    const { body } = composeReviewMessage("Ada Okafor", streak);
    for (const w of streak.weeks) {
      expect(body).toContain(w.week_start);
    }
  });

  it("reads as recognition for a commendation", () => {
    const streak = detectStreak(run("fast"))!;
    const { subject, body } = composeReviewMessage("Ada Okafor", streak);

    expect(subject).toContain("above team pace");
    expect(body).toContain("Leader of the Month");
    expect(body).not.toContain("not a conclusion");
  });
});
