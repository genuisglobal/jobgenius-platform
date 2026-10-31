import {
  emptyCounts,
  interviewTotal,
  shiftSheetDate,
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
  intakeStatus?: string;
  ownerId?: string;
};

export type WeeklyReviewRow = WeeklyReviewSeeker & {
  counts: ActivityCounts;
  previousCounts: ActivityCounts;
  loggedDays: number;
  previousLoggedDays: number;
  notes: Array<{ date: string; text: string }>;
  prompts: string[];
  days: Array<{ date: string; counts: ActivityCounts; notes: string[] }>;
  weeks: Array<{ start: string; counts: ActivityCounts; loggedDays: number }>;
};

export function buildWeeklyReview(
  seekers: WeeklyReviewSeeker[],
  current: WeeklyReviewEntry[],
  previous: WeeklyReviewEntry[],
  weekStart?: string,
  older: WeeklyReviewEntry[] = []
): WeeklyReviewRow[] {
  return seekers.map((seeker) => {
    const thisWeek = current.filter((entry) => entry.job_seeker_id === seeker.id);
    const lastWeek = previous.filter((entry) => entry.job_seeker_id === seeker.id);
    const counts = thisWeek.length ? sumCounts(thisWeek) : emptyCounts();
    const previousCounts = lastWeek.length ? sumCounts(lastWeek) : emptyCounts();
    const days = Array.from(new Set(thisWeek.map((entry) => entry.entry_date))).sort().map((date) => {
      const daily = thisWeek.filter((entry) => entry.entry_date === date);
      return { date, counts: sumCounts(daily), notes: daily.map((entry) => entry.note?.trim() ?? "").filter(Boolean) };
    });
    const weeks = weekStart ? [0, 1, 2, 3].map((offset) => {
      const start = shiftSheetDate(weekStart, -7 * offset);
      const source = offset === 0 ? thisWeek : offset === 1 ? lastWeek : older.filter((entry) =>
        entry.job_seeker_id === seeker.id && entry.entry_date >= start && entry.entry_date <= shiftSheetDate(start, 6));
      return { start, counts: sumCounts(source), loggedDays: new Set(source.map((entry) => entry.entry_date)).size };
    }) : [];
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
      days,
      weeks,
    };
  });
}
