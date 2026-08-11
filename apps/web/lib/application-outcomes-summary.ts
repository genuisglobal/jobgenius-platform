/**
 * Pure summary logic for application outcome tracking (Lean v1).
 *
 * Kept free of any DB / auth imports so it is trivially unit-testable and can be
 * imported without side effects. The rollup lives in `application-outcomes.ts`,
 * which re-exports everything here.
 *
 * IMPORTANT (honesty): these are conversion rates BY SEGMENT, not causal lift.
 * Tailored applications often also target better-fit roles, so a higher tailored
 * conversion rate is correlation, not proof that tailoring caused it. A causal
 * number needs a randomized holdout (a separate v2 add-on).
 */

// Below this many applications a segment's rate is too noisy to report.
export const MIN_SAMPLE = 8;

export interface OutcomeRow {
  outcome: string;
  resume_tailored: boolean;
  match_score: number | null;
  ats_type: string | null;
  account_manager_id: string | null;
  ai_answer_count: number | null;
}

export interface Segment {
  applications: number;
  interviews: number;
  /** interviews / applications, or null when the sample is below MIN_SAMPLE. */
  rate: number | null;
}

export interface KeyedSegment extends Segment {
  key: string;
}

export interface OutcomeSummary {
  overall: Segment;
  by_tailored: { tailored: Segment; untailored: Segment };
  by_ai_usage: { with_ai: Segment; without_ai: Segment };
  by_score_band: KeyedSegment[];
  by_ats: KeyedSegment[];
  by_am: KeyedSegment[];
  min_sample: number;
}

function segment(rows: OutcomeRow[]): Segment {
  const applications = rows.length;
  const interviews = rows.filter((r) => r.outcome === "interview").length;
  return {
    applications,
    interviews,
    rate: applications >= MIN_SAMPLE ? interviews / applications : null,
  };
}

function scoreBand(score: number | null): string {
  if (score == null) return "unknown";
  if (score >= 80) return "80+";
  if (score >= 65) return "65–79";
  if (score >= 50) return "50–64";
  return "<50";
}

function groupBy(
  rows: OutcomeRow[],
  keyOf: (r: OutcomeRow) => string | null
): KeyedSegment[] {
  const buckets = new Map<string, OutcomeRow[]>();
  for (const r of rows) {
    const key = keyOf(r);
    if (!key) continue;
    const list = buckets.get(key);
    if (list) list.push(r);
    else buckets.set(key, [r]);
  }
  return Array.from(buckets.entries())
    .map(([key, list]) => ({ key, ...segment(list) }))
    .sort((a, b) => b.applications - a.applications);
}

export function summarizeOutcomes(rows: OutcomeRow[]): OutcomeSummary {
  return {
    overall: segment(rows),
    by_tailored: {
      tailored: segment(rows.filter((r) => r.resume_tailored)),
      untailored: segment(rows.filter((r) => !r.resume_tailored)),
    },
    by_ai_usage: {
      with_ai: segment(rows.filter((r) => (r.ai_answer_count ?? 0) > 0)),
      without_ai: segment(rows.filter((r) => (r.ai_answer_count ?? 0) === 0)),
    },
    by_score_band: groupBy(rows, (r) => scoreBand(r.match_score)),
    by_ats: groupBy(rows, (r) => r.ats_type),
    by_am: groupBy(rows, (r) => r.account_manager_id),
    min_sample: MIN_SAMPLE,
  };
}
