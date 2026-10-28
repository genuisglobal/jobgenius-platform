import { applicationTotal } from "@/lib/am-productivity";
import { coerceCounts, interviewTotal, shiftSheetDate, type ActivityCounts } from "@/lib/activity-sheet";

export const APPLICATION_TARGET_PER_CLIENT = 50;
export const APPLICATION_MINIMUM_PER_CLIENT = 30;

export type DeliveryEntry = { account_manager_id: string; job_seeker_id: string; entry_date: string } & ActivityCounts;
export type DeliveryAssignment = { account_manager_id: string; job_seeker_id: string; name: string; assigned_date: string };
export type ClientDelivery = { id: string; name: string; applications: number; phoneInterviews: number; interviews: number; offers: number };
export type DeliverySummary = {
  clients: ClientDelivery[];
  newClients: number;
  applications: number;
  eligibleApplications: number;
  phoneInterviews: number;
  interviews: number;
  offers: number;
  clientsAtMinimum: number;
  clientsAtTarget: number;
  clientsWithPhoneInterview: number;
  clientsWithInterview: number;
  applicationClientEquivalents: number;
};

export function summarizeDelivery(accountManagerId: string, weekStart: string, assignments: DeliveryAssignment[], entries: DeliveryEntry[]): DeliverySummary {
  const own = assignments.filter((assignment) => assignment.account_manager_id === accountManagerId);
  const eligible = own.filter((assignment) => assignment.assigned_date <= weekStart);
  const clients = eligible.map((assignment) => {
    const rows = entries.filter((entry) => entry.account_manager_id === accountManagerId && entry.job_seeker_id === assignment.job_seeker_id);
    return {
      id: assignment.job_seeker_id,
      name: assignment.name,
      applications: rows.reduce((sum, row) => sum + applicationTotal(row), 0),
      phoneInterviews: rows.reduce((sum, row) => sum + row.phone_interviews, 0),
      interviews: rows.reduce((sum, row) => sum + interviewTotal(row), 0),
      offers: rows.reduce((sum, row) => sum + row.offers, 0),
    };
  });
  const eligibleApplications = clients.reduce((sum, client) => sum + client.applications, 0);
  const ownEntries = entries.filter((entry) => entry.account_manager_id === accountManagerId);
  const applications = ownEntries.reduce((sum, entry) => sum + applicationTotal(entry), 0);
  return {
    clients,
    newClients: own.length - eligible.length,
    applications,
    eligibleApplications,
    phoneInterviews: ownEntries.reduce((sum, entry) => sum + entry.phone_interviews, 0),
    interviews: ownEntries.reduce((sum, entry) => sum + interviewTotal(entry), 0),
    offers: ownEntries.reduce((sum, entry) => sum + entry.offers, 0),
    clientsAtMinimum: clients.filter((client) => client.applications >= APPLICATION_MINIMUM_PER_CLIENT).length,
    clientsAtTarget: clients.filter((client) => client.applications >= APPLICATION_TARGET_PER_CLIENT).length,
    clientsWithPhoneInterview: clients.filter((client) => client.phoneInterviews > 0).length,
    clientsWithInterview: clients.filter((client) => client.interviews > 0).length,
    applicationClientEquivalents: eligibleApplications / APPLICATION_MINIMUM_PER_CLIENT,
  };
}

export type DailyPace = {
  neededToBeatLastWeek: number;
  neededForMinimum: number;
  neededForTarget: number;
  projectedApplications: number | null;
  projectedSurpassDate: string | null;
  outlook: "too_early" | "ahead" | "behind";
};

/** Morning email: `completedDays` excludes today, so no incomplete day is projected as full. */
export function dailyPace(today: string, currentApplications: number, lastWeekApplications: number, clients: number): DailyPace {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = shiftSheetDate(today, -((weekday + 6) % 7));
  const completedDays = Math.max(0, Math.min(5, weekday === 0 ? 5 : weekday - 1));
  const neededToBeatLastWeek = Math.max(0, lastWeekApplications + 1 - currentApplications);
  const neededForMinimum = Math.max(0, clients * APPLICATION_MINIMUM_PER_CLIENT - currentApplications);
  const neededForTarget = Math.max(0, clients * APPLICATION_TARGET_PER_CLIENT - currentApplications);
  if (completedDays === 0) return { neededToBeatLastWeek, neededForMinimum, neededForTarget, projectedApplications: null, projectedSurpassDate: null, outlook: "too_early" };
  const pace = currentApplications / completedDays;
  const projectedApplications = Math.round(pace * 5);
  const daysNeeded = pace > 0 ? Math.ceil(neededToBeatLastWeek / pace) : Infinity;
  const projectedSurpassDate = neededToBeatLastWeek === 0 ? today : daysNeeded <= 5 - completedDays
    ? shiftSheetDate(monday, completedDays + daysNeeded - 1)
    : null;
  return {
    neededToBeatLastWeek, neededForMinimum, neededForTarget,
    projectedApplications,
    projectedSurpassDate,
    outlook: projectedApplications > lastWeekApplications ? "ahead" : "behind",
  };
}

export function deliveryEntry(record: Record<string, unknown>): DeliveryEntry {
  return {
    account_manager_id: String(record.account_manager_id),
    job_seeker_id: String(record.job_seeker_id),
    entry_date: String(record.entry_date),
    ...coerceCounts(record),
  };
}

function change(current: number, previous: number): string {
  const difference = current - previous;
  return difference > 0 ? `up ${difference}` : difference < 0 ? `down ${-difference}` : "unchanged";
}

export function composeDailyDeliveryEmail(name: string, today: string, current: DeliverySummary, previous: DeliverySummary): { subject: string; body: string } {
  const isMonday = new Date(`${today}T00:00:00Z`).getUTCDay() === 1;
  const pace = dailyPace(today, current.applications, previous.applications, current.clients.length);
  const targetPace = dailyPace(today, current.eligibleApplications, previous.eligibleApplications, current.clients.length);
  const lines = [
    isMonday
      ? `Welcome to a fresh week, ${name}. Thank you for last week's work; I hope this week goes even better.`
      : `Good morning, ${name}. Here is your progress through yesterday.`,
    "",
    `Last week: ${previous.applications} applications logged overall; ${previous.eligibleApplications} for ${previous.clients.length} full-week clients.`,
    `This week so far: ${current.applications} applications logged overall; ${current.eligibleApplications} for ${current.clients.length} full-week clients.`,
    `You need ${pace.neededToBeatLastWeek} more application${pace.neededToBeatLastWeek === 1 ? "" : "s"} this week to beat last week's result.`,
    `For your current full-week clients: ${targetPace.neededForMinimum} more to reach the 30-per-client minimum in total, and ${targetPace.neededForTarget} more to reach the 50-per-client target in total. Each client's own count still matters.`,
  ];
  if (pace.outlook === "too_early") lines.push("It is too early to project a finish; the pace estimate starts after Monday's work is logged.");
  else {
    lines.push(`At the current pace, the estimate is ${pace.projectedApplications} applications by Friday.`);
    lines.push(pace.neededToBeatLastWeek === 0
      ? "You have already beaten last week's application count."
      : pace.outlook === "ahead"
        ? `That pace could beat last week${pace.projectedSurpassDate ? ` around ${pace.projectedSurpassDate}` : ""}.`
        : "At this pace, you may not beat last week's application count. Review the plan and any blockers.");
    if (targetPace.projectedApplications! < current.clients.length * APPLICATION_TARGET_PER_CLIENT) {
      lines.push("At this pace, the 50-per-client application target is also unlikely this week.");
    }
  }
  lines.push(
    "",
    `Phone interviews: ${current.phoneInterviews}; all interviews: ${current.interviews}; offers: ${current.offers}.`,
    "Please keep the activity sheet current and complete your short daily check-in on Today. These are logged figures, so missing entries can change the outlook."
  );
  if (current.clients.length > 0) {
    lines.push("", "Per-client progress:");
    for (const client of current.clients) {
      lines.push(`  ${client.name}: ${client.applications}/50 applications (${Math.max(0, APPLICATION_MINIMUM_PER_CLIENT - client.applications)} to the 30 minimum), ${client.phoneInterviews} phone interviews, ${client.interviews} interviews.`);
    }
  }
  if (current.newClients > 0) lines.push(`${current.newClients} newly assigned client${current.newClients === 1 ? " is" : "s are"} included in overall logged totals and excluded from full-week targets.`);
  return { subject: isMonday ? "Welcome to a fresh JobGenius week" : `Your weekly progress: ${current.applications} applications logged`, body: lines.join("\n") };
}

export function composeFridayDeliveryEmail(name: string, current: DeliverySummary, previous: DeliverySummary): { subject: string; body: string } {
  const clientCount = current.clients.length;
  const lines = [
    `Hi ${name},`, "",
    "Thank you for your contribution to this week's work in moving JobGenius forward.", "",
    `Applications: ${current.applications} (${change(current.applications, previous.applications)} from last week).`,
    `Phone interviews: ${current.phoneInterviews} (${change(current.phoneInterviews, previous.phoneInterviews)}).`,
    `All interviews: ${current.interviews} (${change(current.interviews, previous.interviews)}).`,
    `Offers: ${current.offers} (${change(current.offers, previous.offers)}).`, "",
    `Client management capacity from full-week client application volume: about ${current.applicationClientEquivalents.toFixed(1)} client-equivalents at 30 applications each.`,
    `Individual client coverage: ${current.clientsAtMinimum}/${clientCount} reached 30 applications; ${current.clientsAtTarget}/${clientCount} reached the 50-application target.`,
    `Interview coverage: ${current.clientsWithPhoneInterview}/${clientCount} had a phone interview; ${current.clientsWithInterview}/${clientCount} had an interview of any type.`,
  ];
  if (clientCount > 0) {
    lines.push("", "Client detail:");
    for (const client of current.clients) {
      lines.push(`  ${client.name}: ${client.applications} applications, ${client.phoneInterviews} phone interviews, ${client.interviews} interviews, ${client.offers} offers.`);
    }
  }
  if (current.newClients > 0) lines.push("", `${current.newClients} newly assigned client${current.newClients === 1 ? " was" : "s were"} included in overall logged totals and excluded from the full-week capacity calculation.`);
  if (current.clients.length !== previous.clients.length) lines.push("The number of full-week clients changed, so the week-to-week totals are not a like-for-like workload comparison.");
  lines.push("", "Interview outcomes depend on hiring timelines as well as your work. Use any gap to review the client's next steps with your manager.");
  return { subject: `Thank you for this week: ${current.applications} applications and ${current.interviews} interviews`, body: lines.join("\n") };
}
