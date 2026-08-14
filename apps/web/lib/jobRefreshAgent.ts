/**
 * Job Refresh Agent
 *
 * Shared logic used by the Vercel Cron route and the admin manual-trigger route.
 * Fetches external jobs in parallel, upserts into external_jobs, and logs
 * the run to cron_runs for observability.
 */

import { supabaseAdmin } from '@/lib/auth';
import { fetchAllExternalJobs, type ExternalJob } from '@/lib/externalJobs';

export type RefreshSummary = {
  runId: string;
  status: 'success' | 'error';
  fetched: number;
  inserted: number;
  deduped: number;
  errors: number;
  sourceCounts: Record<string, number>;
  errorSources: string[];
  durationMs: number;
  errorMessage?: string;
};

export async function runJobRefresh(triggeredBy: string): Promise<RefreshSummary> {
  const startedAt = Date.now();

  // 1. Open a cron_run record
  const { data: runRow, error: insertRunError } = await supabaseAdmin
    .from('cron_runs')
    .insert({ triggered_by: triggeredBy, status: 'running' })
    .select('id')
    .single();

  if (insertRunError || !runRow) {
    throw new Error(`Failed to insert cron_runs row: ${insertRunError?.message}`);
  }

  const runId = runRow.id as string;

  try {
    // 2. Fetch from all providers in parallel
    const { jobs, sourceCounts, errorSources } = await fetchAllExternalJobs();

    // 3. Upsert jobs per source (incremental: update existing, insert new, mark stale)
    let inserted = 0;
    let errors = 0;
    let updatedCount = 0;

    const sources = Array.from(new Set(jobs.map((j) => j.source)));

    for (const source of sources) {
      const sourceJobs = jobs.filter((j) => j.source === source);
      if (sourceJobs.length === 0) continue;

      // Batch upsert (chunk to avoid payload limits)
      const chunkSize = 500;
      const sourceExternalIds: string[] = [];

      for (let i = 0; i < sourceJobs.length; i += chunkSize) {
        const chunk = sourceJobs.slice(i, i + chunkSize);
        const rows = chunk.map((j: ExternalJob) => ({
          external_id: j.external_id,
          source: j.source,
          title: j.title,
          company_name: j.company_name,
          company_logo: j.company_logo,
          location: j.location,
          salary: j.salary,
          job_type: j.job_type,
          category: j.category,
          url: j.url,
          fetched_at: j.fetched_at,
          is_stale: false,
        }));

        sourceExternalIds.push(...chunk.map((j) => j.external_id));

        const { error: upsertError } = await supabaseAdmin
          .from('external_jobs')
          .upsert(rows, { onConflict: 'source,external_id', ignoreDuplicates: false });

        if (upsertError) {
          errors += chunk.length;
        } else {
          inserted += chunk.length;
        }
      }

      // Mark jobs from this source that weren't in this fetch as stale
      if (sourceExternalIds.length > 0) {
        const { count } = await supabaseAdmin
          .from('external_jobs')
          .update({ is_stale: true })
          .eq('source', source)
          .eq('is_stale', false)
          .not('external_id', 'in', `(${sourceExternalIds.map((id) => `"${id}"`).join(',')})`)
          .select('id');
      }
    }

    // 4. Cross-source deduplication: mark duplicates by title+company fingerprint
    // Keep the newest version (latest fetched_at), mark others as dupes
    let deduped = 0;
    try {
      const { data: dupeData } = await supabaseAdmin.rpc('deduplicate_external_jobs');
      deduped = typeof dupeData === 'number' ? dupeData : 0;
    } catch {
      // RPC may not exist yet — skip
    }

    const durationMs = Date.now() - startedAt;

    // 5. Mark cron_run as success
    await supabaseAdmin
      .from('cron_runs')
      .update({
        status: 'success',
        completed_at: new Date().toISOString(),
        fetched: jobs.length,
        inserted,
        errors: errors + errorSources.length,
        source_counts: sourceCounts,
      })
      .eq('id', runId);

    return {
      runId,
      status: 'success',
      fetched: jobs.length,
      inserted,
      deduped,
      errors: errors + errorSources.length,
      sourceCounts,
      errorSources,
      durationMs,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startedAt;

    // 6. Mark cron_run as error
    await supabaseAdmin
      .from('cron_runs')
      .update({
        status: 'error',
        completed_at: new Date().toISOString(),
        error_message: errorMessage,
      })
      .eq('id', runId);

    return {
      runId,
      status: 'error',
      fetched: 0,
      inserted: 0,
      deduped: 0,
      errors: 1,
      sourceCounts: {},
      errorSources: [],
      durationMs,
      errorMessage,
    };
  }
}
