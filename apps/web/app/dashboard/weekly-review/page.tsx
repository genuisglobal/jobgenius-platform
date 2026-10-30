import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole, normalizeAMRole } from "@/lib/auth/roles";
import { ACTIVITY_METRICS, coerceCounts, getRangeBounds, shiftSheetDate, sumCounts } from "@/lib/activity-sheet";
import { buildWeeklyReview, type WeeklyReviewEntry } from "@/lib/weekly-seeker-review";
import WeeklyReviewClient from "./WeeklyReviewClient";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: { week?: string } };

function reviewWeek(value: string | undefined): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Vancouver", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const parsed = value ? new Date(`${value}T00:00:00Z`) : null;
  const anchor = value && /^\d{4}-\d{2}-\d{2}$/.test(value) && parsed && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : today;
  return getRangeBounds(anchor, "week").start;
}

async function listEntries(start: string, end: string): Promise<WeeklyReviewEntry[]> {
  const columns = ["entry_date", "job_seeker_id", "note", ...ACTIVITY_METRICS].join(", ");
  const entries: WeeklyReviewEntry[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin
      .from("activity_sheet_entries")
      .select(columns)
      .gte("entry_date", start)
      .lte("entry_date", end)
      .order("entry_date", { ascending: true })
      .order("job_seeker_id", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(`Unable to load weekly activity: ${error.message}`);
    const batch = (data ?? []) as unknown as Array<Record<string, unknown>>;
    entries.push(...batch.map((record) => ({
      entry_date: String(record.entry_date),
      job_seeker_id: String(record.job_seeker_id),
      note: typeof record.note === "string" ? record.note : null,
      ...coerceCounts(record),
    })));
    if (batch.length < 1000) break;
  }
  return entries;
}

export default async function WeeklyReviewPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") redirect("/login");
  if (normalizeAMRole(user.role) === "accountant") redirect("/dashboard/finance");

  const weekStart = reviewWeek(searchParams?.week);
  const weekEnd = shiftSheetDate(weekStart, 6);
  const previousStart = shiftSheetDate(weekStart, -7);
  const previousEnd = shiftSheetDate(weekStart, -1);
  const historyStart = shiftSheetDate(weekStart, -21);
  const canViewTeam = isPeopleManagerRole(user.role);

  const [{ data: activeStates, error: stateError }, { data: assignments, error: assignmentError }, entries] = await Promise.all([
    supabaseAdmin.from("job_seeker_intake_states").select("job_seeker_id, status"),
    supabaseAdmin.from("job_seeker_assignments").select("job_seeker_id, account_manager_id"),
    listEntries(historyStart, weekEnd),
  ]);
  if (stateError || assignmentError) throw new Error("Unable to load active job seekers for the weekly review.");

  const intakeStatusById = new Map((activeStates ?? []).map((row) => [row.job_seeker_id as string, row.status as string]));
  const visibleAssignments = (assignments ?? []).filter((row) =>
    canViewTeam || row.account_manager_id === user.id
  );
  const seekerIds = visibleAssignments.map((row) => row.job_seeker_id as string);
  const managerIds = Array.from(new Set(visibleAssignments.map((row) => row.account_manager_id as string)));

  const [{ data: seekers, error: seekerError }, { data: managers, error: managerError }] = await Promise.all([
    seekerIds.length
      ? supabaseAdmin.from("job_seekers").select("id, full_name, email, status").in("id", seekerIds)
      : Promise.resolve({ data: [], error: null }),
    managerIds.length
      ? supabaseAdmin.from("account_managers").select("id, name, email").in("id", managerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (seekerError || managerError) throw new Error("Unable to load names for the weekly review.");

  const seekerById = new Map((seekers ?? []).map((row) => [row.id as string, row]));
  const managerById = new Map((managers ?? []).map((row) => [row.id as string, row]));
  const reviewAssignments = visibleAssignments.filter((assignment) => seekerById.get(assignment.job_seeker_id as string)?.status === "active");
  const visibleIds = new Set(reviewAssignments.map((assignment) => assignment.job_seeker_id as string));
  const rows = buildWeeklyReview(
    reviewAssignments.map((assignment) => {
      const seeker = seekerById.get(assignment.job_seeker_id as string);
      const manager = managerById.get(assignment.account_manager_id as string);
      return {
        id: assignment.job_seeker_id as string,
        name: seeker?.full_name?.trim() || seeker?.email || "Unknown seeker",
        owner: manager?.name?.trim() || manager?.email || "Unassigned",
        intakeStatus: intakeStatusById.get(assignment.job_seeker_id as string) ?? "no intake state",
      };
    }),
    entries.filter((entry) => visibleIds.has(entry.job_seeker_id) && entry.entry_date >= weekStart),
    entries.filter((entry) => visibleIds.has(entry.job_seeker_id) && entry.entry_date >= previousStart && entry.entry_date <= previousEnd),
    weekStart,
    entries.filter((entry) => visibleIds.has(entry.job_seeker_id) && entry.entry_date < previousStart)
  ).sort((a, b) => b.prompts.length - a.prompts.length || a.name.localeCompare(b.name));

  const totals = sumCounts(rows.map((row) => row.counts));
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Friday seeker review</h1>
          <p className="mt-1 text-sm text-gray-600">Discuss work logged for each assigned seeker with an active account, changes from last week, and next steps.</p>
          <p className="mt-1 text-xs text-gray-500">Assigned seekers in intake are shown with their status so they can be distinguished from active clients.</p>
          <p className="mt-1 text-xs text-gray-500">Counts come from the team activity sheet. Gaps can mean work was not logged.</p>
        </div>
        <Link href={`/dashboard/activity-sheet?date=${weekEnd}&range=week`} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Open activity sheet</Link>
      </div>
      <WeeklyReviewClient weekStart={weekStart} weekEnd={weekEnd} rows={rows} totals={totals} showOwner={canViewTeam} />
    </div>
  );
}
