import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import {
  ACTIVITY_METRICS,
  buildLeaderboard,
  coerceCounts,
  getRangeBounds,
  isSheetRange,
  normalizeSheetDate,
  sumCounts,
  type SheetRow,
} from "@/lib/activity-sheet";

const ENTRY_COLUMNS =
  "id, entry_date, job_seeker_id, account_manager_id, easy_applications, company_applications, follow_ups, interviews, offers, note, updated_at";

type EntryRecord = {
  id: string;
  entry_date: string;
  job_seeker_id: string;
  account_manager_id: string;
  note: string | null;
  updated_at: string | null;
} & Record<string, unknown>;

/**
 * GET /api/am/activity-sheet?date=YYYY-MM-DD&range=day|week|month
 *
 * The whole sheet for one day — every AM's rows, not just the caller's;
 * team-wide visibility is the point. `range` only widens the leaderboard
 * aggregation, never the day grid.
 */
export async function GET(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const date = normalizeSheetDate(searchParams.get("date"));
  const rangeParam = searchParams.get("range");
  const range = isSheetRange(rangeParam) ? rangeParam : "week";
  const bounds = getRangeBounds(date, range);

  // The leaderboard range always contains `date`, so one query feeds both
  // the grid (filtered to the day) and the standings.
  const start = bounds.start <= date ? bounds.start : date;
  const end = bounds.end >= date ? bounds.end : date;

  const [{ data: entries }, { data: assignments }] = await Promise.all([
    supabaseAdmin
      .from("activity_sheet_entries")
      .select(ENTRY_COLUMNS)
      .gte("entry_date", start)
      .lte("entry_date", end),
    supabaseAdmin
      .from("job_seeker_assignments")
      .select("job_seeker_id")
      .eq("account_manager_id", auth.user.id),
  ]);

  const records = (entries ?? []) as EntryRecord[];
  const mySeekerIds = Array.from(
    new Set((assignments ?? []).map((a) => a.job_seeker_id as string))
  );

  // Names for everyone who appears in the range, plus the caller's own
  // clients — they need a blank editable row even with nothing logged yet.
  const seekerIds = Array.from(
    new Set([...records.map((r) => r.job_seeker_id), ...mySeekerIds])
  );
  const amIds = Array.from(
    new Set([...records.map((r) => r.account_manager_id), auth.user.id])
  );

  const [{ data: seekers }, { data: managers }] = await Promise.all([
    seekerIds.length > 0
      ? supabaseAdmin.from("job_seekers").select("id, full_name, email").in("id", seekerIds)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin.from("account_managers").select("id, full_name, email").in("id", amIds),
  ]);

  const seekerNameById = new Map(
    (seekers ?? []).map((s) => [
      s.id as string,
      (s.full_name as string | null) || (s.email as string | null) || "Unknown client",
    ])
  );
  const amNameById = new Map(
    (managers ?? []).map((m) => [
      m.id as string,
      (m.full_name as string | null) || (m.email as string | null) || "Unknown AM",
    ])
  );

  function toSheetRow(record: EntryRecord): SheetRow {
    const counts = coerceCounts(record);
    return {
      id: record.id,
      entry_date: record.entry_date,
      job_seeker_id: record.job_seeker_id,
      seeker_name: seekerNameById.get(record.job_seeker_id) ?? "Unknown client",
      account_manager_id: record.account_manager_id,
      am_name: amNameById.get(record.account_manager_id) ?? "Unknown AM",
      note: record.note,
      updated_at: record.updated_at,
      ...counts,
    };
  }

  const rangeRows = records.map(toSheetRow);
  const dayRows = rangeRows.filter((row) => row.entry_date === date);

  // Blank rows so the caller's clients are always on the sheet, whether
  // or not anything has been logged for them today.
  const loggedToday = new Set(dayRows.map((row) => row.job_seeker_id));
  const blankRows: SheetRow[] = mySeekerIds
    .filter((id) => !loggedToday.has(id))
    .map((id) => ({
      id: null,
      entry_date: date,
      job_seeker_id: id,
      seeker_name: seekerNameById.get(id) ?? "Unknown client",
      account_manager_id: auth.user.id,
      am_name: amNameById.get(auth.user.id) ?? "Unknown AM",
      note: null,
      updated_at: null,
      ...coerceCounts(null),
    }));

  const rows = [...dayRows, ...blankRows].sort(
    (a, b) => a.am_name.localeCompare(b.am_name) || a.seeker_name.localeCompare(b.seeker_name)
  );

  return NextResponse.json({
    date,
    range,
    range_start: bounds.start,
    range_end: bounds.end,
    can_edit_any: isAdminRole(auth.user.role),
    my_account_manager_id: auth.user.id,
    rows,
    day_totals: sumCounts(dayRows),
    leaderboard: buildLeaderboard(rangeRows),
  });
}

/**
 * POST /api/am/activity-sheet
 * Body: { date, job_seeker_id, easy_applications, company_applications,
 *         follow_ups, interviews, offers, note }
 *
 * Upserts one cell-row of the sheet. An AM may only write rows for their
 * own assigned clients; admins may write any.
 */
export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const jobSeekerId = typeof body.job_seeker_id === "string" ? body.job_seeker_id : null;
  if (!jobSeekerId) {
    return NextResponse.json({ error: "job_seeker_id is required." }, { status: 400 });
  }

  const date = normalizeSheetDate(
    typeof body.date === "string" ? body.date : null
  );
  const isAdmin = isAdminRole(auth.user.role);

  if (!isAdmin) {
    const { data: assignment } = await supabaseAdmin
      .from("job_seeker_assignments")
      .select("job_seeker_id")
      .eq("account_manager_id", auth.user.id)
      .eq("job_seeker_id", jobSeekerId)
      .maybeSingle();
    if (!assignment) {
      return NextResponse.json(
        { error: "That client is not assigned to you." },
        { status: 403 }
      );
    }
  }

  // (entry_date, job_seeker_id) is unique without the AM, so an upsert
  // would silently reassign a row another AM already owns. Check first.
  const { data: existing } = await supabaseAdmin
    .from("activity_sheet_entries")
    .select("id, account_manager_id")
    .eq("entry_date", date)
    .eq("job_seeker_id", jobSeekerId)
    .maybeSingle();

  if (
    existing &&
    existing.account_manager_id !== auth.user.id &&
    !isAdmin
  ) {
    return NextResponse.json(
      { error: "Another account manager already logged this client today." },
      { status: 409 }
    );
  }

  const counts = coerceCounts(body);
  const note =
    typeof body.note === "string" && body.note.trim() !== "" ? body.note.trim() : null;

  const payload = {
    entry_date: date,
    job_seeker_id: jobSeekerId,
    // Admins editing someone else's row leave the credit where it is.
    account_manager_id: existing?.account_manager_id ?? auth.user.id,
    note,
    ...counts,
  };

  const { data: saved, error } = existing
    ? await supabaseAdmin
        .from("activity_sheet_entries")
        .update(payload)
        .eq("id", existing.id)
        .select(ENTRY_COLUMNS)
        .single()
    : await supabaseAdmin
        .from("activity_sheet_entries")
        .insert(payload)
        .select(ENTRY_COLUMNS)
        .single();

  if (error) {
    console.error("[activity-sheet:post]", error);
    return NextResponse.json({ error: "Failed to save the row." }, { status: 500 });
  }

  return NextResponse.json({
    entry: saved,
    total: ACTIVITY_METRICS.reduce((sum, metric) => sum + counts[metric], 0),
  });
}
