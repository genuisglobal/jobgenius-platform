import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole, normalizeAMRole } from "@/lib/auth/roles";
import { getRangeBounds, shiftSheetDate } from "@/lib/activity-sheet";
import { watDate } from "@/lib/attendance";
import { loadAmDeliveryData } from "@/lib/am-delivery-server";
import { buildAchievementRows, buildAchievements, type AchievementKind } from "@/lib/weekly-achievements";
import { CONTRIBUTION_LABELS, type ContributionType } from "@/lib/peer-recognition";
import PeerRecognitionClient, { type RecognitionView } from "./PeerRecognitionClient";

export const dynamic = "force-dynamic";

const LABELS: Record<AchievementKind, string> = {
  client_coverage: "Client coverage", phone_interviews: "Phone interview progress",
  outcomes: "Client outcomes", personal_best: "Personal best",
};

type PageProps = { searchParams?: { week?: string; am?: string } };

function selectedWeek(input: string | undefined, today: string): string {
  const current = getRangeBounds(today, "week").start;
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return current;
  const parsed = new Date(`${input}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== input) return current;
  const start = getRangeBounds(input, "week").start;
  return start >= shiftSheetDate(current, -84) && start <= current ? start : current;
}

export default async function AchievementsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") redirect("/login");
  if (normalizeAMRole(user.role) === "accountant") redirect("/dashboard/finance");
  const canViewTeamTrends = isPeopleManagerRole(user.role);
  const today = watDate();
  const weekStart = selectedWeek(searchParams?.week, today);
  const friday = shiftSheetDate(weekStart, 4);
  const previousStart = shiftSheetDate(weekStart, -21);
  const [{ data: staff, error: staffError }, { data: exemptions, error: leaveError }, { data: checkins, error: checkinError }, { data: recognitionRows, error: recognitionError }, delivery] = await Promise.all([
    supabaseAdmin.from("account_managers").select("id, name, email, role, status").eq("status", "approved"),
    supabaseAdmin.from("attendance_exemptions").select("account_manager_id").lte("start_date", friday).gte("end_date", weekStart),
    supabaseAdmin.from("am_daily_checkins").select("account_manager_id, sheet_status").gte("work_date", weekStart).lte("work_date", friday),
    supabaseAdmin.from("am_peer_recognitions").select("id, nominator_am_id, nominee_am_id, contribution_type, detail, status").eq("week_start", weekStart).order("created_at"),
    loadAmDeliveryData(weekStart, friday, previousStart, shiftSheetDate(weekStart, -3)),
  ]);
  const recognitionTablePending = recognitionError?.code === "42P01" || recognitionError?.code === "PGRST205";
  if (staffError || leaveError || checkinError || (recognitionError && !recognitionTablePending)) throw new Error("Could not load Friday achievements.");
  const managers = (staff ?? []).filter((person) => normalizeAMRole(person.role as string | null) === "am")
    .map((person) => ({ id: person.id as string, name: (person.name as string | null)?.trim() || (person.email as string).split("@")[0] }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const rows = buildAchievementRows(managers, delivery.assignments, [...delivery.current, ...delivery.previous], weekStart,
    new Set((exemptions ?? []).map((row) => row.account_manager_id as string)),
    new Set((checkins ?? []).filter((row) => row.sheet_status === "needs_update").map((row) => row.account_manager_id as string)));
  const achievements = buildAchievements(rows, today >= friday);
  const nameById = new Map((staff ?? []).map((person) => [person.id as string, (person.name as string | null)?.trim() || (person.email as string).split("@")[0]]));
  const recognitions: RecognitionView[] = (recognitionRows ?? []).filter((item) => item.contribution_type in CONTRIBUTION_LABELS).map((item) => ({
    id: item.id as string, nomineeName: nameById.get(item.nominee_am_id as string) ?? "AM",
    nominatorName: nameById.get(item.nominator_am_id as string) ?? "AM",
    contributionType: item.contribution_type as ContributionType, detail: item.detail as string,
    status: item.status as RecognitionView["status"],
  }));
  const ownRecognitionIds = new Set((recognitionRows ?? []).filter((item) => item.nominator_am_id === user.id).map((item) => item.id as string));
  const ownRecognitions = recognitions.filter((item) => ownRecognitionIds.has(item.id));
  const pendingRecognitions = canViewTeamTrends ? recognitions.filter((item) => item.status === "pending") : [];
  const approvedRecognitions = today >= friday ? recognitions.filter((item) => item.status === "approved") : [];
  const selectedId = canViewTeamTrends && rows.some((row) => row.manager.id === searchParams?.am) ? searchParams?.am : user.id;
  const own = rows.find((row) => row.manager.id === selectedId);
  const eligibleClients = rows.reduce((sum, row) => sum + (row.hasLeave ? 0 : row.current.clients.length), 0);
  const atMinimum = rows.reduce((sum, row) => sum + (row.hasLeave ? 0 : row.current.clientsAtMinimum), 0);
  const withPhone = rows.reduce((sum, row) => sum + (row.hasLeave ? 0 : row.current.clientsWithPhoneInterview), 0);
  const atTarget = rows.reduce((sum, row) => sum + (row.hasLeave ? 0 : row.current.clientsAtTarget), 0);
  const previousWeek = shiftSheetDate(weekStart, -7);
  const nextWeek = shiftSheetDate(weekStart, 7);
  const canGoBack = previousWeek >= shiftSheetDate(getRangeBounds(today, "week").start, -84);
  const canGoForward = nextWeek <= getRangeBounds(today, "week").start;
  const ownRate = own?.current.clients.length ? own.current.eligibleApplications / own.current.clients.length : null;
  const previousRate = own?.previous.clients.length ? own.previous.eligibleApplications / own.previous.clients.length : null;

  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-gray-900">Friday achievements</h1>
        <p className="mt-1 text-sm text-gray-600">Celebrate client progress and personal improvement without ranking colleagues.</p>
        <p className="mt-1 text-xs text-gray-500">Recognition uses logged activity. Friday figures can change until the sheet is complete.</p></div>
      <Link href={`/dashboard/weekly-review?week=${weekStart}`} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50">Open seeker review</Link>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <p className="font-semibold text-gray-900">Week of {weekStart} to {friday}</p>
      <div className="flex gap-2 text-sm">{canGoBack && <Link href={`/dashboard/achievements?week=${previousWeek}`} className="rounded-lg border border-gray-300 px-3 py-2">Previous week</Link>}{canGoForward && <Link href={`/dashboard/achievements?week=${nextWeek}`} className="rounded-lg border border-gray-300 px-3 py-2">Next week</Link>}</div>
    </div>
    <section className="rounded-xl border border-purple-200 bg-purple-50 p-5">
      <h2 className="font-semibold text-purple-950">Team client progress</h2>
      <p className="mt-1 text-xs text-purple-800">Full-week clients only; clients assigned during the week and AMs with recorded leave are excluded from this goal. 30 applications is the tolerated minimum; recognition begins at the 50-application target.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[["30 application minimum", atMinimum], ["50 application target", atTarget], ["Phone interview", withPhone]].map(([label, count]) => <div key={label} className="rounded-lg bg-white p-4"><p className="text-sm text-gray-600">{label}</p><p className="mt-1 text-2xl font-bold text-purple-900">{count} / {eligibleClients}</p></div>)}
      </div>
      {today >= friday && eligibleClients > 0 && atTarget === eligibleClients && withPhone === eligibleClients && <p className="mt-4 rounded-lg bg-white p-3 text-sm font-semibold text-purple-900">Team milestone: every eligible client reached the 50-application target and had a phone interview.</p>}
    </section>
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="font-semibold text-gray-900">Shared recognition</h2>
      {today < friday ? <p className="mt-3 text-sm text-gray-600">Achievements appear on Friday. Team progress above updates as work is logged.</p>
        : achievements.length === 0 ? <p className="mt-3 text-sm text-gray-600">No achievements are ready from the logged figures yet. Review missing entries before the Friday discussion.</p>
        : <div className="mt-4 grid gap-3 md:grid-cols-2">{achievements.map((item) => <div key={`${item.accountManagerId}:${item.kind}`} className="rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-amber-800">{LABELS[item.kind]}</p><p className="mt-1 font-semibold text-gray-900">{item.name}</p><p className="mt-1 text-sm text-gray-700">{item.detail}</p></div>)}</div>}
      <p className="mt-4 text-xs text-gray-500">Leave and a check-in marked “sheet needs update” pause recognition for that AM. Interview outcomes depend on hiring timelines; these achievements are for celebration, not employment decisions.</p>
    </section>
    {recognitionTablePending ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Peer recognition is being set up. The other Friday achievements remain available.</p> : <PeerRecognitionClient candidates={managers.filter((manager) => manager.id !== user.id)} own={ownRecognitions}
      approved={approvedRecognitions} pending={pendingRecognitions} canReview={canViewTeamTrends}
      canNominate={normalizeAMRole(user.role) === "am" && weekStart === getRangeBounds(today, "week").start && ownRecognitions.length < 2} />}
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-gray-900">Private weekly trend</h2><p className="mt-1 text-xs text-gray-500">Visible only to you and people managers. Compare your own weeks, with client load shown.</p></div>
        {canViewTeamTrends && <form method="get" className="flex gap-2"><input type="hidden" name="week" value={weekStart}/><select aria-label="Account manager" name="am" defaultValue={selectedId} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">{rows.map((row) => <option key={row.manager.id} value={row.manager.id}>{row.manager.name}</option>)}</select><button className="rounded-lg bg-purple-700 px-3 py-2 text-sm font-medium text-white">View</button></form>}</div>
      {own ? <><p className="mt-4 text-sm font-medium text-gray-900">{own.manager.name}</p><div className="mt-3 grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-gray-50 p-4"><p className="text-xs text-gray-500">Applications per client</p><p className="mt-1 text-xl font-semibold">{ownRate === null ? "—" : ownRate.toFixed(1)}</p><p className="text-xs text-gray-500">Last week: {previousRate === null ? "—" : previousRate.toFixed(1)}</p></div>
        <div className="rounded-lg bg-gray-50 p-4"><p className="text-xs text-gray-500">Clients at 30</p><p className="mt-1 text-xl font-semibold">{own.current.clientsAtMinimum} / {own.current.clients.length}</p><p className="text-xs text-gray-500">Last week: {own.previous.clientsAtMinimum} / {own.previous.clients.length}</p></div>
        <div className="rounded-lg bg-gray-50 p-4"><p className="text-xs text-gray-500">Clients with phone interview</p><p className="mt-1 text-xl font-semibold">{own.current.clientsWithPhoneInterview} / {own.current.clients.length}</p><p className="text-xs text-gray-500">Last week: {own.previous.clientsWithPhoneInterview} / {own.previous.clients.length}</p></div>
        <div className="rounded-lg bg-gray-50 p-4"><p className="text-xs text-gray-500">Interviews · offers</p><p className="mt-1 text-xl font-semibold">{own.current.interviews} · {own.current.offers}</p><p className="text-xs text-gray-500">Last week: {own.previous.interviews} · {own.previous.offers}</p></div>
      </div>{(own.hasLeave || own.sheetNeedsUpdate || own.current.newClients > 0 || own.current.clients.length !== own.previous.clients.length) && <p className="mt-3 text-xs text-amber-800">Comparison context: {own.hasLeave ? "recorded leave; " : ""}{own.sheetNeedsUpdate ? "sheet needs update; " : ""}{own.current.newClients ? `${own.current.newClients} new client(s) excluded from full-week goals; ` : ""}{own.current.clients.length !== own.previous.clients.length ? "client load changed." : ""}</p>}</>
        : <p className="mt-3 text-sm text-gray-600">No AM trend is available for this selection.</p>}
    </section>
    <p className="text-xs text-gray-500">Historical weeks use currently active client assignments, so reassigned or closed clients may be absent from older comparisons. Check the activity sheet before drawing conclusions.</p>
  </div>;
}
