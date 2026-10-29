import { rowTotal, shiftSheetDate } from "@/lib/activity-sheet";
import type { DeliveryEntry } from "@/lib/am-weekly-delivery";
import type { PilotCheckin } from "@/lib/recognition-pilot";

export type PilotAttendance = { account_manager_id: string; work_date: string; signed_out_at: string | null };
export type DataQualityRow = {
  accountManagerId: string; name: string; attendedDays: number;
  missingCheckinDates: string[]; noSheetActivityDates: string[]; openShiftDates: string[]; needsUpdateDates: string[];
};
export type DataQualityWeek = { start: string; end: string; rows: DataQualityRow[]; attendedDays: number; missingCheckins: number; noSheetActivityDays: number; openShifts: number; needsUpdateCheckins: number };

/** Review signals on observed clocked-in days; absence from the attendance table is outside this audit. */
export function buildDataQualityWeeks(latestWeekStart: string, managers: Array<{ id: string; name: string }>, attendance: PilotAttendance[], checkins: PilotCheckin[], entries: DeliveryEntry[]): DataQualityWeek[] {
  return [3, 2, 1, 0].map((offset) => {
    const start = shiftSheetDate(latestWeekStart, -7 * offset);
    const end = shiftSheetDate(start, 4);
    const rows = managers.map((manager): DataQualityRow => {
      const days = attendance.filter((day) => day.account_manager_id === manager.id && day.work_date >= start && day.work_date <= end);
      const ownCheckins = checkins.filter((checkin) => checkin.account_manager_id === manager.id && checkin.work_date >= start && checkin.work_date <= end);
      const checkinByDate = new Map(ownCheckins.map((checkin) => [checkin.work_date, checkin]));
      const sheetDates = new Set(entries.filter((entry) => entry.account_manager_id === manager.id && entry.entry_date >= start && entry.entry_date <= end && rowTotal(entry) > 0).map((entry) => entry.entry_date));
      return {
        accountManagerId: manager.id, name: manager.name, attendedDays: days.length,
        missingCheckinDates: days.filter((day) => !checkinByDate.has(day.work_date)).map((day) => day.work_date),
        noSheetActivityDates: days.filter((day) => !sheetDates.has(day.work_date) && checkinByDate.get(day.work_date)?.sheet_status !== "no_client_work").map((day) => day.work_date),
        openShiftDates: days.filter((day) => !day.signed_out_at).map((day) => day.work_date),
        needsUpdateDates: ownCheckins.filter((checkin) => checkin.sheet_status === "needs_update").map((checkin) => checkin.work_date),
      };
    });
    return { start, end, rows, attendedDays: rows.reduce((sum, row) => sum + row.attendedDays, 0),
      missingCheckins: rows.reduce((sum, row) => sum + row.missingCheckinDates.length, 0),
      noSheetActivityDays: rows.reduce((sum, row) => sum + row.noSheetActivityDates.length, 0),
      openShifts: rows.reduce((sum, row) => sum + row.openShiftDates.length, 0),
      needsUpdateCheckins: rows.reduce((sum, row) => sum + row.needsUpdateDates.length, 0) };
  });
}
