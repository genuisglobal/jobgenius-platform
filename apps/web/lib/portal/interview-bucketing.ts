// Pure classification for the seeker portal's interviews page. Extracted
// specifically because the inline version of this check previously compared
// against interviews.status === "SCHEDULED" — a value that has never existed
// in the interview_status enum (pending_candidate | confirmed | completed |
// cancelled | no_show) — so "Upcoming" silently matched nothing and every
// interview, regardless of date, rendered under "Past".
export const UPCOMING_INTERVIEW_STATUSES = new Set(["pending_candidate", "confirmed"]);

/**
 * An interview belongs in "Upcoming" when it's still in a pre-completion
 * status AND either has no booked time yet (needs scheduling — the AM has a
 * scheduling link but no confirmed slot) or its booked time hasn't passed.
 */
export function isUpcomingInterview(
  status: string,
  scheduledAt: string | null,
  now: Date = new Date()
): boolean {
  if (!UPCOMING_INTERVIEW_STATUSES.has(status)) return false;
  if (!scheduledAt) return true;
  return new Date(scheduledAt) >= now;
}
