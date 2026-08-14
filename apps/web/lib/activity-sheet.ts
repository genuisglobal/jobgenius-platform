// ============================================================
// Activity Sheet (migration 113).
//
// One row per client per day, five numbers the account manager types
// in, visible to the whole team. This module is pure — date handling,
// input coercion, and the aggregations behind the sheet's totals row
// and the leaderboard. Everything that touches Supabase lives in the
// API routes.
// ============================================================

export const ACTIVITY_METRICS = [
  "easy_applications",
  "company_applications",
  "follow_ups",
  "phone_interviews",
  "ai_interviews",
  "video_interviews",
  "offers",
] as const;

export type ActivityMetric = (typeof ACTIVITY_METRICS)[number];

/**
 * The three interview types (migration 114). "Interviews" is never stored
 * as its own number — it is always the sum of these, so a row's parts and
 * its total cannot drift apart.
 */
export const INTERVIEW_METRICS = [
  "phone_interviews",
  "ai_interviews",
  "video_interviews",
] as const satisfies readonly ActivityMetric[];

export type InterviewMetric = (typeof INTERVIEW_METRICS)[number];

export const ACTIVITY_METRIC_LABELS: Record<ActivityMetric, string> = {
  easy_applications: "Easy Apply",
  company_applications: "Company Applications",
  follow_ups: "Follow Ups",
  phone_interviews: "Phone Call",
  ai_interviews: "AI Interview",
  video_interviews: "Video Interview",
  offers: "Offers",
};

/** Matches the CHECK constraints in migration 113. */
export const MAX_METRIC_VALUE = 500;

/**
 * Points per activity. This is the incentive design of the whole sheet —
 * whatever it rewards is what the team will do more of, so it is deliberate
 * rather than proportional to effort:
 *
 *   - A company application is worth more than an easy apply (1.5 vs 1)
 *     because it costs real work and converts far better.
 *   - A video interview outweighs a phone screen or an AI screener (2 vs 1);
 *     the async ones are cheap to accumulate.
 *   - An offer is 100 — an order of magnitude above everything else, so no
 *     amount of volume can out-earn actually placing someone.
 *
 * Scores are exact: every weight is an integer or a half, both of which are
 * exactly representable in binary floating point, so sums never drift.
 */
export const METRIC_POINTS: Record<ActivityMetric, number> = {
  easy_applications: 1,
  company_applications: 1.5,
  follow_ups: 1,
  phone_interviews: 1,
  ai_interviews: 1,
  video_interviews: 2,
  offers: 100,
};

export type ActivityCounts = Record<ActivityMetric, number>;

export function emptyCounts(): ActivityCounts {
  return {
    easy_applications: 0,
    company_applications: 0,
    follow_ups: 0,
    phone_interviews: 0,
    ai_interviews: 0,
    video_interviews: 0,
    offers: 0,
  };
}

export type SheetRow = {
  id: string | null;
  entry_date: string;
  job_seeker_id: string;
  seeker_name: string;
  account_manager_id: string;
  am_name: string;
  note: string | null;
  updated_at: string | null;
} & ActivityCounts;

export type LeaderboardEntry = {
  account_manager_id: string;
  am_name: string;
  counts: ActivityCounts;
  /** Distinct clients this AM logged anything for in the range. */
  clients: number;
  /** phone + AI + video, so the board stays readable at seven metrics. */
  interviews: number;
  /** Raw activity count, every metric weighted equally. */
  total: number;
  /** Weighted score — what the board actually ranks on. */
  score: number;
};

// ─── Dates ───────────────────────────────────────────────────────────────
//
// entry_date is a `date` column, so these are all plain YYYY-MM-DD string
// operations against the viewer's local calendar. No UTC conversion —
// an AM logging "today" means their today.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeSheetDate(
  value?: string | null,
  now: Date = new Date()
): string {
  if (typeof value === "string" && ISO_DATE.test(value.trim())) {
    return value.trim();
  }
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Shift a YYYY-MM-DD string by whole days, staying in the local calendar. */
export function shiftSheetDate(date: string, days: number): string {
  const [year, month, day] = normalizeSheetDate(date)
    .split("-")
    .map((part) => Number(part));
  const shifted = new Date(year, month - 1, day + days);
  return normalizeSheetDate(null, shifted);
}

export const SHEET_RANGES = ["day", "week", "month"] as const;
export type SheetRange = (typeof SHEET_RANGES)[number];

export function isSheetRange(value: unknown): value is SheetRange {
  return typeof value === "string" && SHEET_RANGES.includes(value as SheetRange);
}

/**
 * Inclusive [start, end] the leaderboard aggregates over. Weeks run
 * Monday–Sunday to match how the team already talks about a work week;
 * months are calendar months containing `date`.
 */
export function getRangeBounds(
  date: string,
  range: SheetRange
): { start: string; end: string } {
  const anchor = normalizeSheetDate(date);
  if (range === "day") return { start: anchor, end: anchor };

  const [year, month, day] = anchor.split("-").map((part) => Number(part));

  if (range === "week") {
    const weekday = new Date(year, month - 1, day).getDay(); // 0 = Sunday
    const sinceMonday = (weekday + 6) % 7;
    const start = shiftSheetDate(anchor, -sinceMonday);
    return { start, end: shiftSheetDate(start, 6) };
  }

  const start = normalizeSheetDate(null, new Date(year, month - 1, 1));
  const end = normalizeSheetDate(null, new Date(year, month, 0));
  return { start, end };
}

// ─── Input coercion ──────────────────────────────────────────────────────

/**
 * Number cells accept whatever the browser hands over — empty string when
 * the AM clears a cell, a string when it came off JSON. Anything that is
 * not a usable count becomes 0 rather than rejecting the whole row, so a
 * typo in one cell never loses the other four.
 */
export function coerceCount(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : 0;
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(MAX_METRIC_VALUE, Math.max(0, Math.trunc(parsed)));
}

export function coerceCounts(input: unknown): ActivityCounts {
  const source = (input ?? {}) as Record<string, unknown>;
  const counts = emptyCounts();
  for (const metric of ACTIVITY_METRICS) {
    counts[metric] = coerceCount(source[metric]);
  }
  return counts;
}

// ─── Aggregation ─────────────────────────────────────────────────────────

export function rowTotal(counts: Partial<ActivityCounts>): number {
  return ACTIVITY_METRICS.reduce((sum, metric) => sum + (counts[metric] ?? 0), 0);
}

/** Combined interviews: phone + AI + video. Never stored — always derived. */
export function interviewTotal(counts: Partial<ActivityCounts>): number {
  return INTERVIEW_METRICS.reduce((sum, metric) => sum + (counts[metric] ?? 0), 0);
}

/** Weighted score for a row or an aggregate. See METRIC_POINTS. */
export function scoreCounts(counts: Partial<ActivityCounts>): number {
  return ACTIVITY_METRICS.reduce(
    (score, metric) => score + (counts[metric] ?? 0) * METRIC_POINTS[metric],
    0
  );
}

/**
 * Scores are whole numbers unless company applications are involved, so show
 * the half only when there is one — "31.5" reads as precise, "31.0" as noise.
 */
export function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

export function sumCounts(rows: Array<Partial<ActivityCounts>>): ActivityCounts {
  const totals = emptyCounts();
  for (const row of rows) {
    for (const metric of ACTIVITY_METRICS) {
      totals[metric] += row[metric] ?? 0;
    }
  }
  return totals;
}

/**
 * Leaderboard ranking, by weighted score (METRIC_POINTS). The weights already
 * encode "outcomes beat volume" — an offer at 100 points cannot be caught by
 * any realistic pile of easy applies — so the score is the single ranking
 * signal, with offers and then name only to keep equal scores deterministic.
 */
export function buildLeaderboard(rows: SheetRow[]): LeaderboardEntry[] {
  const byAm = new Map<string, { name: string; rows: SheetRow[]; clients: Set<string> }>();

  for (const row of rows) {
    let entry = byAm.get(row.account_manager_id);
    if (!entry) {
      entry = { name: row.am_name, rows: [], clients: new Set() };
      byAm.set(row.account_manager_id, entry);
    }
    entry.rows.push(row);
    if (rowTotal(row) > 0) entry.clients.add(row.job_seeker_id);
  }

  return Array.from(byAm.entries())
    .map(([account_manager_id, entry]) => {
      const counts = sumCounts(entry.rows);
      return {
        account_manager_id,
        am_name: entry.name,
        counts,
        clients: entry.clients.size,
        interviews: interviewTotal(counts),
        total: rowTotal(counts),
        score: scoreCounts(counts),
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.counts.offers - a.counts.offers ||
        a.am_name.localeCompare(b.am_name)
    );
}
