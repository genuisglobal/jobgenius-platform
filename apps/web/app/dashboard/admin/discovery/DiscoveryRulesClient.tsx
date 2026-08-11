"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Policy = {
  id: string;
  source_name: string;
  job_title: string;
  location: string;
  run_frequency_hours: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  generated_searches: number;
  active_generated_searches: number;
};

type Source = {
  name: string;
  source_type: string | null;
  enabled: boolean | null;
};

type TelemetrySummary = {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  zeroYieldRuns: number;
  healthySources: number;
  watchSources: number;
  poorSources: number;
};

type SourceHealth = {
  sourceName: string;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  zeroYieldRuns: number;
  successRate: number;
  zeroYieldRate: number;
  avgJobsFound: number;
  avgNewJobs: number;
  avgPagesScraped: number;
  descriptionSuccessRate: number | null;
  hiddenRecoveryRate: number;
  saveErrorRate: number;
  lastRunAt: string | null;
  health: "healthy" | "watch" | "poor";
  diagnostics: Array<{
    kind:
      | "adapter_fetch_failure"
      | "blocked_or_auth"
      | "timeout_or_navigation"
      | "selector_drift"
      | "zero_yield_stop"
      | "low_description_capture"
      | "save_errors"
      | "other_failure";
    label: string;
    count: number;
    severity: "warning" | "critical";
  }>;
  signals: Array<{
    kind:
      | "stop_reason"
      | "selector_miss_rate"
      | "hidden_recovery"
      | "network_parse_rate"
      | "description_fallback"
      | "mirror_collapse";
    label: string;
    value: string;
    severity: "info" | "warning";
  }>;
  dominantDiagnostic: string | null;
  dominantStopReason: string | null;
};

type SearchAlert = {
  searchId: string;
  searchName: string;
  sourceName: string;
  location: string | null;
  severity: "warning" | "critical";
  kind: "overdue" | "failures" | "zero_yield";
  message: string;
};

type RecentFailure = {
  runId: string;
  sourceName: string;
  searchName: string | null;
  location: string | null;
  errorMessage: string;
  createdAt: string | null;
  diagnosticKind:
    | "adapter_fetch_failure"
    | "blocked_or_auth"
    | "timeout_or_navigation"
    | "selector_drift"
    | "zero_yield_stop"
    | "low_description_capture"
    | "save_errors"
    | "other_failure";
  diagnosticLabel: string;
  signalSummary: string | null;
};

type Message = {
  type: "success" | "error" | "warning";
  text: string;
};

type PolicyDraft = {
  source_name: string;
  job_title: string;
  location: string;
  run_frequency_hours: number;
  enabled: boolean;
};

type CreatePolicyDraft = {
  source_names: string[];
  job_title: string;
  location: string;
  run_frequency_hours: number;
  enabled: boolean;
};

function sourceLabel(source: Source) {
  if (!source.source_type) return source.name;
  return `${source.name} (${source.source_type})`;
}

function sourceSupportsPolicies(source: Source) {
  return source.source_type !== "feed";
}

function healthBadgeClasses(health: SourceHealth["health"]) {
  switch (health) {
    case "healthy":
      return "bg-green-100 text-green-800";
    case "watch":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-red-100 text-red-800";
  }
}

function alertBadgeClasses(severity: SearchAlert["severity"]) {
  return severity === "critical"
    ? "bg-red-100 text-red-800"
    : "bg-amber-100 text-amber-800";
}

function diagnosticBadgeClasses(severity: "warning" | "critical") {
  return severity === "critical"
    ? "bg-red-100 text-red-800"
    : "bg-amber-100 text-amber-800";
}

function signalBadgeClasses(severity: "info" | "warning") {
  return severity === "warning"
    ? "bg-amber-100 text-amber-800"
    : "bg-slate-100 text-slate-700";
}

function formatPercent(value: number | null) {
  if (value === null) {
    return "n/a";
  }
  return `${value}%`;
}

function sourceDetailHref(sourceName: string) {
  return `/dashboard/admin/discovery/sources/${encodeURIComponent(sourceName)}`;
}

export default function DiscoveryRulesClient({
  policies,
  sources,
  isSuperAdmin,
  activeGeneratedSearches,
  totalGeneratedSearches,
  telemetrySummary,
  sourceHealth,
  searchAlerts,
  recentFailures,
}: {
  policies: Policy[];
  sources: Source[];
  isSuperAdmin: boolean;
  activeGeneratedSearches: number;
  totalGeneratedSearches: number;
  telemetrySummary: TelemetrySummary;
  sourceHealth: SourceHealth[];
  searchAlerts: SearchAlert[];
  recentFailures: RecentFailure[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<Message | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [savingPolicyId, setSavingPolicyId] = useState<string | null>(null);
  const [deletingPolicyId, setDeletingPolicyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const enabledSources = useMemo(
    () => sources.filter((source) => source.enabled),
    [sources]
  );
  const policyEligibleSources = useMemo(
    () => enabledSources.filter(sourceSupportsPolicies),
    [enabledSources]
  );
  const hasSources = sources.length > 0;

  const [createForm, setCreateForm] = useState<CreatePolicyDraft>({
    source_names: policyEligibleSources[0]?.name ? [policyEligibleSources[0].name] : [],
    job_title: "",
    location: "",
    run_frequency_hours: 24,
    enabled: true,
  });

  const [drafts, setDrafts] = useState<Record<string, PolicyDraft>>(() =>
    Object.fromEntries(
      policies.map((policy) => [
        policy.id,
        {
          source_name: policy.source_name,
          job_title: policy.job_title,
          location: policy.location,
          run_frequency_hours: policy.run_frequency_hours,
          enabled: policy.enabled,
        },
      ])
    )
  );

  function toggleCreateSource(sourceName: string) {
    setCreateForm((prev) => {
      const hasSource = prev.source_names.includes(sourceName);
      const nextSources = hasSource
        ? prev.source_names.filter((name) => name !== sourceName)
        : [...prev.source_names, sourceName];
      return {
        ...prev,
        source_names: nextSources,
      };
    });
  }

  function selectAllCreateSources() {
    setCreateForm((prev) => ({
      ...prev,
      source_names: policyEligibleSources.map((source) => source.name),
    }));
  }

  function clearCreateSources() {
    setCreateForm((prev) => ({
      ...prev,
      source_names: [],
    }));
  }

  async function runSync() {
    setSyncing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/discovery/policies/sync", {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage({ type: "error", text: data.error || "Sync failed." });
        return;
      }
      setMessage({
        type: "success",
        text: `Synced. Created ${data.sync?.created ?? 0}, updated ${
          data.sync?.updated ?? 0
        }, disabled ${data.sync?.disabled ?? 0}.`,
      });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error while syncing." });
    } finally {
      setSyncing(false);
    }
  }

  async function createPolicy() {
    if (!isSuperAdmin) return;
    if (
      createForm.source_names.length === 0 ||
      !createForm.job_title.trim() ||
      !createForm.location.trim()
    ) {
      setMessage({
        type: "error",
        text: "At least one source, job title, and location are required.",
      });
      return;
    }

    setCreating(true);
    setMessage(null);
    try {
      const response = await fetch("/api/discovery/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage({ type: "error", text: data.error || "Failed to create policy." });
        return;
      }
      const createdCount = Number(data.created_count ?? data.policies?.length ?? 0);
      const skippedCount = Array.isArray(data.skipped_sources) ? data.skipped_sources.length : 0;
      const successText =
        createdCount > 0
          ? `Created ${createdCount} policy${createdCount === 1 ? "" : "ies"}${skippedCount > 0 ? `, skipped ${skippedCount} duplicate source${skippedCount === 1 ? "" : "s"}` : ""}.`
          : "No new policies created.";
      setMessage({
        type: data.warning ? "warning" : "success",
        text: data.warning || successText,
      });
      setCreateForm((prev) => ({
        ...prev,
        job_title: "",
        location: "",
      }));
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error while creating policy." });
    } finally {
      setCreating(false);
    }
  }

  async function savePolicy(policyId: string) {
    if (!isSuperAdmin) return;
    const draft = drafts[policyId];
    if (!draft) return;

    if (!draft.source_name || !draft.job_title.trim() || !draft.location.trim()) {
      setMessage({
        type: "error",
        text: "Source, job title, and location are required.",
      });
      return;
    }

    setSavingPolicyId(policyId);
    setMessage(null);
    try {
      const response = await fetch(`/api/discovery/policies/${policyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage({ type: "error", text: data.error || "Failed to update policy." });
        return;
      }
      setMessage({
        type: data.warning ? "warning" : "success",
        text: data.warning || "Policy updated.",
      });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error while updating policy." });
    } finally {
      setSavingPolicyId(null);
    }
  }

  async function deletePolicy(policyId: string) {
    if (!isSuperAdmin) return;
    if (!confirm("Delete this discovery policy?")) return;

    setDeletingPolicyId(policyId);
    setMessage(null);
    try {
      const response = await fetch(`/api/discovery/policies/${policyId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage({ type: "error", text: data.error || "Failed to delete policy." });
        return;
      }
      setMessage({
        type: data.warning ? "warning" : "success",
        text: data.warning || "Policy deleted.",
      });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error while deleting policy." });
    } finally {
      setDeletingPolicyId(null);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Discovery Policies</h1>
          <p className="text-gray-600">
            Superadmin-validated job title/location rules that feed runner searches.
          </p>
        </div>
        <button
          onClick={runSync}
          disabled={syncing}
          className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
        >
          {syncing ? "Syncing..." : "Sync Now"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Policies</p>
          <p className="text-2xl font-bold text-gray-900">{policies.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Generated Searches</p>
          <p className="text-2xl font-bold text-indigo-600">{totalGeneratedSearches}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Active Generated Searches</p>
          <p className="text-2xl font-bold text-green-600">{activeGeneratedSearches}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Recent Runs</p>
          <p className="text-2xl font-bold text-gray-900">{telemetrySummary.totalRuns}</p>
          <p className="text-xs text-gray-500 mt-1">
            {telemetrySummary.completedRuns} completed / {telemetrySummary.failedRuns} failed
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Healthy Sources</p>
          <p className="text-2xl font-bold text-green-600">{telemetrySummary.healthySources}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Watch / Poor</p>
          <p className="text-2xl font-bold text-amber-600">
            {telemetrySummary.watchSources + telemetrySummary.poorSources}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {telemetrySummary.watchSources} watch / {telemetrySummary.poorSources} poor
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.65fr,1fr] gap-6">
        <div className="bg-white rounded-lg shadow p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Source Health</h2>
              <p className="text-sm text-gray-500">
                Recent discovery performance by source.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                    Source
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                    Health
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">
                    Success
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">
                    Zero Yield
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">
                    Avg Jobs
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">
                    Desc OK
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                    Diagnostics
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                    Signals
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sourceHealth.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-sm text-center text-gray-500">
                      No discovery runs yet.
                    </td>
                  </tr>
                ) : (
                  sourceHealth.map((source) => (
                    <tr key={source.sourceName}>
                      <td className="px-3 py-3 text-sm text-gray-900">
                        <div className="font-medium">
                          <Link
                            href={sourceDetailHref(source.sourceName)}
                            className="text-violet-600 hover:text-violet-800"
                          >
                            {source.sourceName}
                          </Link>
                        </div>
                        <div className="text-xs text-gray-500">
                          {source.totalRuns} runs, {source.failedRuns} failed
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${healthBadgeClasses(
                            source.health
                          )}`}
                        >
                          {source.health}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm text-right text-gray-700">
                        {formatPercent(source.successRate)}
                      </td>
                      <td className="px-3 py-3 text-sm text-right text-gray-700">
                        {formatPercent(source.zeroYieldRate)}
                      </td>
                      <td className="px-3 py-3 text-sm text-right text-gray-700">
                        {source.avgJobsFound}
                      </td>
                      <td className="px-3 py-3 text-sm text-right text-gray-700">
                        {formatPercent(source.descriptionSuccessRate)}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-700">
                        {source.diagnostics.length === 0 ? (
                          <span className="text-xs text-gray-400">No major issues</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {source.diagnostics.slice(0, 2).map((diagnostic) => (
                              <span
                                key={`${source.sourceName}-${diagnostic.kind}`}
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${diagnosticBadgeClasses(
                                  diagnostic.severity
                                )}`}
                              >
                                {diagnostic.label} ({diagnostic.count})
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-700">
                        {source.signals.length === 0 ? (
                          <span className="text-xs text-gray-400">No extra telemetry</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {source.signals.slice(0, 3).map((signal) => (
                              <span
                                key={`${source.sourceName}-${signal.kind}`}
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${signalBadgeClasses(
                                  signal.severity
                                )}`}
                              >
                                {signal.label}: {signal.value}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-5 space-y-3">
            <h2 className="font-semibold text-gray-900">Search Alerts</h2>
            <p className="text-sm text-gray-500">
              Searches that need attention because they are overdue, failing, or returning zero jobs.
            </p>
            <div className="space-y-3">
              {searchAlerts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-500">
                  No active search alerts.
                </div>
              ) : (
                searchAlerts.slice(0, 8).map((alert) => (
                  <div key={`${alert.searchId}-${alert.kind}`} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{alert.searchName}</p>
                        <p className="text-xs text-gray-500">
                          {alert.sourceName}
                          {alert.location ? ` • ${alert.location}` : ""}
                        </p>
                      </div>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${alertBadgeClasses(
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

          <div className="bg-white rounded-lg shadow p-5 space-y-3">
            <h2 className="font-semibold text-gray-900">Recent Failures</h2>
            <p className="text-sm text-gray-500">
              Latest failed runs from the discovery audit log.
            </p>
            <div className="space-y-3">
              {recentFailures.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-500">
                  No recent failures.
                </div>
              ) : (
                recentFailures.map((failure) => (
                  <div key={failure.runId} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          <Link
                            href={sourceDetailHref(failure.sourceName)}
                            className="text-violet-600 hover:text-violet-800"
                          >
                            {failure.searchName ?? "Unnamed search"}
                          </Link>
                        </p>
                        <p className="text-xs text-gray-500">
                          {failure.sourceName}
                          {failure.location ? ` • ${failure.location}` : ""}
                        </p>
                      </div>
                      <span className="text-xs text-gray-500">
                        {failure.createdAt
                          ? new Date(failure.createdAt).toLocaleString()
                          : "Unknown time"}
                      </span>
                    </div>
                    <div className="mt-2">
                      <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                        {failure.diagnosticLabel}
                      </span>
                    </div>
                    {failure.signalSummary ? (
                      <p className="mt-2 text-xs text-gray-500">{failure.signalSummary}</p>
                    ) : null}
                    <p className="mt-2 text-sm text-red-700">{failure.errorMessage}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-800"
              : message.type === "warning"
              ? "bg-amber-50 text-amber-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {isSuperAdmin ? (
        <div className="bg-white rounded-lg shadow p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Create Policy</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="md:col-span-1">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-600">
                  Sources
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllCreateSources}
                    className="text-xs text-violet-600 hover:text-violet-800"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={clearCreateSources}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="border rounded-lg p-2 max-h-44 overflow-auto space-y-2 bg-white">
                {policyEligibleSources.length === 0 ? (
                  <p className="text-xs text-gray-500">No enabled sources.</p>
                ) : (
                  policyEligibleSources.map((source) => (
                    <label
                      key={source.name}
                      className="flex items-center gap-2 text-sm text-gray-700"
                    >
                      <input
                        type="checkbox"
                        checked={createForm.source_names.includes(source.name)}
                        onChange={() => toggleCreateSource(source.name)}
                      />
                      {sourceLabel(source)}
                    </label>
                  ))
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {createForm.source_names.length} source
                {createForm.source_names.length === 1 ? "" : "s"} selected.
              </p>
              <p className="mt-2 text-xs text-amber-700">
                ATS feed sources like Greenhouse, Lever, Ashby, Workday, and SmartRecruiters
                are company-specific and should be run directly, not through title/location policies.
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Job Title</label>
              <input
                value={createForm.job_title}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, job_title: event.target.value }))
                }
                placeholder="e.g. Senior Project Manager"
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
              <input
                value={createForm.location}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, location: event.target.value }))
                }
                placeholder="e.g. United States"
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Every (hours)</label>
              <input
                type="number"
                min={1}
                max={168}
                value={createForm.run_frequency_hours}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    run_frequency_hours: Number(event.target.value || 24),
                  }))
                }
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={createForm.enabled}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, enabled: event.target.checked }))
                }
              />
              Enabled
            </label>
            <button
              onClick={createPolicy}
              disabled={creating || !hasSources || policyEligibleSources.length === 0}
              className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Policy"}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-violet-50 border border-violet-100 rounded-lg p-4 text-sm text-violet-800">
          Admin view is read-only. Super admin can create or edit policy rules.
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Source</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Job Title</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Location</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Every</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Generated</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Enabled</th>
              {isSuperAdmin && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {policies.length === 0 ? (
              <tr>
                <td
                  colSpan={isSuperAdmin ? 7 : 6}
                  className="px-4 py-8 text-center text-gray-500"
                >
                  No discovery policies yet.
                </td>
              </tr>
            ) : (
              policies.map((policy) => {
                const draft = drafts[policy.id] ?? {
                  source_name: policy.source_name,
                  job_title: policy.job_title,
                  location: policy.location,
                  run_frequency_hours: policy.run_frequency_hours,
                  enabled: policy.enabled,
                };
                const busy =
                  savingPolicyId === policy.id || deletingPolicyId === policy.id;

                return (
                  <tr key={policy.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {isSuperAdmin ? (
                        <select
                          value={draft.source_name}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [policy.id]: {
                                ...draft,
                                source_name: event.target.value,
                              },
                            }))
                          }
                          className="w-full px-2 py-1 border rounded text-sm"
                        >
                          {sources
                            .filter(
                              (source) =>
                                sourceSupportsPolicies(source) || source.name === draft.source_name
                            )
                            .map((source) => (
                            <option key={source.name} value={source.name}>
                              {sourceLabel(source)}
                            </option>
                            ))}
                        </select>
                      ) : (
                        policy.source_name
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {isSuperAdmin ? (
                        <input
                          value={draft.job_title}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [policy.id]: {
                                ...draft,
                                job_title: event.target.value,
                              },
                            }))
                          }
                          className="w-full px-2 py-1 border rounded text-sm"
                        />
                      ) : (
                        policy.job_title
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {isSuperAdmin ? (
                        <input
                          value={draft.location}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [policy.id]: {
                                ...draft,
                                location: event.target.value,
                              },
                            }))
                          }
                          className="w-full px-2 py-1 border rounded text-sm"
                        />
                      ) : (
                        policy.location
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-700">
                      {isSuperAdmin ? (
                        <input
                          type="number"
                          min={1}
                          max={168}
                          value={draft.run_frequency_hours}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [policy.id]: {
                                ...draft,
                                run_frequency_hours: Number(event.target.value || 24),
                              },
                            }))
                          }
                          className="w-24 px-2 py-1 border rounded text-sm text-right"
                        />
                      ) : (
                        `${policy.run_frequency_hours}h`
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-700">
                      {policy.active_generated_searches}/{policy.generated_searches}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isSuperAdmin ? (
                        <input
                          type="checkbox"
                          checked={draft.enabled}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [policy.id]: {
                                ...draft,
                                enabled: event.target.checked,
                              },
                            }))
                          }
                        />
                      ) : (
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            policy.enabled
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {policy.enabled ? "Enabled" : "Disabled"}
                        </span>
                      )}
                    </td>
                    {isSuperAdmin && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => savePolicy(policy.id)}
                            disabled={busy}
                            className="px-3 py-1.5 bg-violet-600 text-white text-xs font-medium rounded hover:bg-violet-700 disabled:opacity-50"
                          >
                            {savingPolicyId === policy.id ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={() => deletePolicy(policy.id)}
                            disabled={busy}
                            className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 disabled:opacity-50"
                          >
                            {deletingPolicyId === policy.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
