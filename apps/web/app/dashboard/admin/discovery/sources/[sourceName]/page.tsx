import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import {
  buildDiscoverySourceDrilldown,
  type DiscoverySourceDrilldown,
} from "@/lib/discovery/health";

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

type SearchRow = {
  id: string;
  search_name: string;
  source_name: string;
  location: string | null;
  enabled: boolean;
  run_frequency_hours: number | null;
  last_run_at: string | null;
  last_job_count: number | null;
};

type SourceRow = {
  name: string;
  source_type: string | null;
  enabled: boolean | null;
};

function percent(value: number | null) {
  if (value === null) {
    return "n/a";
  }
  return `${value}%`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Unknown time";
  }
  return new Date(value).toLocaleString();
}

function healthClasses(health: DiscoverySourceDrilldown["health"]) {
  switch (health) {
    case "healthy":
      return "bg-green-100 text-green-800";
    case "watch":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-red-100 text-red-800";
  }
}

function diagnosticClasses(severity: "warning" | "critical") {
  return severity === "critical"
    ? "bg-red-100 text-red-800"
    : "bg-amber-100 text-amber-800";
}

function signalClasses(severity: "info" | "warning") {
  return severity === "warning"
    ? "bg-amber-100 text-amber-800"
    : "bg-slate-100 text-slate-700";
}

function statusClasses(status: string) {
  return status === "FAILED"
    ? "bg-red-100 text-red-800"
    : "bg-green-100 text-green-800";
}

interface PageProps {
  params: {
    sourceName: string;
  };
}

export default async function DiscoverySourceDetailPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am" || !isAdminRole(user.role)) redirect("/dashboard");

  const sourceName = decodeURIComponent(params.sourceName);

  const [{ data: sourceData }, { data: runsData }, { data: searchesData }] =
    await Promise.all([
      supabaseAdmin
        .from("job_sources")
        .select("name, source_type, enabled")
        .eq("name", sourceName)
        .maybeSingle(),
      supabaseAdmin
        .from("job_discovery_runs")
        .select(
          "id, search_id, source_name, status, jobs_found, jobs_new, jobs_updated, pages_scraped, error_message, metadata, started_at, completed_at, created_at, job_discovery_searches(search_name, location)"
        )
        .eq("source_name", sourceName)
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("job_discovery_searches")
        .select(
          "id, search_name, source_name, location, enabled, run_frequency_hours, last_run_at, last_job_count"
        )
        .eq("source_name", sourceName)
        .is("job_seeker_id", null)
        .order("updated_at", { ascending: false }),
    ]);

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

  const searches = (searchesData ?? []) as SearchRow[];
  const source = (sourceData ?? null) as SourceRow | null;

  if (!source && runs.length === 0 && searches.length === 0) {
    notFound();
  }

  const drilldown = buildDiscoverySourceDrilldown(sourceName, runs, searches, source);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/admin/discovery"
              className="text-sm text-violet-600 hover:text-violet-800"
            >
              Back to Discovery
            </Link>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${healthClasses(
                drilldown.health
              )}`}
            >
              {drilldown.health}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">{drilldown.sourceName}</h1>
          <p className="text-sm text-gray-500">
            Source type: {drilldown.sourceType ?? "unknown"} | Enabled:{" "}
            {drilldown.enabled === null ? "unknown" : drilldown.enabled ? "yes" : "no"}
          </p>
        </div>
        <div className="text-sm text-gray-500">
          Last run:{" "}
          {drilldown.lastRunAt ? formatDateTime(drilldown.lastRunAt) : "No runs yet"}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Runs</p>
          <p className="text-2xl font-bold text-gray-900">{drilldown.totalRuns}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Success Rate</p>
          <p className="text-2xl font-bold text-gray-900">{percent(drilldown.successRate)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Zero Yield</p>
          <p className="text-2xl font-bold text-amber-600">{percent(drilldown.zeroYieldRate)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Desc Capture</p>
          <p className="text-2xl font-bold text-gray-900">
            {percent(drilldown.descriptionSuccessRate)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Hidden Recovery</p>
          <p className="text-2xl font-bold text-violet-600">
            {percent(drilldown.hiddenRecoveryRate)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Save Error Rate</p>
          <p className="text-2xl font-bold text-red-600">{percent(drilldown.saveErrorRate)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr,1fr] gap-6">
        <div className="bg-white rounded-lg shadow p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-gray-900">Diagnostics</h2>
            <p className="text-sm text-gray-500">
              Aggregated failure categories for this source.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {drilldown.diagnostics.length === 0 ? (
              <span className="text-sm text-gray-400">No major diagnostics yet.</span>
            ) : (
              drilldown.diagnostics.map((diagnostic) => (
                <span
                  key={diagnostic.kind}
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${diagnosticClasses(
                    diagnostic.severity
                  )}`}
                >
                  {diagnostic.label} ({diagnostic.count})
                </span>
              ))
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Stop Reasons</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {drilldown.stopReasons.length === 0 ? (
                <span className="text-sm text-gray-400">No stop reasons recorded.</span>
              ) : (
                drilldown.stopReasons.map((reason) => (
                  <span
                    key={reason.reason}
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${signalClasses(
                      reason.severity
                    )}`}
                  >
                    {reason.label} ({reason.count})
                  </span>
                ))
              )}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Telemetry Signals</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {drilldown.signals.length === 0 ? (
                <span className="text-sm text-gray-400">No extra telemetry yet.</span>
              ) : (
                drilldown.signals.map((signal) => (
                  <span
                    key={signal.kind}
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${signalClasses(
                      signal.severity
                    )}`}
                  >
                    {signal.label}: {signal.value}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-gray-900">Search Alerts</h2>
            <p className="text-sm text-gray-500">
              Alerts scoped to this source only.
            </p>
          </div>
          <div className="space-y-3">
            {drilldown.searchAlerts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-500">
                No active alerts for this source.
              </div>
            ) : (
              drilldown.searchAlerts.map((alert) => (
                <div key={`${alert.searchId}-${alert.kind}`} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{alert.searchName}</p>
                      <p className="text-xs text-gray-500">
                        {alert.location ?? "No location"}
                      </p>
                    </div>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${diagnosticClasses(
                        alert.severity
                      )}`}
                    >
                      {alert.severity}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-gray-700">{alert.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Search Breakdown</h2>
          <p className="text-sm text-gray-500">
            Which searches are creating the source problems.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                  Search
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                  Runs
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                  Failed
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                  Zero Yield
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                  Avg Jobs
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                  Top Stop
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                  Diagnostics
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {drilldown.searches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                    No search history for this source yet.
                  </td>
                </tr>
              ) : (
                drilldown.searches.map((search) => (
                  <tr key={`${search.searchId ?? search.searchName}-${search.location ?? "none"}`}>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <div className="font-medium">{search.searchName}</div>
                      <div className="text-xs text-gray-500">
                        {search.location ?? "No location"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">
                      {search.totalRuns}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">
                      {search.failedRuns}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">
                      {search.zeroYieldRuns}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">
                      {search.avgJobsFound}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {search.dominantStopReason ?? "n/a"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="flex flex-wrap gap-1">
                        {search.diagnostics.slice(0, 2).map((diagnostic) => (
                          <span
                            key={`${search.searchId ?? search.searchName}-${diagnostic.kind}`}
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${diagnosticClasses(
                              diagnostic.severity
                            )}`}
                          >
                            {diagnostic.label} ({diagnostic.count})
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Recent Runs</h2>
          <p className="text-sm text-gray-500">
            Raw run evidence for this source.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                  Run
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                  Search
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                  Outcome
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                  Jobs
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                  Pages
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                  Signals
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {drilldown.recentRuns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                    No runs recorded for this source yet.
                  </td>
                </tr>
              ) : (
                drilldown.recentRuns.map((run) => (
                  <tr key={run.runId}>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="font-medium">{formatDateTime(run.createdAt)}</div>
                      <div className="text-xs text-gray-500">{run.runId}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <div className="font-medium">{run.searchName ?? "Unnamed search"}</div>
                      <div className="text-xs text-gray-500">
                        {run.location ?? "No location"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses(
                            run.status
                          )}`}
                        >
                          {run.status}
                        </span>
                        {run.stopReason ? (
                          <span className="text-xs text-gray-500">{run.stopReason}</span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {run.diagnosticLabels.map((label) => (
                          <span
                            key={`${run.runId}-${label}`}
                            className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                      {run.errorMessage ? (
                        <p className="mt-2 text-xs text-red-700">{run.errorMessage}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">
                      <div>{run.jobsFound}</div>
                      <div className="text-xs text-gray-500">
                        +{run.jobsNew} new / {run.jobsUpdated} upd
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">
                      <div>{run.pagesScraped}</div>
                      <div className="text-xs text-gray-500">
                        {run.descriptionSuccessRate === null
                          ? "desc n/a"
                          : `desc ${run.descriptionSuccessRate}%`}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="space-y-1">
                        {run.signalSummary ? (
                          <p className="text-xs text-gray-500">{run.signalSummary}</p>
                        ) : null}
                        <div className="text-xs text-gray-500">
                          hidden {run.hiddenNewJobs} | mirrors {run.mirroredJobs} | save errors{" "}
                          {run.saveErrors}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
