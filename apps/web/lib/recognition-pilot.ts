import { shiftSheetDate } from "@/lib/activity-sheet";
import { summarizeDelivery, type DeliveryAssignment, type DeliveryEntry } from "@/lib/am-weekly-delivery";

export type PilotCheckin = { account_manager_id: string; work_date: string; sheet_status: string };
export type PilotLeave = { account_manager_id: string; start_date: string; end_date: string };
export type PilotWeek = {
  start: string; end: string; eligibleClients: number; clientsAtMinimum: number; clientsAtTarget: number;
  clientsWithPhoneInterview: number; applications: number; interviews: number; offers: number;
  checkins: number; sheetNeedsUpdate: number; excludedAmCount: number; newClients: number;
};

/** Four weekly team snapshots. Leave pauses client coverage comparisons for that AM. */
export function buildRecognitionPilotWeeks(latestWeekStart: string, managerIds: string[], assignments: DeliveryAssignment[], entries: DeliveryEntry[], checkins: PilotCheckin[], leave: PilotLeave[]): PilotWeek[] {
  return [3, 2, 1, 0].map((offset) => {
    const start = shiftSheetDate(latestWeekStart, -7 * offset);
    const end = shiftSheetDate(start, 4);
    const weekEntries = entries.filter((entry) => entry.entry_date >= start && entry.entry_date <= end);
    const weekCheckins = checkins.filter((checkin) => checkin.work_date >= start && checkin.work_date <= end && managerIds.includes(checkin.account_manager_id));
    const excludedIds = new Set(leave.filter((item) => item.start_date <= end && item.end_date >= start).map((item) => item.account_manager_id));
    const result: PilotWeek = { start, end, eligibleClients: 0, clientsAtMinimum: 0, clientsAtTarget: 0,
      clientsWithPhoneInterview: 0, applications: 0, interviews: 0, offers: 0,
      checkins: weekCheckins.length, sheetNeedsUpdate: weekCheckins.filter((item) => item.sheet_status === "needs_update").length,
      excludedAmCount: managerIds.filter((id) => excludedIds.has(id)).length, newClients: 0 };
    for (const id of managerIds) {
      const summary = summarizeDelivery(id, start, assignments, weekEntries);
      result.applications += summary.applications;
      result.interviews += summary.interviews;
      result.offers += summary.offers;
      result.newClients += summary.newClients;
      if (excludedIds.has(id)) continue;
      result.eligibleClients += summary.clients.length;
      result.clientsAtMinimum += summary.clientsAtMinimum;
      result.clientsAtTarget += summary.clientsAtTarget;
      result.clientsWithPhoneInterview += summary.clientsWithPhoneInterview;
    }
    return result;
  });
}

export function pilotPercent(count: number, total: number): number | null {
  return total > 0 ? Math.round(count / total * 100) : null;
}
