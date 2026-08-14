// ============================================================
// AM productivity analytics.
//
// Joins the two things the platform already records separately — what an
// account manager did (Activity Sheet, migration 113/114) and how long
// they were on the clock (attendance, migration 115) — into output per
// hour, funnel conversion, and a pace rating against the team.
//
// Pure module: the API route owns the database, this owns the arithmetic.
//
// ─── The denominator problem ─────────────────────────────────────────────
//
// Naively dividing a range's activity by a range's hours produces a
// flattering-or-damning number depending on which records happen to be
// missing. Two failure modes matter and are handled explicitly:
//
//   1. On the clock, nothing logged. Real signal — a paid day that
//      produced nothing recorded. These days stay in the denominator, so
//      the rate drops. That is the point of the report.
//   2. Activity logged with no measurable shift (never clocked in, or a
//      shift left open overnight so its length is fiction). Counting the
//      work with no time against it would invent throughput out of a
//      missing record. Those days are excluded from the rate entirely and
//      surfaced as `unmatched_days` so the gap is visible rather than
//      silently inflating someone's numbers.
//
// So: rates are computed over days with a MEASURED shift, using the
// activity logged on those same days. Totals elsewhere in the payload are
// the honest full-range figures. The two deliberately disagree when
// records are missing — `unmatched_days` explains the difference.
//
// ─── Date keys ───────────────────────────────────────────────────────────
//
// `entry_date` is the AM's local calendar day; `work_date` is the WAT day.
// For a team working in West Africa these are the same string, which is
// why they can be joined directly. A genuinely remote AM west of UTC-1
// could log an evening's work against the previous WAT date; that shows
// up as an unmatched day rather than as silent corruption.
// ============================================================

import {
  emptyCounts,
  interviewTotal,
  rowTotal,
  scoreCounts,
  sumCounts,
  type ActivityCounts,
  type SheetRow,
} from "./activity-sheet";
import { isStale, workedMs, type AttendanceDay } from "./attendance";
import {
  rosterForRange,
  summariseAttendance,
  type AttendanceSummary,
  type Exemption,
  type WorkSchedule,
} from "./roster";

/** A shift as the board loads it — attendance day plus the AM's name. */
export type ShiftRow = AttendanceDay & { am_name: string };

/**
 * Minimum measured time before anyone is rated. Twenty minutes on the
 * clock with one offer logged is 300 points/hour, which is noise wearing
 * a number's clothes.
 */
export const MIN_RATED_HOURS = 4;

/**
 * Pace bands, as a multiple of the team's median score per hour. Median
 * rather than mean so one exceptional week cannot move the bar for
 * everyone else, and the gap between bands is wide enough that ordinary
 * day-to-day variation does not flip a label.
 */
export const FAST_THRESHOLD = 1.25;
export const SLOW_THRESHOLD = 0.75;

export type UnmeasuredReason = "no_shift" | "open_shift";

export type ProductivityDay = {
  work_date: string;
  counts: ActivityCounts;
  activities: number;
  score: number;
  /** Worked time minus breaks; null when the day cannot be measured. */
  worked_ms: number | null;
  unmeasured: UnmeasuredReason | null;
};

export type ProductivityRates = {
  /** Measured hours behind these rates — the sample size. */
  hours: number;
  score_per_hour: number;
  activities_per_hour: number;
  applications_per_hour: number;
  follow_ups_per_hour: number;
  interviews_per_hour: number;
  /** Minutes of measured time per application. Reads better than 0.02/h. */
  minutes_per_application: number | null;
};

export type ProductivityFunnel = {
  applications: number;
  follow_ups: number;
  interviews: number;
  offers: number;
  /** All null when their denominator is zero — never 0, never Infinity. */
  follow_ups_per_application: number | null;
  interviews_per_100_applications: number | null;
  offers_per_100_applications: number | null;
  offers_per_interview: number | null;
};

export type PaceBand = "fast" | "steady" | "slow" | "unrated";

export type AmProductivity = {
  account_manager_id: string;
  am_name: string;
  /** Everything logged in the range, measured or not. */
  counts: ActivityCounts;
  total: number;
  score: number;
  days: ProductivityDay[];
  /** Days with a measurable shift. */
  days_on_clock: number;
  /** Days anything was logged on the sheet. */
  days_logged: number;
  /** On the clock, nothing logged. */
  idle_days: number;
  /** Logged work with no measurable shift — excluded from `rates`. */
  unmatched_days: number;
  measured_hours: number;
  /** Share of on-clock days with activity logged; null with no shifts. */
  coverage: number | null;
  funnel: ProductivityFunnel;
  /** null below MIN_RATED_HOURS — small samples lie. */
  rates: ProductivityRates | null;
  pace: PaceBand;
  /** score_per_hour ÷ team median. 1.0 is exactly team pace. */
  pace_index: number | null;
  /**
   * Roster comparison (migration 118) — null when no roster was supplied,
   * so the absence of a roster reads as "not measured" rather than as
   * "perfect attendance".
   */
  attendance: AttendanceSummary | null;
};

/**
 * Roster inputs. Optional: without them the report behaves exactly as it
 * did before, and every `attendance` field is null.
 *
 * `managers` is the point of the whole thing. Buckets are otherwise built
 * only from rows and shifts, so someone who never clocked in and never
 * logged anything has nothing to build a bucket from and simply does not
 * appear. Seeding from the list of people who are supposed to be working
 * is what turns "invisible" into "absent".
 */
export type RosterInput = {
  start: string;
  end: string;
  managers: Array<{ id: string; name: string }>;
  schedules: WorkSchedule[];
  exemptions: Exemption[];
};

export type ProductivityTeam = {
  counts: ActivityCounts;
  total: number;
  score: number;
  measured_hours: number;
  /** The bar every pace_index is measured against; null if nobody rated. */
  median_score_per_hour: number | null;
  rated_managers: number;
  managers: number;
  funnel: ProductivityFunnel;
};

// ─── Derived counts ──────────────────────────────────────────────────────

/** Easy applies plus company applications — the sheet has no single column. */
export function applicationTotal(counts: Partial<ActivityCounts>): number {
  return (counts.easy_applications ?? 0) + (counts.company_applications ?? 0);
}

/** Guards every ratio in this module: no division by zero, no Infinity. */
function ratio(numerator: number, denominator: number): number | null {
  if (!(denominator > 0)) return null;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : null;
}

export function buildFunnel(counts: Partial<ActivityCounts>): ProductivityFunnel {
  const applications = applicationTotal(counts);
  const follow_ups = counts.follow_ups ?? 0;
  const interviews = interviewTotal(counts);
  const offers = counts.offers ?? 0;

  const per100 = (value: number) => {
    const r = ratio(value, applications);
    return r === null ? null : r * 100;
  };

  return {
    applications,
    follow_ups,
    interviews,
    offers,
    follow_ups_per_application: ratio(follow_ups, applications),
    interviews_per_100_applications: per100(interviews),
    offers_per_100_applications: per100(offers),
    offers_per_interview: ratio(offers, interviews),
  };
}

// ─── Aggregation ─────────────────────────────────────────────────────────

const MS_PER_HOUR = 3_600_000;

/**
 * Measured worked time for a shift, or null when the record cannot support
 * a number: a shift left open past its own day is a forgotten sign-out, not
 * an eighteen-hour shift, and reporting it as one would be a lie in the
 * direction that flatters the person who forgot.
 */
function measuredMs(shift: ShiftRow, now: Date): number | null {
  if (isStale(shift, now)) return null;
  return workedMs(shift, now);
}

type Bucket = {
  am_name: string;
  /** date → counts logged that day (summed across the AM's clients). */
  countsByDate: Map<string, ActivityCounts>;
  /** date → measured ms, or null when the shift exists but is unmeasurable. */
  shiftByDate: Map<string, number | null>;
};

function bucketFor(map: Map<string, Bucket>, id: string, name: string): Bucket {
  let bucket = map.get(id);
  if (!bucket) {
    bucket = { am_name: name, countsByDate: new Map(), shiftByDate: new Map() };
    map.set(id, bucket);
  }
  // A name from either source will do; prefer the first non-placeholder one.
  if (!bucket.am_name && name) bucket.am_name = name;
  return bucket;
}

/**
 * Median of a non-empty list. Even counts average the two middle values,
 * which for two managers means the bar sits exactly between them — both
 * land inside the steady band rather than one being labelled slow for
 * being marginally behind the other.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function paceFor(index: number | null): PaceBand {
  if (index === null) return "unrated";
  if (index >= FAST_THRESHOLD) return "fast";
  if (index < SLOW_THRESHOLD) return "slow";
  return "steady";
}

/**
 * The whole report. `rows` is every Activity Sheet row in the range (all
 * AMs), `shifts` every attendance day in the same range.
 */
export function buildProductivity(
  rows: SheetRow[],
  shifts: ShiftRow[],
  now: Date = new Date(),
  roster?: RosterInput
): { managers: AmProductivity[]; team: ProductivityTeam } {
  const buckets = new Map<string, Bucket>();

  // Seeded first so people with no data at all still get a row. Everything
  // below then fills in whatever they did do.
  for (const manager of roster?.managers ?? []) {
    bucketFor(buckets, manager.id, manager.name);
  }

  for (const row of rows) {
    const bucket = bucketFor(buckets, row.account_manager_id, row.am_name);
    const existing = bucket.countsByDate.get(row.entry_date);
    // One AM logs many clients a day; the sheet's unit is the client-row,
    // this report's unit is the day.
    bucket.countsByDate.set(
      row.entry_date,
      existing ? sumCounts([existing, row]) : sumCounts([row])
    );
  }

  for (const shift of shifts) {
    const bucket = bucketFor(buckets, shift.account_manager_id, shift.am_name);
    bucket.shiftByDate.set(shift.work_date, measuredMs(shift, now));
  }

  const managers: AmProductivity[] = [];

  // Array.from rather than iterating the Map directly — the build targets
  // ES5 without downlevelIteration (same reason activity-sheet.ts does it).
  for (const [account_manager_id, bucket] of Array.from(buckets.entries())) {
    const dates = Array.from(
      new Set([
        ...Array.from(bucket.countsByDate.keys()),
        ...Array.from(bucket.shiftByDate.keys()),
      ])
    ).sort();

    const days: ProductivityDay[] = [];
    let measuredMsTotal = 0;
    let daysOnClock = 0;
    let daysLogged = 0;
    let idleDays = 0;
    let unmatchedDays = 0;
    const measuredRows: ActivityCounts[] = [];

    for (const work_date of dates) {
      const counts = bucket.countsByDate.get(work_date) ?? emptyCounts();
      const activities = rowTotal(counts);
      const hasShift = bucket.shiftByDate.has(work_date);
      const ms = hasShift ? bucket.shiftByDate.get(work_date) ?? null : null;
      const unmeasured: UnmeasuredReason | null =
        ms !== null ? null : hasShift ? "open_shift" : "no_shift";

      if (activities > 0) daysLogged += 1;

      if (ms !== null) {
        daysOnClock += 1;
        measuredMsTotal += ms;
        measuredRows.push(counts);
        if (activities === 0) idleDays += 1;
      } else if (activities > 0) {
        unmatchedDays += 1;
      }

      days.push({
        work_date,
        counts,
        activities,
        score: scoreCounts(counts),
        worked_ms: ms,
        unmeasured,
      });
    }

    // Turned up at all: a shift, or work logged. Someone who worked but
    // forgot to clock in is a data-quality problem, not an absence — the
    // report already flags them through unmatched_days.
    const appeared = new Set<string>([
      ...Array.from(bucket.shiftByDate.keys()),
      ...Array.from(bucket.countsByDate.entries())
        .filter(([, counts]) => rowTotal(counts) > 0)
        .map(([date]) => date),
    ]);

    const attendance = roster
      ? summariseAttendance(
          rosterForRange(
            account_manager_id,
            roster.start,
            roster.end,
            roster.schedules,
            roster.exemptions
          ),
          appeared
        )
      : null;

    const counts = sumCounts(Array.from(bucket.countsByDate.values()));
    const measuredHours = measuredMsTotal / MS_PER_HOUR;
    const measuredCounts = sumCounts(measuredRows);

    let rates: ProductivityRates | null = null;
    if (measuredHours >= MIN_RATED_HOURS) {
      const applications = applicationTotal(measuredCounts);
      rates = {
        hours: measuredHours,
        score_per_hour: scoreCounts(measuredCounts) / measuredHours,
        activities_per_hour: rowTotal(measuredCounts) / measuredHours,
        applications_per_hour: applications / measuredHours,
        follow_ups_per_hour: measuredCounts.follow_ups / measuredHours,
        interviews_per_hour: interviewTotal(measuredCounts) / measuredHours,
        minutes_per_application: ratio(measuredHours * 60, applications),
      };
    }

    managers.push({
      account_manager_id,
      am_name: bucket.am_name || "Unknown AM",
      counts,
      total: rowTotal(counts),
      score: scoreCounts(counts),
      days,
      days_on_clock: daysOnClock,
      days_logged: daysLogged,
      idle_days: idleDays,
      unmatched_days: unmatchedDays,
      measured_hours: measuredHours,
      coverage: ratio(daysOnClock - idleDays, daysOnClock),
      funnel: buildFunnel(counts),
      rates,
      pace: "unrated",
      pace_index: null,
      attendance,
    });
  }

  // Pace is relative, so it can only be assigned once every manager's own
  // rate is known.
  const medianRate = median(
    managers
      .map((m) => m.rates?.score_per_hour)
      .filter((value): value is number => typeof value === "number")
  );

  for (const manager of managers) {
    if (manager.rates && medianRate !== null && medianRate > 0) {
      manager.pace_index = manager.rates.score_per_hour / medianRate;
      manager.pace = paceFor(manager.pace_index);
    }
  }

  // Rated managers rank by pace; unrated sink to the bottom, ordered by
  // raw output so the list still says something about them.
  managers.sort((a, b) => {
    if (a.pace_index !== null && b.pace_index !== null) {
      return b.pace_index - a.pace_index || a.am_name.localeCompare(b.am_name);
    }
    if (a.pace_index !== null) return -1;
    if (b.pace_index !== null) return 1;
    return b.score - a.score || a.am_name.localeCompare(b.am_name);
  });

  const teamCounts = sumCounts(managers.map((m) => m.counts));

  return {
    managers,
    team: {
      counts: teamCounts,
      total: rowTotal(teamCounts),
      score: scoreCounts(teamCounts),
      measured_hours: managers.reduce((sum, m) => sum + m.measured_hours, 0),
      median_score_per_hour: medianRate,
      rated_managers: managers.filter((m) => m.rates !== null).length,
      managers: managers.length,
      funnel: buildFunnel(teamCounts),
    },
  };
}

// ─── Formatting ──────────────────────────────────────────────────────────

/** Rates to one decimal. "—" for the null that means "not enough data". */
export function formatRate(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(1);
}

/** Hours as "6.5h", or "—" when unmeasured. */
export function formatHours(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 10) / 10}h`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

/**
 * Pace as a signed distance from team pace: "+34%", "−12%", "on pace".
 * A multiplier ("1.34×") reads like a score; a percentage reads like the
 * comparison it actually is.
 */
export function formatPaceIndex(index: number | null | undefined): string {
  if (index === null || index === undefined || !Number.isFinite(index)) return "—";
  const delta = Math.round((index - 1) * 100);
  if (delta === 0) return "on pace";
  return delta > 0 ? `+${delta}%` : `−${Math.abs(delta)}%`;
}

export const PACE_LABELS: Record<PaceBand, string> = {
  fast: "Fast",
  steady: "Steady",
  slow: "Slow",
  unrated: "Not enough data",
};

export const UNMEASURED_LABELS: Record<UnmeasuredReason, string> = {
  no_shift: "Never clocked in",
  open_shift: "Never signed out",
};
