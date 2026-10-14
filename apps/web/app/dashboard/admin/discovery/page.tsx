import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { buildDiscoveryHealthSnapshot } from "@/lib/discovery/health";
import DiscoveryRulesClient from "./DiscoveryRulesClient";

type PolicyRow = {
  id: string;
  source_name: string;
  job_title: string;
  location: string;
  run_frequency_hours: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

type SourceRow = {
  name: string;
  source_type: string | null;
  enabled: boolean | null;
};

type RunRow = {
  id: string;
  search_id: string | null;
  source_name: string;
  status: string;
  jobs_found: number | null;
  jobs_new: number | null;
  jobs_updated: number | null;
  pages_scraped: number | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  job_discovery_searches:
    | {
        search_name: string | null;
        location: string | null;
      }
    | {
        search_name: string | null;
        location: string | null;
      }[]
    | null;
};

type SearchHealthRow = {
  id: string;
  search_name: string;
  source_name: string;
  location: string | null;
  enabled: boolean;
  run_frequency_hours: number | null;
  last_run_at: string | null;
  last_job_count: number | null;
};

export default async function DiscoveryAdminPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const isSuperAdmin = user.role === "superadmin";

  const [
    { data: policiesData },
    { data: sourcesData },
    { data: generatedSearchesData },
    { data: runsData },
    { data: searchHealthData },
  ] =
    await Promise.all([
      supabaseAdmin
        .from("discovery_search_policies")
        .select(
          "id, source_name, job_title, location, run_frequency_hours, enabled, created_at, updated_at"
        )
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("job_sources")
        .select("name, source_type, enabled")
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("job_discovery_searches")
        .select("policy_id, enabled")
        .not("policy_id", "is", null)
        .is("job_seeker_id", null),
      supabaseAdmin
        .from("job_discovery_runs")
        .select(
          "id, search_id, source_name, status, jobs_found, jobs_new, jobs_updated, pages_scraped, error_message, metadata, started_at, completed_at, created_at, job_discovery_searches(search_name, location)"
        )
        .order("created_at", { ascending: false })
        .limit(250),
      supabaseAdmin
        .from("job_discovery_searches")
        .select(
          "id, search_name, source_name, location, enabled, run_frequency_hours, last_run_at, last_job_count"
        )
        .is("job_seeker_id", null)
        .order("updated_at", { ascending: false }),
    ]);

  const policies = (policiesData ?? []) as PolicyRow[];
  const sources = (sourcesData ?? []) as SourceRow[];
  const generatedSearches = (generatedSearchesData ?? []) as {
    policy_id: string | null;
    enabled: boolean;
  }[];

  const policyGeneratedMap = new Map<string, { total: number; active: number }>();
  for (const row of generatedSearches) {
    if (!row.policy_id) continue;
    const stats = policyGeneratedMap.get(row.policy_id) ?? { total: 0, active: 0 };
    stats.total += 1;
    if (row.enabled) {
      stats.active += 1;
    }
    policyGeneratedMap.set(row.policy_id, stats);
  }

  const policiesWithStats = policies.map((policy) => ({
    ...policy,
    generated_searches: policyGeneratedMap.get(policy.id)?.total ?? 0,
    active_generated_searches: policyGeneratedMap.get(policy.id)?.active ?? 0,
  }));

  const activeGeneratedSearches = generatedSearches.filter((row) => row.enabled).length;
  const runs = ((runsData ?? []) as RunRow[]).map((run) => {
    const linkedSearch = Array.isArray(run.job_discovery_searches)
      ? run.job_discovery_searches[0]
      : run.job_discovery_searches;

    return {
      id: run.id,
      search_id: run.search_id,
      source_name: run.source_name,
      status: run.status,
      jobs_found: run.jobs_found,
      jobs_new: run.jobs_new,
      jobs_updated: run.jobs_updated,
      pages_scraped: run.pages_scraped,
      error_message: run.error_message,
      metadata: run.metadata,
      started_at: run.started_at,
      completed_at: run.completed_at,
      created_at: run.created_at,
      search_name: linkedSearch?.search_name ?? null,
      location: linkedSearch?.location ?? null,
    };
  });
  const searchHealth = (searchHealthData ?? []) as SearchHealthRow[];
  const healthSnapshot = buildDiscoveryHealthSnapshot(runs, searchHealth);

  return (
    <DiscoveryRulesClient
      policies={policiesWithStats}
      sources={sources}
      isSuperAdmin={isSuperAdmin}
      activeGeneratedSearches={activeGeneratedSearches}
      totalGeneratedSearches={generatedSearches.length}
      telemetrySummary={healthSnapshot.summary}
      sourceHealth={healthSnapshot.sourceHealth}
      searchAlerts={healthSnapshot.searchAlerts}
      recentFailures={healthSnapshot.recentFailures}
    />
  );
}
