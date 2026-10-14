import { describe, it, expect } from "vitest";
import { emptyCounts, type ActivityCounts } from "@/lib/activity-sheet";
import {
  LOW_COVERAGE,
  MIN_TYPED_TO_FLAG,
  buildFlags,
  buildReconciliation,
  compare,
  emptyRecorded,
  formatCoverage,
  formatGap,
  typedApplications,
  typedCorroboratedInterviews,
  type RecordedDay,
  type TypedDay,
} from "@/lib/activity-reconciliation";

function typed(
  amId: string,
  date: string,
  counts: Partial<ActivityCounts>
): TypedDay {
  return {
    account_manager_id: amId,
    am_name: `AM ${amId}`,
    work_date: date,
    counts: { ...emptyCounts(), ...counts },
  };
}

function recorded(
  amId: string,
  date: string,
  values: Partial<ReturnType<typeof emptyRecorded>>
): RecordedDay {
  return {
    account_manager_id: amId,
    work_date: date,
    recorded: { ...emptyRecorded(), ...values },
  };
}

describe("compare", () => {
  it("reports the gap and the share corroborated", () => {
    expect(compare(40, 10)).toEqual({
      typed: 40,
      recorded: 10,
      gap: 30,
      coverage: 0.25,
    });
  });

  it("returns null coverage rather than zero when nothing was typed", () => {
    // Nothing claimed is not 0% corroborated — there is nothing to corroborate.
    expect(compare(0, 5).coverage).toBeNull();
  });

  it("allows recorded to exceed typed", () => {
    const result = compare(3, 8);
    expect(result.gap).toBe(-5);
    expect(result.coverage).toBeGreaterThan(1);
  });
});

describe("typed counts", () => {
  it("adds easy and company applications", () => {
    expect(
      typedApplications({ easy_applications: 12, company_applications: 8 })
    ).toBe(20);
  });

  it("excludes AI interviews, which the platform never records", () => {
    const counts = {
      phone_interviews: 3,
      video_interviews: 2,
      ai_interviews: 9,
    };
    // Counting the 9 would manufacture a permanent gap that means nothing.
    expect(typedCorroboratedInterviews(counts)).toBe(5);
  });
});

describe("buildFlags", () => {
  const none = compare(0, 0);

  it("stays silent on small numbers however bad the ratio", () => {
    const tiny = compare(MIN_TYPED_TO_FLAG - 1, 0);
    expect(buildFlags(tiny, none, none)).toEqual([]);
  });

  it("stays silent when coverage is merely imperfect", () => {
    const ok = compare(100, 60);
    expect(buildFlags(ok, none, none)).toEqual([]);
  });

  it("flags a large claim the platform can barely see", () => {
    const bad = compare(200, 10);
    const flags = buildFlags(bad, none, none);
    expect(flags).toHaveLength(1);
    expect(flags[0].metric).toBe("applications");
    expect(flags[0].message).toContain("200");
    expect(flags[0].message).toContain("5%");
  });

  it("does not fire exactly at the coverage boundary", () => {
    const boundary = compare(100, LOW_COVERAGE * 100);
    expect(buildFlags(boundary, none, none)).toEqual([]);
  });

  it("flags each metric independently", () => {
    const flags = buildFlags(compare(100, 2), compare(50, 1), compare(80, 0));
    expect(flags.map((f) => f.metric)).toEqual([
      "applications",
      "interviews",
      "follow_ups",
    ]);
  });
});

describe("buildReconciliation", () => {
  it("joins typed and recorded days per AM", () => {
    const { managers, totals } = buildReconciliation(
      [
        typed("a", "2026-08-10", { easy_applications: 10, follow_ups: 4 }),
        typed("a", "2026-08-11", { company_applications: 6 }),
      ],
      [
        recorded("a", "2026-08-10", { applications: 7, follow_ups: 4 }),
        recorded("a", "2026-08-11", { applications: 6 }),
      ]
    );

    expect(managers).toHaveLength(1);
    expect(managers[0].applications.typed).toBe(16);
    expect(managers[0].applications.recorded).toBe(13);
    expect(managers[0].follow_ups.coverage).toBe(1);
    expect(totals.applications.typed).toBe(16);
    expect(totals.managers).toBe(1);
  });

  it("compares a day present on only one side against zero", () => {
    const { managers } = buildReconciliation(
      [typed("a", "2026-08-10", { easy_applications: 5 })],
      [recorded("a", "2026-08-12", { applications: 3 })]
    );

    const days = managers[0].days;
    expect(days.map((d) => d.work_date)).toEqual(["2026-08-10", "2026-08-12"]);
    expect(days[0].applications.recorded).toBe(0);
    expect(days[1].applications.typed).toBe(0);
  });

  it("sorts the least corroborated first", () => {
    const { managers, totals } = buildReconciliation(
      [
        typed("clean", "2026-08-10", { easy_applications: 100 }),
        typed("suspect", "2026-08-10", { easy_applications: 100 }),
      ],
      [
        recorded("clean", "2026-08-10", { applications: 90 }),
        recorded("suspect", "2026-08-10", { applications: 3 }),
      ]
    );

    expect(managers[0].account_manager_id).toBe("suspect");
    expect(managers[0].flags).toHaveLength(1);
    expect(managers[1].flags).toHaveLength(0);
    expect(totals.flagged).toBe(1);
  });

  it("sorts an AM who typed nothing last, not first", () => {
    // Null coverage must not read as "0% corroborated" and top the list.
    const { managers } = buildReconciliation(
      [typed("typed-some", "2026-08-10", { easy_applications: 50 })],
      [
        recorded("typed-some", "2026-08-10", { applications: 40 }),
        recorded("typed-none", "2026-08-10", { applications: 5 }),
      ]
    );

    expect(managers.map((m) => m.account_manager_id)).toEqual([
      "typed-some",
      "typed-none",
    ]);
  });

  it("handles an empty range", () => {
    const { managers, totals } = buildReconciliation([], []);
    expect(managers).toEqual([]);
    expect(totals.flagged).toBe(0);
    expect(totals.applications.coverage).toBeNull();
  });
});

describe("formatting", () => {
  it("signs the gap in the direction that reads naturally", () => {
    expect(formatGap(18)).toBe("+18");
    expect(formatGap(-4)).toBe("−4");
    expect(formatGap(0)).toBe("0");
  });

  it("shows an em dash when there is nothing to corroborate", () => {
    expect(formatCoverage(null)).toBe("—");
    expect(formatCoverage(0.25)).toBe("25%");
  });
});
