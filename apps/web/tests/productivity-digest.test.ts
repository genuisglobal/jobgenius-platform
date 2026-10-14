import { describe, it, expect } from "vitest";
import { emptyCounts, type ActivityCounts, type SheetRow } from "@/lib/activity-sheet";
import { buildProductivity, type ShiftRow } from "@/lib/am-productivity";
import {
  MIN_TEAM_FOR_COMPARISON,
  composeDigestMessage,
  getDigestWeek,
} from "@/lib/productivity-digest";

const NOW = new Date("2026-08-14T18:00:00Z"); // Friday

function row(
  amId: string,
  date: string,
  counts: Partial<ActivityCounts>
): SheetRow {
  return {
    id: null,
    entry_date: date,
    job_seeker_id: "seeker-1",
    seeker_name: "",
    account_manager_id: amId,
    am_name: `AM ${amId}`,
    note: null,
    updated_at: null,
    ...emptyCounts(),
    ...counts,
  };
}

function shift(amId: string, date: string, hours: number | null): ShiftRow {
  const signedIn = new Date(`${date}T07:00:00Z`);
  return {
    id: `${amId}-${date}`,
    account_manager_id: amId,
    am_name: `AM ${amId}`,
    work_date: date,
    signed_in_at: signedIn.toISOString(),
    signed_out_at:
      hours === null
        ? null
        : new Date(signedIn.getTime() + hours * 3_600_000).toISOString(),
    breaks: [],
  };
}

const WEEK = { start: "2026-08-10", end: "2026-08-14" };

describe("getDigestWeek", () => {
  it("runs Monday through the day it is sent, not the whole week", () => {
    // 2026-08-14 is a Friday; Monday of that week is the 10th.
    expect(getDigestWeek("2026-08-14")).toEqual({
      start: "2026-08-10",
      end: "2026-08-14",
    });
  });

  it("never reaches past today into the weekend", () => {
    expect(getDigestWeek("2026-08-12").end).toBe("2026-08-12");
  });
});

describe("composeDigestMessage", () => {
  /** Enough rated managers that the team comparison is allowed to appear. */
  function team(managerCount: number) {
    const rows: SheetRow[] = [];
    const shifts: ShiftRow[] = [];
    for (let i = 0; i < managerCount; i += 1) {
      rows.push(row(`am-${i}`, "2026-08-10", { easy_applications: 8 }));
      shifts.push(shift(`am-${i}`, "2026-08-10", 8));
    }
    return { rows, shifts };
  }

  it("leads with the week's headline numbers", () => {
    const rows = [
      row("a", "2026-08-10", {
        easy_applications: 12,
        company_applications: 35,
        follow_ups: 23,
        phone_interviews: 3,
        ai_interviews: 1,
        video_interviews: 2,
        offers: 1,
      }),
    ];
    const { managers, team: totals } = buildProductivity(
      rows,
      [shift("a", "2026-08-10", 8)],
      NOW
    );
    const { subject, body } = composeDigestMessage(managers[0], totals, WEEK);

    expect(subject).toBe("Your week: 47 applications, 6 interviews, 1 offer");
    expect(body).toContain("Applications: 47 (12 easy, 35 company)");
    expect(body).toContain("Interviews: 6 (3 phone, 1 AI, 2 video)");
    expect(body).toContain("Follow-ups: 23");
    expect(body).toContain("On the clock: 8h across 1 day");
  });

  it("singularises a one-of-each week", () => {
    const rows = [row("a", "2026-08-10", { easy_applications: 1, phone_interviews: 1, offers: 1 })];
    const { managers, team: totals } = buildProductivity(
      rows,
      [shift("a", "2026-08-10", 8)],
      NOW
    );
    expect(composeDigestMessage(managers[0], totals, WEEK).subject).toBe(
      "Your week: 1 application, 1 interview, 1 offer"
    );
  });

  it("compares to the team median once enough managers are rated", () => {
    const { rows, shifts } = team(MIN_TEAM_FOR_COMPARISON);
    // A fourth AM at double everyone else's output.
    rows.push(row("star", "2026-08-10", { easy_applications: 16 }));
    shifts.push(shift("star", "2026-08-10", 8));

    const { managers, team: totals } = buildProductivity(rows, shifts, NOW);
    const star = managers.find((m) => m.account_manager_id === "star")!;
    const body = composeDigestMessage(star, totals, WEEK).body;

    expect(body).toContain("Output: 2.0 points per hour");
    expect(body).toContain("+100% against the team median of 1.0");
  });

  it("omits the comparison when the team is too small to be a benchmark", () => {
    const { rows, shifts } = team(MIN_TEAM_FOR_COMPARISON - 1);
    const { managers, team: totals } = buildProductivity(rows, shifts, NOW);
    const body = composeDigestMessage(managers[0], totals, WEEK).body;

    expect(body).toContain("Output: 1.0 points per hour.");
    expect(body).not.toContain("team median");
  });

  it("says so plainly when there is too little measured time to rate", () => {
    const rows = [row("a", "2026-08-10", { easy_applications: 3 })];
    const { managers, team: totals } = buildProductivity(
      rows,
      [shift("a", "2026-08-10", 1)],
      NOW
    );
    const body = composeDigestMessage(managers[0], totals, WEEK).body;

    expect(body).toContain("Not enough measured time this week");
    expect(body).not.toContain("points per hour");
  });

  it("flags idle days and unmeasured work, and nothing when the week is clean", () => {
    const rows = [
      row("a", "2026-08-10", { easy_applications: 8 }),
      row("a", "2026-08-12", { easy_applications: 5 }), // never clocked in
    ];
    const shifts = [
      shift("a", "2026-08-10", 8),
      shift("a", "2026-08-11", 8), // on the clock, nothing logged
    ];
    const { managers, team: totals } = buildProductivity(rows, shifts, NOW);
    const body = composeDigestMessage(managers[0], totals, WEEK).body;

    expect(body).toContain("Heads up:");
    expect(body).toContain("1 day on the clock with nothing logged");
    expect(body).toContain("1 day of logged work with no complete shift");

    const clean = buildProductivity(
      [row("b", "2026-08-10", { easy_applications: 8 })],
      [shift("b", "2026-08-10", 8)],
      NOW
    );
    expect(composeDigestMessage(clean.managers[0], clean.team, WEEK).body).not.toContain(
      "Heads up:"
    );
  });

  it("reports conversion only when there were applications to convert", () => {
    const rows = [row("a", "2026-08-10", { follow_ups: 6 })];
    const { managers, team: totals } = buildProductivity(
      rows,
      [shift("a", "2026-08-10", 8)],
      NOW
    );
    expect(composeDigestMessage(managers[0], totals, WEEK).body).not.toContain(
      "Conversion:"
    );
  });
});
