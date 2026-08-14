import { describe, it, expect } from "vitest";
import { emptyCounts, type ActivityCounts, type SheetRow } from "@/lib/activity-sheet";
import {
  MIN_RATED_HOURS,
  applicationTotal,
  buildFunnel,
  buildProductivity,
  formatPaceIndex,
  median,
  type ShiftRow,
} from "@/lib/am-productivity";

const NOW = new Date("2026-08-13T18:00:00Z");

function row(
  amId: string,
  date: string,
  counts: Partial<ActivityCounts>,
  seekerId = "seeker-1"
): SheetRow {
  return {
    id: null,
    entry_date: date,
    job_seeker_id: seekerId,
    seeker_name: "Client",
    account_manager_id: amId,
    am_name: `AM ${amId}`,
    note: null,
    updated_at: null,
    ...emptyCounts(),
    ...counts,
  };
}

/** A closed shift of `hours` starting 08:00 WAT on `date`. */
function shift(
  amId: string,
  date: string,
  hours: number | null,
  breaks: ShiftRow["breaks"] = []
): ShiftRow {
  const signedIn = new Date(`${date}T07:00:00Z`); // 08:00 WAT
  return {
    id: `${amId}-${date}`,
    account_manager_id: amId,
    am_name: `AM ${amId}`,
    work_date: date,
    signed_in_at: signedIn.toISOString(),
    // null hours = the shift was never signed out.
    signed_out_at:
      hours === null
        ? null
        : new Date(signedIn.getTime() + hours * 3_600_000).toISOString(),
    breaks,
  };
}

describe("applicationTotal / buildFunnel", () => {
  it("adds easy and company applications", () => {
    expect(applicationTotal({ easy_applications: 7, company_applications: 3 })).toBe(10);
  });

  it("derives conversion per 100 applications", () => {
    const funnel = buildFunnel({
      easy_applications: 40,
      company_applications: 60,
      follow_ups: 50,
      phone_interviews: 3,
      video_interviews: 2,
      offers: 1,
    });
    expect(funnel.applications).toBe(100);
    expect(funnel.interviews).toBe(5);
    expect(funnel.interviews_per_100_applications).toBe(5);
    expect(funnel.offers_per_100_applications).toBe(1);
    expect(funnel.offers_per_interview).toBeCloseTo(0.2);
    expect(funnel.follow_ups_per_application).toBeCloseTo(0.5);
  });

  it("returns null rather than dividing by zero", () => {
    const funnel = buildFunnel(emptyCounts());
    expect(funnel.interviews_per_100_applications).toBeNull();
    expect(funnel.offers_per_interview).toBeNull();
    expect(funnel.follow_ups_per_application).toBeNull();
  });
});

describe("median", () => {
  it("averages the two middle values on an even count", () => {
    expect(median([4, 8])).toBe(6);
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });

  it("is null for an empty list", () => {
    expect(median([])).toBeNull();
  });
});

describe("buildProductivity", () => {
  it("divides activity by measured hours, net of breaks", () => {
    const rows = [
      row("a", "2026-08-10", { easy_applications: 10, company_applications: 2 }),
    ];
    const shifts = [
      shift("a", "2026-08-10", 9, [
        {
          id: "b1",
          started_at: "2026-08-10T11:00:00Z",
          ended_at: "2026-08-10T12:00:00Z", // 1h break → 8h measured
        },
      ]),
    ];

    const { managers } = buildProductivity(rows, shifts, NOW);
    expect(managers).toHaveLength(1);
    const am = managers[0];
    expect(am.measured_hours).toBeCloseTo(8);
    expect(am.rates).not.toBeNull();
    // 10 easy (1pt) + 2 company (1.5pt) = 13 points over 8h.
    expect(am.rates?.score_per_hour).toBeCloseTo(13 / 8);
    expect(am.rates?.applications_per_hour).toBeCloseTo(12 / 8);
  });

  it("sums a day's clients into one day for the AM", () => {
    const rows = [
      row("a", "2026-08-10", { easy_applications: 5 }, "seeker-1"),
      row("a", "2026-08-10", { easy_applications: 4 }, "seeker-2"),
    ];
    const { managers } = buildProductivity(rows, [shift("a", "2026-08-10", 8)], NOW);
    expect(managers[0].days).toHaveLength(1);
    expect(managers[0].counts.easy_applications).toBe(9);
    expect(managers[0].rates?.applications_per_hour).toBeCloseTo(9 / 8);
  });

  it("keeps idle on-clock days in the denominator", () => {
    const rows = [row("a", "2026-08-10", { easy_applications: 16 })];
    const shifts = [shift("a", "2026-08-10", 8), shift("a", "2026-08-11", 8)];

    const { managers } = buildProductivity(rows, shifts, NOW);
    const am = managers[0];
    expect(am.days_on_clock).toBe(2);
    expect(am.idle_days).toBe(1);
    expect(am.measured_hours).toBeCloseTo(16);
    // The wasted day halves the rate — that is the report's whole point.
    expect(am.rates?.applications_per_hour).toBeCloseTo(1);
    expect(am.coverage).toBeCloseTo(0.5);
  });

  it("excludes activity with no shift from rates but keeps it in totals", () => {
    const rows = [
      row("a", "2026-08-10", { easy_applications: 8 }),
      row("a", "2026-08-11", { easy_applications: 40 }), // never clocked in
    ];
    const { managers } = buildProductivity(rows, [shift("a", "2026-08-10", 8)], NOW);
    const am = managers[0];

    expect(am.counts.easy_applications).toBe(48); // totals keep everything
    expect(am.unmatched_days).toBe(1);
    expect(am.measured_hours).toBeCloseTo(8);
    // 40 unmeasured applications must not invent throughput.
    expect(am.rates?.applications_per_hour).toBeCloseTo(1);
    expect(am.days.find((d) => d.work_date === "2026-08-11")?.unmeasured).toBe(
      "no_shift"
    );
  });

  it("treats a shift left open overnight as unmeasurable", () => {
    const rows = [row("a", "2026-08-10", { easy_applications: 5 })];
    const { managers } = buildProductivity(
      rows,
      [shift("a", "2026-08-10", null)],
      NOW
    );
    const am = managers[0];
    expect(am.days[0].unmeasured).toBe("open_shift");
    expect(am.days[0].worked_ms).toBeNull();
    expect(am.measured_hours).toBe(0);
    expect(am.rates).toBeNull();
    expect(am.unmatched_days).toBe(1);
  });

  it("leaves anyone under the minimum measured hours unrated", () => {
    const rows = [row("a", "2026-08-10", { offers: 1 })];
    const shifts = [shift("a", "2026-08-10", MIN_RATED_HOURS - 1)];
    const { managers } = buildProductivity(rows, shifts, NOW);

    expect(managers[0].rates).toBeNull();
    expect(managers[0].pace).toBe("unrated");
    expect(managers[0].pace_index).toBeNull();
    // Still counted in the totals, just not rated.
    expect(managers[0].counts.offers).toBe(1);
  });

  it("bands pace against the team median and ranks by it", () => {
    // Three AMs, same 8h day, output 4 / 8 / 16 points.
    const rows = [
      row("slow", "2026-08-10", { easy_applications: 4 }),
      row("mid", "2026-08-10", { easy_applications: 8 }),
      row("fast", "2026-08-10", { easy_applications: 16 }),
    ];
    const shifts = ["slow", "mid", "fast"].map((id) => shift(id, "2026-08-10", 8));

    const { managers, team } = buildProductivity(rows, shifts, NOW);

    expect(team.median_score_per_hour).toBeCloseTo(1); // 8 points / 8h
    expect(team.rated_managers).toBe(3);

    // Ranked fastest first.
    expect(managers.map((m) => m.account_manager_id)).toEqual([
      "fast",
      "mid",
      "slow",
    ]);
    expect(managers[0].pace).toBe("fast");
    expect(managers[0].pace_index).toBeCloseTo(2);
    expect(managers[1].pace).toBe("steady");
    expect(managers[2].pace).toBe("slow");
    expect(managers[2].pace_index).toBeCloseTo(0.5);
  });

  it("sinks unrated managers below rated ones", () => {
    const rows = [
      row("rated", "2026-08-10", { easy_applications: 8 }),
      row("thin", "2026-08-10", { easy_applications: 500 }), // no shift at all
    ];
    const { managers } = buildProductivity(
      rows,
      [shift("rated", "2026-08-10", 8)],
      NOW
    );
    expect(managers.map((m) => m.account_manager_id)).toEqual(["rated", "thin"]);
    expect(managers[1].pace).toBe("unrated");
  });

  it("includes an AM who was on the clock but never logged anything", () => {
    const { managers } = buildProductivity([], [shift("ghost", "2026-08-10", 8)], NOW);
    expect(managers).toHaveLength(1);
    expect(managers[0].days_logged).toBe(0);
    expect(managers[0].idle_days).toBe(1);
    expect(managers[0].coverage).toBe(0);
    expect(managers[0].rates?.score_per_hour).toBe(0);
  });

  it("rolls the team totals up from every manager", () => {
    const rows = [
      row("a", "2026-08-10", { easy_applications: 10, offers: 1 }),
      row("b", "2026-08-10", { company_applications: 4 }),
    ];
    const shifts = [shift("a", "2026-08-10", 8), shift("b", "2026-08-10", 8)];
    const { team } = buildProductivity(rows, shifts, NOW);

    expect(team.managers).toBe(2);
    expect(team.measured_hours).toBeCloseTo(16);
    expect(team.funnel.applications).toBe(14);
    expect(team.funnel.offers).toBe(1);
    expect(team.score).toBeCloseTo(10 + 100 + 6);
  });

  it("handles an empty range without inventing numbers", () => {
    const { managers, team } = buildProductivity([], [], NOW);
    expect(managers).toEqual([]);
    expect(team.median_score_per_hour).toBeNull();
    expect(team.measured_hours).toBe(0);
    expect(team.funnel.interviews_per_100_applications).toBeNull();
  });
});

describe("formatPaceIndex", () => {
  it("reads as a signed distance from team pace", () => {
    expect(formatPaceIndex(1.34)).toBe("+34%");
    expect(formatPaceIndex(0.88)).toBe("−12%");
    expect(formatPaceIndex(1)).toBe("on pace");
    expect(formatPaceIndex(null)).toBe("—");
  });
});
