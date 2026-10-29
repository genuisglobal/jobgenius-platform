import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole, normalizeAMRole } from "@/lib/auth/roles";
import { getRangeBounds, shiftSheetDate } from "@/lib/activity-sheet";
import { watDate } from "@/lib/attendance";
import { loadAmDeliveryData } from "@/lib/am-delivery-server";
import { buildRecognitionPilotWeeks, pilotPercent, type PilotWeek } from "@/lib/recognition-pilot";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-sm text-gray-500">{label}</p><p className="mt-1 text-2xl font-bold text-gray-900">{value}</p></div>;
}

function CoverageBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const percent = pilotPercent(count, total);
  return <div><div className="flex justify-between gap-2 text-sm"><span className="text-gray-700">{label}</span><span className="font-semibold text-gray-900">{percent === null ? "—" : `${percent}%`} <span className="font-normal text-gray-500">({count}/{total})</span></span></div><div className="mt-1 h-2.5 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${percent ?? 0}%` }} /></div></div>;
}

function WeekCard({ week }: { week: PilotWeek }) {
  return <section className="rounded-xl border border-gray-200 bg-white p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-semibold text-gray-900">{week.start} to {week.end}</h2><span className="text-xs text-gray-500">{week.eligibleClients} eligible full-week clients</span></div>
    <div className="mt-4 space-y-3"><CoverageBar label="Reached 30 applications" count={week.clientsAtMinimum} total={week.eligibleClients} color="bg-purple-700"/><CoverageBar label="Reached 50 applications" count={week.clientsAtTarget} total={week.eligibleClients} color="bg-orange-500"/><CoverageBar label="Had a phone interview" count={week.clientsWithPhoneInterview} total={week.eligibleClients} color="bg-green-600"/></div>
    <div className="mt-4 grid grid-cols-3 gap-3 border-t border-gray-100 pt-4 text-sm"><div><p className="text-gray-500">Applications</p><p className="font-semibold">{week.applications}</p></div><div><p className="text-gray-500">Interviews</p><p className="font-semibold">{week.interviews}</p></div><div><p className="text-gray-500">Offers</p><p className="font-semibold">{week.offers}</p></div></div>
    <p className="mt-4 text-xs text-gray-500">{week.checkins} check-ins submitted · {week.sheetNeedsUpdate} marked sheet needs update · {week.excludedAmCount} AMs with recorded leave · {week.newClients} new assignments excluded from full-week goals</p>
  </section>;
}

export default async function RecognitionPilotPage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") redirect("/login");
  if (!isPeopleManagerRole(user.role)) redirect("/dashboard");
  const today = watDate();
  const currentStart = getRangeBounds(today, "week").start;
  const currentFriday = shiftSheetDate(currentStart, 4);
  const latestStart = today > currentFriday ? currentStart : shiftSheetDate(currentStart, -7);
  const earliestStart = shiftSheetDate(latestStart, -21);
  const latestEnd = shiftSheetDate(latestStart, 4);
  const [{ data: staff, error: staffError }, { data: checkins, error: checkinError }, { data: leave, error: leaveError }, delivery] = await Promise.all([
    supabaseAdmin.from("account_managers").select("id, role").eq("status", "approved"),
    supabaseAdmin.from("am_daily_checkins").select("account_manager_id, work_date, sheet_status").gte("work_date", earliestStart).lte("work_date", latestEnd),
    supabaseAdmin.from("attendance_exemptions").select("account_manager_id, start_date, end_date").lte("start_date", latestEnd).gte("end_date", earliestStart),
    loadAmDeliveryData(latestStart, latestEnd, earliestStart, shiftSheetDate(latestStart, -3)),
  ]);
  if (staffError || checkinError || leaveError) throw new Error("Could not load the recognition pilot view.");
  const managerIds = (staff ?? []).filter((person) => normalizeAMRole(person.role as string | null) === "am").map((person) => person.id as string);
  const weeks = buildRecognitionPilotWeeks(latestStart, managerIds, delivery.assignments, [...delivery.current, ...delivery.previous],
    (checkins ?? []) as Array<{ account_manager_id: string; work_date: string; sheet_status: string }>,
    (leave ?? []) as Array<{ account_manager_id: string; start_date: string; end_date: string }>);
  const first = weeks[0], latest = weeks[3];
  const firstCoverage = pilotPercent(first.clientsAtMinimum, first.eligibleClients);
  const latestCoverage = pilotPercent(latest.clientsAtMinimum, latest.eligibleClients);
  const firstPhone = pilotPercent(first.clientsWithPhoneInterview, first.eligibleClients);
  const latestPhone = pilotPercent(latest.clientsWithPhoneInterview, latest.eligibleClients);
  const change = (start: number | null, end: number | null) => start === null || end === null ? "—" : `${end - start >= 0 ? "+" : ""}${end - start} pp`;
  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold text-gray-900">Recognition pilot</h1><p className="mt-1 text-sm text-gray-600">Four completed weeks of client progress and sheet quality, for people managers to review.</p></div><Link href="/dashboard/achievements" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50">Friday achievements</Link></div>
    <div className="grid gap-3 sm:grid-cols-3"><Stat label="30 application coverage change" value={change(firstCoverage, latestCoverage)}/><Stat label="Phone interview coverage change" value={change(firstPhone, latestPhone)}/><Stat label="Latest week sheet updates needed" value={String(latest.sheetNeedsUpdate)}/></div>
    <div className="grid gap-4 md:grid-cols-2">{weeks.map((week) => <WeekCard key={week.start} week={week}/>)}</div>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><h2 className="font-semibold">How to read this pilot</h2><p className="mt-2">Check whether more clients reach the 30 application minimum and receive phone interviews without an increase in check-ins marked “sheet needs update.” The 50 application target, interviews, and offers provide context. There is no combined score or employee ranking.</p><p className="mt-2">Each week uses currently active client assignments; closed or reassigned clients may be missing from older weeks. New assignments and AMs with recorded leave are excluded from that week’s coverage denominator. Check-in counts include submitted check-ins only and do not measure attendance completeness.</p></div>
  </div>;
}
