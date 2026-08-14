import { supabaseServer } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/ops-auth";
import { syncValidatedDiscoverySearches } from "@/lib/discovery/policies";

const DEFAULT_RUN_FREQUENCY_HOURS = 24;
const DEFAULT_PENDING_LIMIT = 25;
const DEFAULT_CANDIDATE_LIMIT = 250;

const pendingLimit = Number.parseInt(
  process.env.DISCOVERY_PENDING_LIMIT ?? `${DEFAULT_PENDING_LIMIT}`,
  10
);

const candidateLimit = Number.parseInt(
  process.env.DISCOVERY_PENDING_CANDIDATE_LIMIT ?? `${DEFAULT_CANDIDATE_LIMIT}`,
  10
);

const MAX_PENDING_SEARCHES =
  Number.isFinite(pendingLimit) && pendingLimit > 0
    ? pendingLimit
    : DEFAULT_PENDING_LIMIT;

const MAX_CANDIDATE_SEARCHES =
  Number.isFinite(candidateLimit) && candidateLimit >= MAX_PENDING_SEARCHES
    ? candidateLimit
    : Math.max(DEFAULT_CANDIDATE_LIMIT, MAX_PENDING_SEARCHES);

type JobSourceRow = {
  id: string;
  name: string;
  base_url: string;
  source_type: string | null;
  enabled: boolean | null;
  rate_limit_per_minute: number | null;
  requires_auth: boolean | null;
  auth_config: Record<string, unknown> | null;
  adapter_config: Record<string, unknown> | null;
  discovery_config: Record<string, unknown> | null;
  selectors: Record<string, unknown> | null;
};

type DiscoverySearchRow = {
  id: string;
  job_seeker_id: string | null;
  source_id: string;
  search_name: string;
  search_url: string;
  keywords: string[] | null;
  location: string | null;
  filters: Record<string, unknown> | null;
  enabled: boolean;
  last_run_at: string | null;
  run_frequency_hours: number | null;
  job_sources: JobSourceRow | JobSourceRow[] | null;
};

function resolveSource(
  source: DiscoverySearchRow["job_sources"]
): JobSourceRow | null {
  if (!source) {
    return null;
  }
  return Array.isArray(source) ? source[0] ?? null : source;
}

function getRunFrequencyMs(runFrequencyHours: number | null | undefined) {
  const normalizedHours =
    Number.isFinite(runFrequencyHours) && Number(runFrequencyHours) > 0
      ? Number(runFrequencyHours)
      : DEFAULT_RUN_FREQUENCY_HOURS;
  return normalizedHours * 60 * 60 * 1000;
}

/**
 * GET /api/discovery/searches/pending
 *
 * Returns searches that are due to run.
 * Used by the discovery agent to find work.
 */
export async function GET(request: Request) {
  // Verify ops API key for service-to-service calls
  const authResult = requireOpsAuth(request.headers);
  if (!authResult.ok) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Keep discovery search generation independent from apply workflow outcomes.
  // If syncing fails, continue with existing searches to avoid hard downtime.
  try {
    await syncValidatedDiscoverySearches();
  } catch (error) {
    console.error("Discovery policy auto-sync failed in pending route:", error);
  }

  // Pull enabled searches ordered by oldest run first.
  // Due-frequency filtering is done below using each row's run_frequency_hours.
  const { data: searches, error } = await supabaseServer
    .from("job_discovery_searches")
    .select(`
      id,
      job_seeker_id,
      source_id,
      search_name,
      search_url,
      keywords,
      location,
      filters,
      enabled,
      last_run_at,
      run_frequency_hours,
      job_sources!inner (
        id,
        name,
        base_url,
        source_type,
        enabled,
        rate_limit_per_minute,
        requires_auth,
        auth_config,
        adapter_config,
        discovery_config,
        selectors
      )
    `)
    .eq("enabled", true)
    .order("last_run_at", { ascending: true, nullsFirst: true })
    .limit(MAX_CANDIDATE_SEARCHES);

  if (error) {
    return Response.json(
      { success: false, error: "Failed to fetch pending searches." },
      { status: 500 }
    );
  }

  // Filter by each search's own run frequency, then cap the batch size.
  const now = Date.now();
  const pendingSearches = ((searches ?? []) as DiscoverySearchRow[])
    .filter((search) => {
      if (!search.last_run_at) return true;

      const lastRun = Date.parse(search.last_run_at);
      if (!Number.isFinite(lastRun)) {
        return true;
      }

      const frequencyMs = getRunFrequencyMs(search.run_frequency_hours);
      return now - lastRun >= frequencyMs;
    })
    .slice(0, MAX_PENDING_SEARCHES);

  const transformed = pendingSearches.map((search) => {
    const source = resolveSource(search.job_sources);
    const runFrequencyMs = getRunFrequencyMs(search.run_frequency_hours);

    let nextRunAt: string | null = null;
    if (search.last_run_at) {
      const lastRun = Date.parse(search.last_run_at);
      if (Number.isFinite(lastRun)) {
        nextRunAt = new Date(lastRun + runFrequencyMs).toISOString();
      }
    }

    return {
      id: search.id,
      job_seeker_id: search.job_seeker_id,
      source_id: search.source_id,
      source_name: source?.name ?? null,
      search_name: search.search_name,
      search_url: search.search_url,
      keywords: search.keywords ?? [],
      location: search.location,
      filters: search.filters ?? {},
      enabled: search.enabled,
      last_run_at: search.last_run_at,
      next_run_at: nextRunAt,
      run_frequency_hours:
        search.run_frequency_hours ?? DEFAULT_RUN_FREQUENCY_HOURS,
      source,
    };
  });

  return Response.json({
    success: true,
    searches: transformed,
  });
}
