// ============================================================
// Weekly review sweep (migration 119).
//
// Split from lib/productivity-reviews.ts, which holds the pure detection
// and message composition. That file is imported by a client component;
// this one reaches the service-role Supabase client, and must never end
// up in a browser bundle even as an unreachable chunk.
// ============================================================

import { createLogger } from "@/lib/logger";
import {
  coerceCounts,
  getRangeBounds,
  ACTIVITY_METRICS,
  type SheetRow,
} from "@/lib/activity-sheet";
import { watDate } from "@/lib/attendance";
import { buildProductivity, type ShiftRow } from "@/lib/am-productivity";
import {
  LOOKBACK_WEEKS,
  PRODUCTIVITY_REVIEW_CATEGORY,
  composeReviewMessage,
  detectStreak,
  shiftWeeks,
  weekStartOf,
  type WeeklyPace,
} from "@/lib/productivity-reviews";

const log = createLogger("productivity-reviews");


const ENTRY_COLUMNS = [
  "entry_date",
  "job_seeker_id",
  "account_manager_id",
  ...ACTIVITY_METRICS,
].join(", ");

export type ReviewSweepResult = {
  week_start: string;
  assessed: number;
  concerns: number;
  commendations: number;
  skipped: number;
};

/**
 * Assess the week ending today, raise flags, notify people managers.
 * Idempotent through the unique (am, week_start, kind) index.
 */
export async function sweepProductivityReviews(
  today: string = watDate()
): Promise<ReviewSweepResult> {
  const { supabaseServer: db } = await import("@/lib/supabase/server");
  const { sendNotification } = await import("@/lib/notify");
  const { isPeopleManagerRole } = await import("@/lib/auth/roles");

  const currentWeek = weekStartOf(today);
  const firstWeek = shiftWeeks(currentWeek, -(LOOKBACK_WEEKS - 1));
  const rangeEnd = getRangeBounds(currentWeek, "week").end;

  const [{ data: entries, error: entriesError }, { data: days, error: daysError }] =
    await Promise.all([
      db
        .from("activity_sheet_entries")
        .select(ENTRY_COLUMNS)
        .gte("entry_date", firstWeek)
        .lte("entry_date", rangeEnd),
      db
        .from("attendance_days")
        .select("id, account_manager_id, work_date, signed_in_at, signed_out_at")
        .gte("work_date", firstWeek)
        .lte("work_date", rangeEnd),
    ]);

  if (entriesError || daysError) {
    log.error("review sweep source query failed", {
      error: (entriesError ?? daysError)?.message,
    });
    throw new Error("Failed to load productivity data for review.");
  }

  const records = (entries ?? []) as unknown as Array<
    { entry_date: string; job_seeker_id: string; account_manager_id: string } & Record<
      string,
      unknown
    >
  >;
  const shiftRecords = days ?? [];

  const dayIds = shiftRecords.map((d) => d.id as string);
  const { data: breaks, error: breaksError } =
    dayIds.length > 0
      ? await db
          .from("attendance_breaks")
          .select("attendance_day_id, started_at, ended_at")
          .in("attendance_day_id", dayIds)
      : { data: [], error: null };

  if (breaksError) {
    log.error("review sweep break lookup failed", { error: breaksError.message });
    throw new Error("Failed to load break data for review.");
  }

  const breaksByDay = new Map<string, ShiftRow["breaks"]>();
  for (const entry of breaks ?? []) {
    const key = entry.attendance_day_id as string;
    const list = breaksByDay.get(key) ?? [];
    list.push({
      id: `${key}:${entry.started_at as string}`,
      started_at: entry.started_at as string,
      ended_at: (entry.ended_at as string | null) ?? null,
    });
    breaksByDay.set(key, list);
  }

  const { data: staff } = await db
    .from("account_managers")
    .select("id, name, email, role");

  const nameById = new Map(
    (staff ?? []).map((m) => {
      const name = typeof m.name === "string" ? m.name.trim() : "";
      const email = typeof m.email === "string" ? m.email.trim() : "";
      return [m.id as string, name || email || "An account manager"];
    })
  );
  const managers = (staff ?? []).filter((m) =>
    isPeopleManagerRole(m.role as string | null)
  );

  const allRows: SheetRow[] = records.map((record) => ({
    id: null,
    entry_date: record.entry_date,
    job_seeker_id: record.job_seeker_id,
    seeker_name: "",
    account_manager_id: record.account_manager_id,
    am_name: nameById.get(record.account_manager_id) ?? "",
    note: null,
    updated_at: null,
    ...coerceCounts(record),
  }));

  const allShifts: ShiftRow[] = shiftRecords.map((day) => ({
    id: day.id as string,
    account_manager_id: day.account_manager_id as string,
    am_name: nameById.get(day.account_manager_id as string) ?? "",
    work_date: day.work_date as string,
    signed_in_at: day.signed_in_at as string,
    signed_out_at: (day.signed_out_at as string | null) ?? null,
    breaks: breaksByDay.get(day.id as string) ?? [],
  }));

  // One pass per week: pace is relative to that week's team median, so
  // the weeks cannot be assessed together.
  const paceByAm = new Map<string, WeeklyPace[]>();

  for (let i = 0; i < LOOKBACK_WEEKS; i += 1) {
    const weekStart = shiftWeeks(firstWeek, i);
    const bounds = getRangeBounds(weekStart, "week");

    const weekRows = allRows.filter(
      (row) => row.entry_date >= bounds.start && row.entry_date <= bounds.end
    );
    const weekShifts = allShifts.filter(
      (shift) => shift.work_date >= bounds.start && shift.work_date <= bounds.end
    );

    const { managers: report, team } = buildProductivity(
      weekRows,
      weekShifts,
      new Date()
    );

    for (const entry of report) {
      const list = paceByAm.get(entry.account_manager_id) ?? [];
      list.push({
        week_start: weekStart,
        pace: entry.pace,
        pace_index: entry.pace_index,
        measured_hours: entry.measured_hours,
        score_per_hour: entry.rates?.score_per_hour ?? null,
        team_median: team.median_score_per_hour,
      });
      paceByAm.set(entry.account_manager_id, list);
    }
  }

  let concerns = 0;
  let commendations = 0;
  let skipped = 0;

  for (const [accountManagerId, weeks] of Array.from(paceByAm.entries())) {
    const streak = detectStreak(
      weeks.slice().sort((a, b) => a.week_start.localeCompare(b.week_start))
    );
    if (!streak) continue;

    const amName = nameById.get(accountManagerId) ?? "An account manager";

    const { error: insertError } = await db
      .from("productivity_review_flags")
      .insert({
        account_manager_id: accountManagerId,
        week_start: currentWeek,
        kind: streak.kind,
        streak_weeks: streak.weeks.length,
        evidence: { weeks: streak.weeks },
      });

    if (insertError) {
      // 23505 = already flagged for this week. The sweep is idempotent by
      // design, so this is the expected path on a re-run, not a failure.
      if (insertError.code !== "23505") {
        log.warn("failed to raise review flag", {
          account_manager_id: accountManagerId,
          error: insertError.message,
        });
      }
      skipped += 1;
      continue;
    }

    const { subject, body } = composeReviewMessage(amName, streak);
    for (const manager of managers) {
      await sendNotification({
        userId: manager.id as string,
        userType: "am",
        category: PRODUCTIVITY_REVIEW_CATEGORY,
        subject,
        body,
        linkUrl: "/dashboard/admin/productivity-reviews",
        channel: "both",
        payload: {
          account_manager_id: accountManagerId,
          week_start: currentWeek,
          kind: streak.kind,
          streak_weeks: streak.weeks.length,
        },
      });
    }

    if (streak.kind === "concern") concerns += 1;
    else commendations += 1;
  }

  log.info("productivity review sweep complete", {
    week_start: currentWeek,
    assessed: paceByAm.size,
    concerns,
    commendations,
    skipped,
  });

  return {
    week_start: currentWeek,
    assessed: paceByAm.size,
    concerns,
    commendations,
    skipped,
  };
}
