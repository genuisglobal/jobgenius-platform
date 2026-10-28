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
  shiftSheetDate,
  ACTIVITY_METRICS,
  type SheetRow,
} from "@/lib/activity-sheet";
import { watDate } from "@/lib/attendance";
import { attachActivity } from "@/lib/attendance-activity";
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
export const PRODUCTIVITY_DROP_CATEGORY = "productivity_weekly_drop";

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
export type DigestCheckinSummary = { completed: number; sheet_needs_update: number; blockers: number };

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
  week: DigestWeek,
  checkins?: DigestCheckinSummary
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

  if (checkins) {
    lines.push(`Daily check-ins: ${checkins.completed} across ${plural(manager.days_on_clock, "day")} on the clock.`);
    if (checkins.sheet_needs_update > 0) lines.push(`Sheet needs an update: ${checkins.sheet_needs_update} check-in day${checkins.sheet_needs_update === 1 ? "" : "s"}.`);
    if (checkins.blockers > 0) lines.push(`Blockers reported: ${checkins.blockers} check-in day${checkins.blockers === 1 ? "" : "s"}.`);
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
  manager_alerts: number;
};

/** A fall in logged applications worth discussing, with enough activity on
 * both sides to avoid comparing a full week with an absent or unlogged one. */
export function detectWeeklyActivityDrop(current: AmProductivity, previousApplications: number, previousLoggedDays: number): boolean {
  const decline = previousApplications - current.funnel.applications;
  return previousLoggedDays >= 3 && current.days_on_clock >= 3 && previousApplications >= 10
    && decline >= 5 && current.funnel.applications <= previousApplications * 0.6;
}

/**
 * Build and send the week's digests. Idempotent: an AM already sent a
 * digest for this week_start is skipped, so a re-run (or a workflow
 * retry) cannot double-send.
 */
export async function sendWeeklyProductivityDigests(
  week: DigestWeek = getDigestWeek()
): Promise<DigestResult> {
  const { start, end } = week;
  const previousStart = shiftSheetDate(start, -7);
  const previousEnd = shiftSheetDate(end, -7);

  // Imported here rather than at the top so composeDigestMessage and
  // getDigestWeek stay importable without database env vars — the same
  // reason lib/client-reports.ts does it.
  const { supabaseServer: supabaseAdmin } = await import("@/lib/supabase/server");
  const { sendNotification } = await import("@/lib/notify");
  const { isPeopleManagerRole, normalizeAMRole } = await import("@/lib/auth/roles");
  const { loadAmDeliveryData } = await import("@/lib/am-delivery-server");
  const { composeFridayDeliveryEmail, summarizeDelivery } = await import("@/lib/am-weekly-delivery");

  const [
    { data: entries, error: entriesError },
    { data: days, error: daysError },
    { data: previousEntries, error: previousError },
    { data: staff, error: staffError },
    { data: checkins, error: checkinError },
    delivery,
  ] = await Promise.all([
    supabaseAdmin
      .from("activity_sheet_entries")
      .select(ENTRY_COLUMNS)
      .gte("entry_date", start)
      .lte("entry_date", end),
    supabaseAdmin
      .from("attendance_days")
      .select("id, account_manager_id, work_date, signed_in_at, signed_out_at, adjusted_at")
      .gte("work_date", start)
      .lte("work_date", end),
    supabaseAdmin.from("activity_sheet_entries")
      .select("entry_date, account_manager_id, easy_applications, company_applications")
      .gte("entry_date", previousStart).lte("entry_date", previousEnd),
    supabaseAdmin.from("account_managers").select("id, name, email, role, status"),
    supabaseAdmin.from("am_daily_checkins")
      .select("account_manager_id, work_date, sheet_status, blocker_kind")
      .gte("work_date", start).lte("work_date", end),
    loadAmDeliveryData(start, end, previousStart, previousEnd),
  ]);

  if (entriesError || daysError || previousError || staffError || checkinError) {
    log.error("digest source query failed", {
      error: (entriesError ?? daysError ?? previousError ?? staffError ?? checkinError)?.message,
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

  const shifts: ShiftRow[] = await attachActivity(
    supabaseAdmin,
    shiftRecords.map((day) => ({
      id: day.id as string,
      account_manager_id: day.account_manager_id as string,
      am_name: "",
      work_date: day.work_date as string,
      signed_in_at: day.signed_in_at as string,
      signed_out_at: (day.signed_out_at as string | null) ?? null,
      adjusted_at: (day.adjusted_at as string | null) ?? null,
      breaks: breaksByDay.get(day.id as string) ?? [],
    })),
    new Date()
  );

  const { managers, team } = buildProductivity(rows, shifts, new Date());

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
  let managerAlerts = 0;

  const reportById = new Map(managers.map((manager) => [manager.account_manager_id, manager]));
  const amRecipients = (staff ?? []).filter((person) => normalizeAMRole(person.role as string | null) === "am" && person.status === "approved");
  for (const person of amRecipients) {
    const accountManagerId = person.id as string;
    if (alreadySent.has(accountManagerId)) {
      skipped += 1;
      continue;
    }
    const manager = reportById.get(accountManagerId);
    const ownCheckins = (checkins ?? []).filter((row) => row.account_manager_id === accountManagerId);
    const currentDelivery = summarizeDelivery(accountManagerId, start, delivery.assignments, delivery.current);
    const previousDelivery = summarizeDelivery(accountManagerId, previousStart, delivery.assignments, delivery.previous);
    const name = (person.name as string | null)?.trim() || (person.email as string).split("@")[0];
    const weekly = composeFridayDeliveryEmail(name, currentDelivery, previousDelivery);
    const productivity = manager ? composeDigestMessage(manager, team, week, {
      completed: ownCheckins.length,
      sheet_needs_update: ownCheckins.filter((row) => row.sheet_status === "needs_update").length,
      blockers: ownCheckins.filter((row) => row.blocker_kind !== "none").length,
    }) : null;
    const subject = weekly.subject;
    const body = productivity ? `${weekly.body}\n\nYour measured productivity details:\n${productivity.body}` : `${weekly.body}\n\nNo measured attendance or sheet activity was available for your productivity rate this week.`;
    const result = await sendNotification({
      userId: accountManagerId,
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
        measured_hours: manager?.measured_hours ?? null,
        score_per_hour: manager?.rates?.score_per_hour ?? null,
        pace: manager?.pace ?? "unrated",
      },
    });

    if (result.id) sent += 1;
    else skipped += 1;
  }

  // The private AM digest is also the source for an earlier manager signal.
  // This reports a fall in *logged* activity, not a performance verdict.
  // The separate three-week review still handles sustained pace concerns.
  if (new Date(`${end}T00:00:00Z`).getUTCDay() === 5) {
    const previousByAm = new Map<string, { applications: number; dates: Set<string> }>();
    for (const entry of previousEntries ?? []) {
      const id = entry.account_manager_id as string;
      const group = previousByAm.get(id) ?? { applications: 0, dates: new Set<string>() };
      group.applications += Number(entry.easy_applications ?? 0) + Number(entry.company_applications ?? 0);
      group.dates.add(entry.entry_date as string);
      previousByAm.set(id, group);
    }
    const staffById = new Map((staff ?? []).map((person) => [person.id as string, person]));
    const recipients = (staff ?? []).filter((person) => person.status === "approved" && isPeopleManagerRole(person.role as string | null));
    const { data: existingDrops, error: existingDropsError } = await supabaseAdmin.from("notifications")
      .select("user_id, payload")
      .eq("category", PRODUCTIVITY_DROP_CATEGORY).eq("payload->>week_start", start);
    if (existingDropsError) throw new Error("Could not check existing manager alerts.");
    const alerted = new Set((existingDrops ?? []).map((row) => `${row.user_id}:${(row.payload as Record<string, unknown> | null)?.account_manager_id ?? ""}`));

    for (const manager of managers) {
      const staffMember = staffById.get(manager.account_manager_id);
      if (!staffMember || normalizeAMRole(staffMember.role as string | null) !== "am") continue;
      const previous = previousByAm.get(manager.account_manager_id);
      if (!previous || !detectWeeklyActivityDrop(manager, previous.applications, previous.dates.size)) continue;
      const ownCheckins = (checkins ?? []).filter((row) => row.account_manager_id === manager.account_manager_id);
      const incomplete = ownCheckins.filter((row) => row.sheet_status === "needs_update").length;
      const blockers = ownCheckins.filter((row) => row.blocker_kind !== "none").length;
      const name = (staffMember?.name as string | null)?.trim() || (staffMember?.email as string | null) || "An account manager";
      const currentDelivery = summarizeDelivery(manager.account_manager_id, start, delivery.assignments, delivery.current);
      const body = [
        `${name}'s logged applications fell from ${previous.applications} last week to ${manager.funnel.applications} this week (${start} to ${end}).`,
        `Other sheet totals this week: ${manager.funnel.follow_ups} follow-ups, ${manager.funnel.interviews} interviews, ${manager.funnel.offers} offers.`,
        `Full-week client coverage: ${currentDelivery.clientsAtMinimum}/${currentDelivery.clients.length} reached 30 applications; ${currentDelivery.clientsWithPhoneInterview}/${currentDelivery.clients.length} had a phone interview; ${currentDelivery.clientsWithInterview}/${currentDelivery.clients.length} had an interview of any type.`,
        `Attendance: ${manager.days_on_clock} days on the clock; ${manager.idle_days} days on the clock with no sheet activity.`,
        `Daily check-ins: ${ownCheckins.length}; ${incomplete} marked the sheet as needing an update; ${blockers} reported a blocker.`,
        "",
        "Please check the sheet and ask about workload, client circumstances, leave, and missing entries before drawing a conclusion. This alert creates no employment action.",
      ].join("\n");
      for (const recipient of recipients) {
        const key = `${recipient.id}:${manager.account_manager_id}`;
        if (alerted.has(key)) continue;
        const result = await sendNotification({
          userId: recipient.id as string, userType: "am", category: PRODUCTIVITY_DROP_CATEGORY,
          subject: `Weekly activity drop to review: ${name}`, body,
          linkUrl: `/dashboard/productivity?start=${start}&end=${end}`, channel: "both",
          payload: { week_start: start, week_end: end, account_manager_id: manager.account_manager_id,
            previous_applications: previous.applications, applications: manager.funnel.applications },
        });
        if (result.id) { managerAlerts += 1; alerted.add(key); }
      }
    }
  }

  log.info("weekly digests processed", { week_start: start, sent, skipped, manager_alerts: managerAlerts });

  return {
    week_start: start,
    week_end: end,
    managers: amRecipients.length,
    sent,
    skipped,
    manager_alerts: managerAlerts,
  };
}
