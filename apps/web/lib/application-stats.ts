// Application counts for analytics. Applications live in application_runs
// (automated and manual, source = 'manual'); a run counts once it reached a
// success status. There is no `applications` table, so earlier dashboards
// that queried one always showed zero.

import type { SupabaseClient } from "@supabase/supabase-js";

export const SUCCESSFUL_APPLICATION_STATUSES = ["APPLIED", "COMPLETED"];

/** Distinct job seekers with at least one submitted application (funnel stage). */
export async function countDistinctAppliedSeekers(
  db: SupabaseClient,
  seekerIds?: string[]
): Promise<{ count: number }> {
  let query = db
    .from("application_runs")
    .select("job_seeker_id")
    .in("status", SUCCESSFUL_APPLICATION_STATUSES)
    .limit(50_000);
  if (seekerIds) query = query.in("job_seeker_id", seekerIds);
  const { data } = await query;
  return { count: new Set((data ?? []).map((r) => r.job_seeker_id as string)).size };
}
