// ============================================================
// Work roster (migration 118).
//
// Answers one question the productivity report could not: was this person
// supposed to be here? Without it, someone who never clocks in has no row
// at all — indistinguishable from someone who does not exist, and the
// cheapest way to avoid being measured.
//
// Pure module. Dates are plain YYYY-MM-DD strings throughout; weekday is
// derived through Date.UTC so the answer never depends on where the server
// happens to be.
// ============================================================

/** ISO weekday numbers, matching the `work_days` column. */
export const MONDAY_TO_FRIDAY: readonly number[] = [1, 2, 3, 4, 5];

export const WEEKDAY_LABELS: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

export const EXEMPTION_REASONS = [
  "leave",
  "holiday",
  "sick",
  "training",
  "other",
] as const;

export type ExemptionReason = (typeof EXEMPTION_REASONS)[number];

export function isExemptionReason(value: unknown): value is ExemptionReason {
  return (
    typeof value === "string" &&
    EXEMPTION_REASONS.includes(value as ExemptionReason)
  );
}

export const EXEMPTION_LABELS: Record<ExemptionReason, string> = {
  leave: "Leave",
  holiday: "Public holiday",
  sick: "Sick",
  training: "Training",
  other: "Other",
};

export type Exemption = {
  id: string;
  /** Null means the whole company — a public holiday or office closure. */
  account_manager_id: string | null;
  start_date: string;
  end_date: string;
  reason: ExemptionReason;
  note?: string | null;
};

export type WorkSchedule = {
  account_manager_id: string;
  work_days: number[];
};

/** ISO weekday (1 = Monday … 7 = Sunday) for a YYYY-MM-DD string. */
export function isoWeekday(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** Every date in an inclusive range, ascending. */
export function datesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let cursor = Date.parse(`${start}T00:00:00Z`);
  const last = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(cursor) || Number.isNaN(last)) return dates;

  // Bounded so a reversed or absurd range cannot spin here.
  let guard = 0;
  while (cursor <= last && guard < 1000) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 86_400_000;
    guard += 1;
  }
  return dates;
}

/**
 * A missing schedule means Monday–Friday. See the migration header on why
 * the default is the ordinary week rather than "unknown".
 */
export function workDaysFor(
  accountManagerId: string,
  schedules: WorkSchedule[]
): readonly number[] {
  const found = schedules.find(
    (schedule) => schedule.account_manager_id === accountManagerId
  );
  if (!found || found.work_days.length === 0) return MONDAY_TO_FRIDAY;
  return found.work_days;
}

/** The exemption covering a date, if any. Company-wide ones apply to all. */
export function exemptionFor(
  accountManagerId: string,
  date: string,
  exemptions: Exemption[]
): Exemption | null {
  return (
    exemptions.find(
      (exemption) =>
        (exemption.account_manager_id === null ||
          exemption.account_manager_id === accountManagerId) &&
        exemption.start_date <= date &&
        exemption.end_date >= date
    ) ?? null
  );
}

export type RosterDayKind = "expected" | "exempt" | "off";

export type RosterDay = {
  date: string;
  kind: RosterDayKind;
  /** Set when kind is "exempt". */
  reason?: ExemptionReason;
};

/**
 * Classify every date in a range for one person: a day they were expected,
 * a day they were excused, or a day off their roster entirely.
 *
 * An exemption beats the roster, so marking a public holiday does not have
 * to know who works which days.
 */
export function rosterForRange(
  accountManagerId: string,
  start: string,
  end: string,
  schedules: WorkSchedule[],
  exemptions: Exemption[]
): RosterDay[] {
  const workDays = workDaysFor(accountManagerId, schedules);

  return datesInRange(start, end).map((date) => {
    if (!workDays.includes(isoWeekday(date))) {
      return { date, kind: "off" as const };
    }
    const exemption = exemptionFor(accountManagerId, date, exemptions);
    if (exemption) {
      return { date, kind: "exempt" as const, reason: exemption.reason };
    }
    return { date, kind: "expected" as const };
  });
}

export type AttendanceSummary = {
  expected_days: number;
  exempt_days: number;
  /** Expected, not excused, and no shift and nothing logged. */
  absent_days: number;
  /** Expected days they actually turned up for. */
  present_days: number;
  /** present ÷ expected. Null when nothing was expected. */
  attendance_rate: number | null;
};

/**
 * Roll a person's roster up against the days they actually appeared.
 *
 * `appeared` is any day with a shift OR logged activity — someone who
 * worked but forgot to clock in is not absent, they are a data-quality
 * problem, and the productivity report already reports them as one.
 */
export function summariseAttendance(
  roster: RosterDay[],
  appeared: Set<string>
): AttendanceSummary {
  let expected = 0;
  let exempt = 0;
  let present = 0;

  for (const day of roster) {
    if (day.kind === "exempt") {
      exempt += 1;
      continue;
    }
    if (day.kind !== "expected") continue;
    expected += 1;
    if (appeared.has(day.date)) present += 1;
  }

  return {
    expected_days: expected,
    exempt_days: exempt,
    absent_days: expected - present,
    present_days: present,
    attendance_rate: expected > 0 ? present / expected : null,
  };
}

/** "Mon–Fri" for the common case, "Mon, Wed, Fri" for anything else. */
export function formatWorkDays(days: readonly number[]): string {
  const sorted = Array.from(new Set(days)).sort((a, b) => a - b);
  if (sorted.length === 0) return "—";

  const contiguous = sorted.every(
    (day, index) => index === 0 || day === sorted[index - 1] + 1
  );
  if (contiguous && sorted.length > 2) {
    return `${WEEKDAY_LABELS[sorted[0]]}–${WEEKDAY_LABELS[sorted[sorted.length - 1]]}`;
  }
  return sorted.map((day) => WEEKDAY_LABELS[day]).join(", ");
}

/** Coerces whatever arrives from JSON into a valid roster, or null. */
export function coerceWorkDays(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const days = Array.from(
    new Set(
      value
        .map((entry) => Number(entry))
        .filter((entry) => Number.isInteger(entry) && entry >= 1 && entry <= 7)
    )
  ).sort((a, b) => a - b);
  return days.length > 0 ? days : null;
}
