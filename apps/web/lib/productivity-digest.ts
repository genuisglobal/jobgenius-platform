// ============================================================
// Weekly productivity digest.
//
// Every Friday each account manager is sent their own week — hours,
// activity, output per hour, and where that sits against the team — as an
// in-app notification plus an email. The per-AM table itself is not
// public (see the scope rules in /api/am/productivity): a pace band is a
// judgement about a person, not a record of what they did, and the
// Activity Sheet's numbers are self-reported. Publishing a ranking built
// on self-reported numerators is an invitation to inflate them.
//
// So the comparison travels privately, to the one person it is about.
//
// Composition is pure and tested; only sendWeeklyProductivityDigests
// touches the database.
// ============================================================

import { createLogger } from "@/lib/logger";
import {
  coerceCounts,
  getRangeBounds,
  normalizeSheetDate,
  ACTIVITY_METRICS,
  type SheetRow,
} from "@/lib/activity-sheet";
import { watDate } from "@/lib/attendance";
import {
  MIN_RATED_HOURS,
  buildProductivity,
  formatHours,
  formatPaceIndex,
  formatRate,
  type AmProductivity,
  type ProductivityTeam,
  type ShiftRow,
} from "@/lib/am-productivity";

const log = createLogger("productivity-digest");

export const PRODUCTIVITY_DIGEST_CATEGORY = "am_productivity_digest";

/**
 * Below this many rated managers, "the team median" is one or two
 * colleagues wearing a statistic's clothes. The digest still reports the
 * AM's own rate; it just declines to dress a two-person comparison up as
 * a team benchmark.
 */
export const MIN_TEAM_FOR_COMPARISON = 3;

// ─── The week ────────────────────────────────────────────────────────────

export type DigestWeek = { start: string; end: string };

/**
 * Monday through the day the digest runs — Friday in the schedule, so the
 * week you just worked, not last week's news. Ending at "today" rather
 * than Sunday keeps the weekend out of a number sent before it happens.
 */
export function getDigestWeek(today: string = watDate()): DigestWeek {
  const anchor = normalizeSheetDate(today);
  const { start } = getRangeBounds(anchor, "week");
  return { start, end: anchor };
}

/** "Mon 10 Aug" — compact enough for a subject line's date range. */
function shortDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(parsed);
}

// ─── Composition ─────────────────────────────────────────────────────────

export type DigestMessage = { subject: string; body: string };

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * One AM's week as a message. Pure — every number arrives already
 * computed by buildProductivity.
 */
export function composeDigestMessage(
  manager: AmProductivity,
  team: ProductivityTeam,
  week: DigestWeek
): DigestMessage {
  const { funnel, counts } = manager;

  const subject = `Your week: ${plural(funnel.applications, "application")}, ${plural(
    funnel.interviews,
    "interview"
  )}, ${plural(funnel.offers, "offer")}`;

  const lines: string[] = [
    `Week of ${shortDate(week.start)} – ${shortDate(week.end)}.`,
    "",
    `On the clock: ${formatHours(manager.measured_hours)} across ${plural(
      manager.days_on_clock,
      "day"
    )}`,
    `Applications: ${funnel.applications} (${counts.easy_applications} easy, ${counts.company_applications} company)`,
    `Follow-ups: ${funnel.follow_ups}`,
    `Interviews: ${funnel.interviews} (${counts.phone_interviews} phone, ${counts.ai_interviews} AI, ${counts.video_interviews} video)`,
    `Offers: ${funnel.offers}`,
    "",
  ];

  if (manager.rates) {
    const rate = `Output: ${formatRate(manager.rates.score_per_hour)} points per hour`;
    const comparable =
      manager.pace_index !== null &&
      team.median_score_per_hour !== null &&
      team.rated_managers >= MIN_TEAM_FOR_COMPARISON;

    lines.push(
      comparable
        ? `${rate} — ${formatPaceIndex(manager.pace_index)} against the team median of ${formatRate(
            team.median_score_per_hour
          )}.`
        : `${rate}.`
    );
  } else {
    lines.push(
      `Not enough measured time this week to work out an hourly rate — that needs ${MIN_RATED_HOURS} hours of complete shifts.`
    );
  }

  if (funnel.applications > 0) {
    lines.push(
      `Conversion: ${formatRate(
        funnel.interviews_per_100_applications
      )} interviews and ${formatRate(
        funnel.offers_per_100_applications
      )} offers per 100 applications.`
    );
  }

  // Data-quality notes last, and only when there is something to say —
  // an AM whose week is clean should not be handed a list of clean bills.
  const notes: string[] = [];
  if (manager.idle_days > 0) {
    notes.push(
      `${plural(manager.idle_days, "day")} on the clock with nothing logged on the sheet.`
    );
  }
  if (manager.unmatched_days > 0) {
    notes.push(
      `${plural(
        manager.unmatched_days,
        "day"
      )} of logged work with no complete shift — never clocked in, or never signed out. That work is in your totals but not in your hourly rate.`
    );
  }
  if (notes.length > 0) {
    lines.push("", `Heads up: ${notes.join(" ")}`);
  }

  return { subject, body: lines.join("\n") };
}

// ─── Delivery ────────────────────────────────────────────────────────────

const ENTRY_COLUMNS = [
  "entry_date",
  "job_seeker_id",
  "account_manager_id",
  ...ACTIVITY_METRICS,
].join(", ");

export type DigestResult = {
  week_start: string;
  week_end: string;
  managers: number;
  sent: number;
  skipped: number;
};

/**
 * Build and send the week's digests. Idempotent: an AM already sent a
 * digest for this week_start is skipped, so a re-run (or a workflow
 * retry) cannot double-send.
 */
export async function sendWeeklyProductivityDigests(
  week: DigestWeek = getDigestWeek()
): Promise<DigestResult> {
  const { start, end } = week;

  // Imported here rather than at the top so composeDigestMessage and
  // getDigestWeek stay importable without database env vars — the same
  // reason lib/client-reports.ts does it.
  const { supabaseServer: supabaseAdmin } = await import("@/lib/supabase/server");
  const { sendNotification } = await import("@/lib/notify");

  const [
    { data: entries, error: entriesError },
    { data: days, error: daysError },
  ] = await Promise.all([
    supabaseAdmin
      .from("activity_sheet_entries")
      .select(ENTRY_COLUMNS)
      .gte("entry_date", start)
      .lte("entry_date", end),
    supabaseAdmin
      .from("attendance_days")
      .select("id, account_manager_id, work_date, signed_in_at, signed_out_at")
      .gte("work_date", start)
      .lte("work_date", end),
  ]);

  if (entriesError || daysError) {
    log.error("digest source query failed", {
      error: (entriesError ?? daysError)?.message,
    });
    throw new Error("Failed to load productivity data for the digest.");
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
      ? await supabaseAdmin
          .from("attendance_breaks")
          .select("attendance_day_id, started_at, ended_at")
          .in("attendance_day_id", dayIds)
      : { data: [], error: null };

  // Missing breaks would overstate everyone's hours, which is the
  // denominator of the one number this message exists to deliver.
  if (breaksError) {
    log.error("digest break lookup failed", { error: breaksError.message });
    throw new Error("Failed to load break data for the digest.");
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

  const rows: SheetRow[] = records.map((record) => ({
    id: null,
    entry_date: record.entry_date,
    job_seeker_id: record.job_seeker_id,
    seeker_name: "",
    account_manager_id: record.account_manager_id,
    am_name: "",
    note: null,
    updated_at: null,
    ...coerceCounts(record),
  }));

  const shifts: ShiftRow[] = shiftRecords.map((day) => ({
    id: day.id as string,
    account_manager_id: day.account_manager_id as string,
    am_name: "",
    work_date: day.work_date as string,
    signed_in_at: day.signed_in_at as string,
    signed_out_at: (day.signed_out_at as string | null) ?? null,
    breaks: breaksByDay.get(day.id as string) ?? [],
  }));

  const { managers, team } = buildProductivity(rows, shifts, new Date());

  if (managers.length === 0) {
    return { week_start: start, week_end: end, managers: 0, sent: 0, skipped: 0 };
  }

  // Already-sent guard, one query rather than one per manager.
  const { data: already } = await supabaseAdmin
    .from("notifications")
    .select("user_id")
    .eq("category", PRODUCTIVITY_DIGEST_CATEGORY)
    .eq("user_type", "am")
    .eq("payload->>week_start", start);

  const alreadySent = new Set((already ?? []).map((n) => n.user_id as string));

  let sent = 0;
  let skipped = 0;

  for (const manager of managers) {
    if (alreadySent.has(manager.account_manager_id)) {
      skipped += 1;
      continue;
    }

    const { subject, body } = composeDigestMessage(manager, team, week);
    const result = await sendNotification({
      userId: manager.account_manager_id,
      userType: "am",
      category: PRODUCTIVITY_DIGEST_CATEGORY,
      subject,
      body,
      linkUrl: `/dashboard/productivity?start=${start}&end=${end}`,
      channel: "both",
      // week_start is the idempotency key the guard above reads back.
      payload: {
        week_start: start,
        week_end: end,
        measured_hours: manager.measured_hours,
        score_per_hour: manager.rates?.score_per_hour ?? null,
        pace: manager.pace,
      },
    });

    if (result.id) sent += 1;
    else skipped += 1;
  }

  log.info("weekly digests processed", { week_start: start, sent, skipped });

  return {
    week_start: start,
    week_end: end,
    managers: managers.length,
    sent,
    skipped,
  };
}
