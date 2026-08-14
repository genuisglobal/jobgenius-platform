import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import {
  ACTIVITY_METRICS,
  coerceCounts,
  getRangeBounds,
  normalizeSheetDate,
  type SheetRow,
} from "@/lib/activity-sheet";
import { watDate } from "@/lib/attendance";
import { buildProductivity, type ShiftRow } from "@/lib/am-productivity";

// Built from ACTIVITY_METRICS for the same reason the sheet route does it:
// adding a metric must not silently leave the select list behind.
const ENTRY_COLUMNS = [
  "entry_date",
  "job_seeker_id",
  "account_manager_id",
  ...ACTIVITY_METRICS,
].join(", ");

type EntryRecord = {
  entry_date: string;
  job_seeker_id: string;
  account_manager_id: string;
} & Record<string, unknown>;

/**
 * A quarter of history. The report reads three tables unaggregated, so the
 * span is bounded rather than left to whatever a caller types in the URL.
 */
const MAX_SPAN_DAYS = 92;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isoDate(value: string | null): string | null {
  return value && ISO_DATE.test(value.trim()) ? value.trim() : null;
}

/** Whole days between two YYYY-MM-DD strings, inclusive of both ends. */
function spanDays(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.floor((b - a) / 86_400_000) + 1;
}

function shift(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * GET /api/am/productivity?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Output per hour on the clock, funnel conversion, and pace against the
 * team.
 *
 * Unlike the Activity Sheet and the attendance board, this one is NOT
 * team-visible. Those publish counts — a record of what someone did. This
 * publishes a judgement about how well they did it, derived from numbers
 * the same people type in themselves; ranking colleagues against each
 * other on a self-reported numerator mostly teaches everyone to inflate
 * the numerator. So:
 *
 *   - admins get every manager (`scope: "team"`),
 *   - everyone else gets their own row only (`scope: "self"`).
 *
 * The team aggregate — median rate, totals, funnel — is returned either
 * way. It is computed across ALL managers before the filter, because
 * "where do I sit" is the point of the report and an anonymous benchmark
 * gives that away about nobody.
 *
 * Defaults to the calendar month containing today.
 */
export async function GET(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const today = watDate();
  const defaults = getRangeBounds(normalizeSheetDate(today), "month");

  let start = isoDate(searchParams.get("start")) ?? defaults.start;
  let end = isoDate(searchParams.get("end")) ?? defaults.end;
  if (start > end) [start, end] = [end, start];

  // Trim from the far end so the requested `end` — the day the caller is
  // actually looking at — is the one that survives.
  if (spanDays(start, end) > MAX_SPAN_DAYS) {
    start = shift(end, -(MAX_SPAN_DAYS - 1));
  }

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

  // Either failure alone silently halves the report — an empty activity
  // list reads as "nobody worked", an empty shift list as "nobody was
  // measured". Neither is a conclusion worth rendering.
  if (entriesError || daysError) {
    console.error("[productivity:get]", entriesError ?? daysError);
    return NextResponse.json(
      { error: "Failed to load productivity data." },
      { status: 500 }
    );
  }

  // ENTRY_COLUMNS is built at runtime, so PostgREST cannot infer a row type
  // from it (see CLAUDE.md on Supabase casts).
  const records = (entries ?? []) as unknown as EntryRecord[];
  const shiftRecords = days ?? [];

  const dayIds = shiftRecords.map((d) => d.id as string);
  const amIds = Array.from(
    new Set([
      ...records.map((r) => r.account_manager_id),
      ...shiftRecords.map((d) => d.account_manager_id as string),
    ])
  );

  const [{ data: breaks, error: breaksError }, { data: managers, error: managersError }] =
    await Promise.all([
      dayIds.length > 0
        ? supabaseAdmin
            .from("attendance_breaks")
            .select("attendance_day_id, started_at, ended_at")
            .in("attendance_day_id", dayIds)
        : Promise.resolve({ data: [], error: null }),
      amIds.length > 0
        ? // `name`, not full_name — that spelling is job_seekers only.
          supabaseAdmin.from("account_managers").select("id, name, email").in("id", amIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  // Breaks failing would overstate everyone's worked hours, which is the
  // denominator of every rate on the page.
  if (breaksError) {
    console.error("[productivity:get] break lookup failed", breaksError);
    return NextResponse.json(
      { error: "Failed to load break data." },
      { status: 500 }
    );
  }
  if (managersError) {
    console.error("[productivity:get] AM name lookup failed", managersError);
  }

  const nameById = new Map(
    (managers ?? []).map((m) => {
      const name = typeof m.name === "string" ? m.name.trim() : "";
      const email = typeof m.email === "string" ? m.email.trim() : "";
      return [m.id as string, name || email || "Unknown AM"];
    })
  );

  const breaksByDay = new Map<string, ShiftRow["breaks"]>();
  for (const entry of breaks ?? []) {
    const key = entry.attendance_day_id as string;
    const list = breaksByDay.get(key) ?? [];
    list.push({
      // The report only measures durations; break identity is never used.
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
    am_name: nameById.get(record.account_manager_id) ?? "Unknown AM",
    note: null,
    updated_at: null,
    ...coerceCounts(record),
  }));

  const shifts: ShiftRow[] = shiftRecords.map((day) => ({
    id: day.id as string,
    account_manager_id: day.account_manager_id as string,
    am_name: nameById.get(day.account_manager_id as string) ?? "Unknown AM",
    work_date: day.work_date as string,
    signed_in_at: day.signed_in_at as string,
    signed_out_at: (day.signed_out_at as string | null) ?? null,
    breaks: breaksByDay.get(day.id as string) ?? [],
  }));

  const { managers: report, team } = buildProductivity(rows, shifts, new Date());

  // The median inside `team` is already computed from everyone; filtering
  // here removes colleagues' rows without changing the bar they set.
  const canSeeTeam = isAdminRole(auth.user.role);
  const visible = canSeeTeam
    ? report
    : report.filter((m) => m.account_manager_id === auth.user.id);

  return NextResponse.json({
    start,
    end,
    days: spanDays(start, end),
    scope: canSeeTeam ? "team" : "self",
    my_account_manager_id: auth.user.id,
    managers: visible,
    team,
  });
}
