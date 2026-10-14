// ============================================================
// Sustained-pace detection (migration 119).
//
// Turns a weekly pace band into something that can actually be acted on,
// without letting a cron job make an employment decision.
//
// The rule: SUSTAINED_WEEKS consecutive RATED weeks in the same band
// raises one flag for a people manager, carrying its evidence. A human
// then decides what it means — including that it means nothing.
//
// "Rated" is doing real work in that sentence. A week where somebody was
// under the measured-hours floor has no pace at all, and treating it as
// slow would flag people for being on leave, off sick, or working a week
// the clock happened not to capture. An unrated week breaks the streak
// rather than extending it.
//
// This module is pure, and stays that way: the review page imports it as
// a client component, so anything reaching the service-role Supabase
// client would be pulled into a browser bundle. The weekly sweep lives in
// lib/productivity-reviews-sweep.ts for exactly that reason.
// ============================================================

import { getRangeBounds, normalizeSheetDate } from "@/lib/activity-sheet";
import {
  formatPaceIndex,
  formatRate,
  type PaceBand,
} from "@/lib/am-productivity";

export const PRODUCTIVITY_REVIEW_CATEGORY = "productivity_review_flag";

/**
 * Consecutive rated weeks before anything is raised. Three is a month of
 * evidence minus the benefit of the doubt — long enough that a bad week
 * cannot trigger it, short enough that a real problem is caught inside a
 * review cycle rather than at the end of one.
 */
export const SUSTAINED_WEEKS = 3;

/** How far back the sweep looks. Only ever needs the streak window. */
export const LOOKBACK_WEEKS = SUSTAINED_WEEKS;

export type FlagKind = "concern" | "commendation";

/** The band each kind of flag watches for. */
export const FLAG_BANDS: Record<FlagKind, PaceBand> = {
  concern: "slow",
  commendation: "fast",
};

export type WeeklyPace = {
  week_start: string;
  pace: PaceBand;
  pace_index: number | null;
  measured_hours: number;
  score_per_hour: number | null;
  /** Team median that week — what pace_index was measured against. */
  team_median: number | null;
};

export type PaceStreak = {
  kind: FlagKind;
  weeks: WeeklyPace[];
};

// ─── Detection ───────────────────────────────────────────────────────────

/** Monday of the week containing `date`. */
export function weekStartOf(date: string): string {
  return getRangeBounds(normalizeSheetDate(date), "week").start;
}

/** Shift a YYYY-MM-DD by whole weeks. */
export function shiftWeeks(weekStart: string, weeks: number): string {
  return new Date(Date.parse(`${weekStart}T00:00:00Z`) + weeks * 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * The most recent `SUSTAINED_WEEKS` weeks, all in the same band, all
 * rated, and contiguous. Returns null otherwise.
 *
 * `weeks` must be ascending and end with the week being assessed.
 */
export function detectStreak(weeks: WeeklyPace[]): PaceStreak | null {
  if (weeks.length < SUSTAINED_WEEKS) return null;

  const window = weeks.slice(-SUSTAINED_WEEKS);

  // Contiguous: each week must be exactly seven days after the previous.
  for (let i = 1; i < window.length; i += 1) {
    if (window[i].week_start !== shiftWeeks(window[i - 1].week_start, 1)) {
      return null;
    }
  }

  // An unrated week has no pace, so it breaks a streak instead of
  // extending it — see the header.
  if (window.some((week) => week.pace === "unrated")) return null;

  for (const kind of Object.keys(FLAG_BANDS) as FlagKind[]) {
    if (window.every((week) => week.pace === FLAG_BANDS[kind])) {
      return { kind, weeks: window };
    }
  }

  return null;
}

// ─── Composition ─────────────────────────────────────────────────────────

function weekList(weeks: WeeklyPace[]): string {
  return weeks
    .map(
      (week) =>
        `  ${week.week_start}: ${formatRate(week.score_per_hour)}/h (${formatPaceIndex(
          week.pace_index
        )}), ${Math.round(week.measured_hours)}h measured`
    )
    .join("\n");
}

export function composeReviewMessage(
  amName: string,
  streak: PaceStreak
): { subject: string; body: string } {
  const weeks = streak.weeks.length;

  if (streak.kind === "commendation") {
    return {
      subject: `${amName} has been above team pace ${weeks} weeks running`,
      body: [
        `${amName} has finished above the team's median output per hour for ${weeks} consecutive weeks.`,
        "",
        weekList(streak.weeks),
        "",
        "Worth a word, and worth remembering at Leader of the Month and leadership eligibility.",
      ].join("\n"),
    };
  }

  return {
    subject: `${amName} has been below team pace ${weeks} weeks running`,
    body: [
      `${amName} has finished below the team's median output per hour for ${weeks} consecutive weeks.`,
      "",
      weekList(streak.weeks),
      "",
      "This is a prompt for a conversation, not a conclusion. The numbers measure logged activity per measured hour: they do not know about a difficult caseload, a client in crisis, time spent helping colleagues, or work that never reaches the sheet. Nothing has been recorded against them.",
      "",
      "Find out what is behind it first. If it turns out to be a performance matter, raise it deliberately through the normal review — this flag will not do that for you.",
    ].join("\n"),
  };
}

