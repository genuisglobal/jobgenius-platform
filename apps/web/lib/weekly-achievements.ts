import { shiftSheetDate } from "@/lib/activity-sheet";
import { summarizeDelivery, type DeliveryAssignment, type DeliveryEntry, type DeliverySummary } from "@/lib/am-weekly-delivery";

export type AchievementKind = "client_coverage" | "phone_interviews" | "outcomes" | "personal_best";
export type Achievement = { accountManagerId: string; name: string; kind: AchievementKind; detail: string };
export type AchievementManager = { id: string; name: string };
export type AchievementRow = { manager: AchievementManager; current: DeliverySummary; previous: DeliverySummary; prior: DeliverySummary[]; hasLeave: boolean; sheetNeedsUpdate: boolean };

export function buildAchievementRows(managers: AchievementManager[], assignments: DeliveryAssignment[], entries: DeliveryEntry[], weekStart: string, leaveIds: Set<string>, needsUpdateIds: Set<string>): AchievementRow[] {
  const weeks = [0, 1, 2, 3].map((offset) => shiftSheetDate(weekStart, -offset * 7));
  return managers.map((manager) => {
    const summaries = weeks.map((start) => summarizeDelivery(manager.id, start, assignments, entries.filter((entry) => entry.entry_date >= start && entry.entry_date <= shiftSheetDate(start, 4))));
    return { manager, current: summaries[0], previous: summaries[1], prior: summaries.slice(1), hasLeave: leaveIds.has(manager.id), sheetNeedsUpdate: needsUpdateIds.has(manager.id) };
  });
}

/** Recognition is published after Friday's work. Missing sheet data and leave pause comparisons. */
export function buildAchievements(rows: AchievementRow[], isCompleteWeek: boolean): Achievement[] {
  if (!isCompleteWeek) return [];
  const achievements: Achievement[] = [];
  for (const row of rows) {
    const { current, manager } = row;
    if (row.hasLeave || row.sheetNeedsUpdate || current.clients.length === 0) continue;
    const add = (kind: AchievementKind, detail: string) => achievements.push({ accountManagerId: manager.id, name: manager.name, kind, detail });
    if (current.clientsAtMinimum === current.clients.length) add("client_coverage", `${current.clientsAtMinimum} of ${current.clients.length} clients reached 30 applications`);
    if (current.clientsWithPhoneInterview === current.clients.length) add("phone_interviews", `${current.clientsWithPhoneInterview} of ${current.clients.length} clients had a phone interview`);
    if (current.interviews > 0 || current.offers > 0) add("outcomes", `${current.phoneInterviews} phone interviews · ${current.interviews} interviews · ${current.offers} offers`);
    const previousRates = row.prior.map((week) => week.clients.length ? week.eligibleApplications / week.clients.length : null);
    if (previousRates.every((rate) => rate !== null && rate > 0) && current.eligibleApplications / current.clients.length > Math.max(...previousRates as number[])) {
      add("personal_best", `${Math.round(current.eligibleApplications / current.clients.length)} applications per full-week client, a four-week high`);
    }
  }
  return achievements;
}
