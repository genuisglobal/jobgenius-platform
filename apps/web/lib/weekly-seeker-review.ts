import {
  emptyCounts,
  interviewTotal,
  sumCounts,
  type ActivityCounts,
} from "@/lib/activity-sheet";

export type WeeklyReviewEntry = {
  entry_date: string;
  job_seeker_id: string;
  note: string | null;
} & ActivityCounts;

export type WeeklyReviewSeeker = {
  id: string;
  name: string;
  owner: string;
};

export type WeeklyReviewRow = WeeklyReviewSeeker & {
  counts: ActivityCounts;
  previousCounts: ActivityCounts;
  loggedDays: number;
  previousLoggedDays: number;
  notes: Array<{ date: string; text: string }>;
  prompts: string[];
};

export function buildWeeklyReview(
  seekers: WeeklyReviewSeeker[],
  current: WeeklyReviewEntry[],
  previous: WeeklyReviewEntry[]
): WeeklyReviewRow[] {
  return seekers.map((seeker) => {
    const thisWeek = current.filter((entry) => entry.job_seeker_id === seeker.id);
    const lastWeek = previous.filter((entry) => entry.job_seeker_id === seeker.id);
    const counts = thisWeek.length ? sumCounts(thisWeek) : emptyCounts();
    const previousCounts = lastWeek.length ? sumCounts(lastWeek) : emptyCounts();
    const applications = counts.easy_applications + counts.company_applications;
    const previousApplications = previousCounts.easy_applications + previousCounts.company_applications;
    const prompts: string[] = [];

    if (thisWeek.length === 0) {
      prompts.push("No activity logged this week. Confirm what happened and whether the sheet needs updating.");
    } else {
      if (applications === 0) prompts.push("No applications logged. Discuss the search plan or any blocker.");
      if (previousApplications > 0 && applications < previousApplications) {
        prompts.push(`Applications fell from ${previousApplications} last week to ${applications}. What changed?`);
      }
      if (counts.follow_ups === 0) prompts.push("No follow-ups logged. Check for conversations needing a reply.");
      if (interviewTotal(counts) > 0) prompts.push("Review interview outcomes and the next preparation step.");
      if (counts.offers > 0) prompts.push("Review offer status and the next decision or negotiation step.");
    }

    return {
      ...seeker,
      counts,
      previousCounts,
      loggedDays: new Set(thisWeek.map((entry) => entry.entry_date)).size,
      previousLoggedDays: new Set(lastWeek.map((entry) => entry.entry_date)).size,
      notes: thisWeek
        .filter((entry) => Boolean(entry.note?.trim()))
        .map((entry) => ({ date: entry.entry_date, text: entry.note!.trim() }))
        .sort((a, b) => b.date.localeCompare(a.date)),
      prompts,
    };
  });
}
