import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole, normalizeAMRole } from "@/lib/auth/roles";
import { getRangeBounds, shiftSheetDate } from "@/lib/activity-sheet";
import { watDate } from "@/lib/attendance";
import { loadAmDeliveryData } from "@/lib/am-delivery-server";
import { buildRecognitionPilotWeeks, pilotPercent, type PilotWeek } from "@/lib/recognition-pilot";
import { buildDataQualityWeeks } from "@/lib/recognition-data-quality";
import type { Exemption, WorkSchedule } from "@/lib/roster";

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
  const [{ data: staff, error: staffError }, { data: checkins, error: checkinError }, { data: leave, error: leaveError }, { data: schedules, error: schedulesError }, { data: attendance, error: attendanceError }, delivery] = await Promise.all([
    supabaseAdmin.from("account_managers").select("id, name, email, role").eq("status", "approved"),
    supabaseAdmin.from("am_daily_checkins").select("account_manager_id, work_date, sheet_status").gte("work_date", earliestStart).lte("work_date", latestEnd),
    supabaseAdmin.from("attendance_exemptions").select("id, account_manager_id, start_date, end_date, reason").lte("start_date", latestEnd).gte("end_date", earliestStart),
    supabaseAdmin.from("work_schedules").select("account_manager_id, work_days"),
    supabaseAdmin.from("attendance_days").select("account_manager_id, work_date, signed_out_at").gte("work_date", earliestStart).lte("work_date", latestEnd),
    loadAmDeliveryData(latestStart, latestEnd, earliestStart, shiftSheetDate(latestStart, -3)),
  ]);
  if (staffError || checkinError || leaveError || schedulesError || attendanceError) throw new Error("Could not load the recognition pilot view.");
  const managers = (staff ?? []).filter((person) => normalizeAMRole(person.role as string | null) === "am")
    .map((person) => ({ id: person.id as string, name: (person.name as string | null)?.trim() || (person.email as string).split("@")[0] }));
  const managerIds = managers.map((person) => person.id);
  const weeks = buildRecognitionPilotWeeks(latestStart, managerIds, delivery.assignments, [...delivery.current, ...delivery.previous],
    (checkins ?? []) as Array<{ account_manager_id: string; work_date: string; sheet_status: string }>,
    (leave ?? []) as Array<{ account_manager_id: string; start_date: string; end_date: string }>);
  const qualityWeeks = buildDataQualityWeeks(latestStart, managers,
    (attendance ?? []) as Array<{ account_manager_id: string; work_date: string; signed_out_at: string | null }>,
    (checkins ?? []) as Array<{ account_manager_id: string; work_date: string; sheet_status: string }>,
    [...delivery.current, ...delivery.previous],
    (schedules ?? []) as WorkSchedule[], (leave ?? []) as Exemption[]);
  const latestQuality = qualityWeeks[3];
  const reviewRows = latestQuality.rows.filter((row) => row.missingAttendanceDates.length || row.missingCheckinDates.length || row.noSheetActivityDates.length || row.openShiftDates.length || row.needsUpdateDates.length).sort((a, b) => a.name.localeCompare(b.name));
  const first = weeks[0], latest = weeks[3];
  const firstCoverage = pilotPercent(first.clientsAtMinimum, first.eligibleClients);
  const latestCoverage = pilotPercent(latest.clientsAtMinimum, latest.eligibleClients);
  const firstPhone = pilotPercent(first.clientsWithPhoneInterview, first.eligibleClients);
  const latestPhone = pilotPercent(latest.clientsWithPhoneInterview, latest.eligibleClients);
  const change = (start: number | null, end: number | null) => start === null || end === null ? "—" : `${end - start >= 0 ? "+" : ""}${end - start} pp`;
  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold text-gray-900">Recognition pilot</h1><p className="mt-1 text-sm text-gray-600">Four completed weeks of client progress and sheet quality, for people managers to review.</p></div><Link href="/dashboard/achievements" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50">Friday achievements</Link></div>
    <div className="grid gap-3 sm:grid-cols-3"><Stat label="30 application coverage change" value={change(firstCoverage, latestCoverage)}/><Stat label="Phone interview coverage change" value={change(firstPhone, latestPhone)}/><Stat label="Latest week record signals" value={String(latestQuality.missingAttendance + latestQuality.missingCheckins + latestQuality.noSheetActivityDays + latestQuality.openShifts + latestQuality.needsUpdateCheckins)}/></div>
    <section className="rounded-xl border border-gray-200 bg-white p-5"><h2 className="font-semibold text-gray-900">Data confidence</h2><p className="mt-1 text-sm text-gray-600">Review record gaps before comparing outcomes. Counts can overlap on the same day.</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-gray-200 text-left text-gray-500"><th className="py-2">Week</th><th>Expected days</th><th>Clocked-in days</th><th>No attendance record</th><th>Missing check-ins</th><th>No client activity logged</th><th>Open shifts</th><th>Sheet needs update</th></tr></thead><tbody>{qualityWeeks.map((week) => <tr key={week.start} className="border-b border-gray-100"><td className="py-3 font-medium">{week.start}</td><td>{week.expectedDays}</td><td>{week.attendedDays}</td><td>{week.missingAttendance}</td><td>{week.missingCheckins}</td><td>{week.noSheetActivityDays}</td><td>{week.openShifts}</td><td>{week.needsUpdateCheckins}</td></tr>)}</tbody></table></div>
      <p className="mt-3 text-xs text-gray-500">Expected days follow each AM’s work schedule (Monday–Friday by default) and exclude approved exemptions and company holidays. “No attendance record” can include work logged without a clock-in; it is a record check, not an absence finding. “No client activity” excludes a day whose check-in says no client work. The pilot covers Monday–Friday.</p>
      <h3 className="mt-5 text-sm font-semibold text-gray-900">Latest week: records to review</h3>
      {reviewRows.length ? <div className="mt-2 space-y-2">{reviewRows.map((row) => <div key={row.accountManagerId} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><p className="font-medium text-gray-900">{row.name}</p><p className="mt-1 text-gray-700">{row.missingAttendanceDates.length > 0 && `No attendance record: ${row.missingAttendanceDates.join(", ")}. `}{row.activityWithoutAttendanceDates.length > 0 && `Work logged without clock-in: ${row.activityWithoutAttendanceDates.join(", ")}. `}{row.missingCheckinDates.length > 0 && `Missing check-in: ${row.missingCheckinDates.join(", ")}. `}{row.noSheetActivityDates.length > 0 && `No client activity logged: ${row.noSheetActivityDates.join(", ")}. `}{row.openShiftDates.length > 0 && `Open shift: ${row.openShiftDates.join(", ")}. `}{row.needsUpdateDates.length > 0 && `Sheet needs update: ${row.needsUpdateDates.join(", ")}.`}</p></div>)}</div> : <p className="mt-2 text-sm text-gray-600">No record gaps were found in the latest completed week.</p>}
    </section>
    <div className="grid gap-4 md:grid-cols-2">{weeks.map((week) => <WeekCard key={week.start} week={week}/>)}</div>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><h2 className="font-semibold">How to read this pilot</h2><p className="mt-2">Check whether more clients reach the 30 application minimum and receive phone interviews while record gaps are resolved. The 50 application target, interviews, and offers provide context. There is no combined score or employee ranking.</p><p className="mt-2">Each week uses currently active client assignments; closed or reassigned clients may be missing from older weeks. New assignments and AMs with recorded leave are excluded from that week’s coverage denominator. Check-in counts include submitted check-ins only.</p></div>
  </div>;
}
