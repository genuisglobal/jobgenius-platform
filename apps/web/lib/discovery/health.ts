type DiscoveryRunLike = {
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
  search_name?: string | null;
  location?: string | null;
};

type DiscoverySearchLike = {
  id: string;
  search_name: string;
  source_name: string;
  location: string | null;
  enabled: boolean;
  run_frequency_hours: number | null;
  last_run_at: string | null;
  last_job_count: number | null;
};

export type DiscoveryHealthSummary = {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  zeroYieldRuns: number;
  healthySources: number;
  watchSources: number;
  poorSources: number;
};

export type DiscoverySourceHealth = {
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
  diagnostics: DiscoverySourceDiagnostic[];
  signals: DiscoverySourceSignal[];
  dominantDiagnostic: string | null;
  dominantStopReason: string | null;
};

export type DiscoverySearchAlert = {
  searchId: string;
  searchName: string;
  sourceName: string;
  location: string | null;
  severity: "warning" | "critical";
  kind: "overdue" | "failures" | "zero_yield";
  message: string;
};

export type DiscoveryRecentFailure = {
  runId: string;
  sourceName: string;
  searchName: string | null;
  location: string | null;
  errorMessage: string;
  createdAt: string | null;
  diagnosticKind: DiscoveryDiagnosticKind;
  diagnosticLabel: string;
  signalSummary: string | null;
};

export type DiscoveryDiagnosticKind =
  | "adapter_fetch_failure"
  | "blocked_or_auth"
  | "timeout_or_navigation"
  | "selector_drift"
  | "zero_yield_stop"
  | "low_description_capture"
  | "save_errors"
  | "other_failure";

export type DiscoverySourceDiagnostic = {
  kind: DiscoveryDiagnosticKind;
  label: string;
  count: number;
  severity: "warning" | "critical";
};

export type DiscoverySourceSignalKind =
  | "stop_reason"
  | "selector_miss_rate"
  | "hidden_recovery"
  | "network_parse_rate"
  | "description_fallback"
  | "mirror_collapse";

export type DiscoverySourceSignal = {
  kind: DiscoverySourceSignalKind;
  label: string;
  value: string;
  severity: "info" | "warning";
};

export type DiscoveryStopReasonSummary = {
  reason: string;
  label: string;
  count: number;
  severity: "info" | "warning";
};

export type DiscoverySourceSearchBreakdown = {
  searchId: string | null;
  searchName: string;
  location: string | null;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  zeroYieldRuns: number;
  avgJobsFound: number;
  avgNewJobs: number;
  lastRunAt: string | null;
  diagnostics: DiscoverySourceDiagnostic[];
  stopReasons: DiscoveryStopReasonSummary[];
  dominantStopReason: string | null;
};

export type DiscoverySourceRunDetail = {
  runId: string;
  searchId: string | null;
  searchName: string | null;
  location: string | null;
  status: string;
  jobsFound: number;
  jobsNew: number;
  jobsUpdated: number;
  pagesScraped: number;
  createdAt: string | null;
  completedAt: string | null;
  stopReason: string | null;
  diagnostics: DiscoveryDiagnosticKind[];
  diagnosticLabels: string[];
  signalSummary: string | null;
  errorMessage: string | null;
  sourceType: string | null;
  failureStage: string | null;
  hiddenNewJobs: number;
  mirroredJobs: number;
  saveErrors: number;
  descriptionSuccessRate: number | null;
};

export type DiscoverySourceDrilldown = {
  sourceName: string;
  sourceType: string | null;
  enabled: boolean | null;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  zeroYieldRuns: number;
  health: "healthy" | "watch" | "poor";
  lastRunAt: string | null;
  successRate: number;
  zeroYieldRate: number;
  descriptionSuccessRate: number | null;
  hiddenRecoveryRate: number;
  saveErrorRate: number;
  diagnostics: DiscoverySourceDiagnostic[];
  signals: DiscoverySourceSignal[];
  stopReasons: DiscoveryStopReasonSummary[];
  searchAlerts: DiscoverySearchAlert[];
  searches: DiscoverySourceSearchBreakdown[];
  recentRuns: DiscoverySourceRunDetail[];
};

const DISCOVERY_DIAGNOSTIC_LABELS: Record<
  DiscoveryDiagnosticKind,
  { label: string; severity: "warning" | "critical" }
> = {
  adapter_fetch_failure: { label: "Adapter fetch failure", severity: "critical" },
  blocked_or_auth: { label: "Blocked / auth", severity: "critical" },
  timeout_or_navigation: { label: "Timeout / navigation", severity: "warning" },
  selector_drift: { label: "Selector drift", severity: "critical" },
  zero_yield_stop: { label: "Zero-yield stop", severity: "warning" },
  low_description_capture: { label: "Low description capture", severity: "warning" },
  save_errors: { label: "Save-path errors", severity: "critical" },
  other_failure: { label: "Other failures", severity: "warning" },
};

function asNumber(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value)
      : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percent(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

function toTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function titleCaseWords(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function humanizeStopReason(value: string | null | undefined) {
  const normalized = `${value ?? ""}`.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return titleCaseWords(normalized);
}

function inferRunDiagnostics(run: DiscoveryRunLike): DiscoveryDiagnosticKind[] {
  const diagnostics = new Set<DiscoveryDiagnosticKind>();
  const errorText = `${run.error_message ?? ""}`.toLowerCase();
  const stopReason = `${run.metadata?.stop_reason ?? ""}`.toLowerCase();
  const sourceType = `${run.metadata?.source_type ?? ""}`.toLowerCase();
  const failureStage = `${run.metadata?.failure_stage ?? ""}`.toLowerCase();
  const selectorMissing = run.metadata?.job_cards_selector_missing === true;
  const descriptionAttempted = asNumber(run.metadata?.description_fetch_attempted) ?? 0;
  const descriptionSucceeded = asNumber(run.metadata?.description_fetch_succeeded) ?? 0;
  const saveErrors = asNumber(run.metadata?.save_errors) ?? 0;
  const jobsFound = run.jobs_found ?? 0;

  if (sourceType && sourceType !== "scraper" && failureStage === "fetch") {
    diagnostics.add("adapter_fetch_failure");
  }

  if (
    errorText.includes("403") ||
    errorText.includes("429") ||
    errorText.includes("captcha") ||
    errorText.includes("forbidden") ||
    errorText.includes("access denied") ||
    errorText.includes("unauthorized") ||
    errorText.includes("must be logged in") ||
    errorText.includes("blocked")
  ) {
    diagnostics.add("blocked_or_auth");
  }

  if (
    errorText.includes("timeout") ||
    errorText.includes("timed out") ||
    errorText.includes("networkidle") ||
    errorText.includes("navigation") ||
    errorText.includes("net::") ||
    errorText.includes("err_")
  ) {
    diagnostics.add("timeout_or_navigation");
  }

  if (selectorMissing && jobsFound === 0) {
    diagnostics.add("selector_drift");
  }

  if (stopReason === "zero_yield_limit" && jobsFound === 0) {
    diagnostics.add("zero_yield_stop");
  }

  if (
    descriptionAttempted >= 5 &&
    descriptionSucceeded / descriptionAttempted < 0.4
  ) {
    diagnostics.add("low_description_capture");
  }

  if (saveErrors > 0) {
    diagnostics.add("save_errors");
  }

  if (run.status === "FAILED" && diagnostics.size === 0) {
    diagnostics.add("other_failure");
  }

  return Array.from(diagnostics);
}

function summarizeDiagnostics(runs: DiscoveryRunLike[]) {
  const counts = new Map<DiscoveryDiagnosticKind, number>();
  for (const run of runs) {
    for (const kind of inferRunDiagnostics(run)) {
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([kind, count]) => ({
      kind,
      count,
      label: DISCOVERY_DIAGNOSTIC_LABELS[kind].label,
      severity: DISCOVERY_DIAGNOSTIC_LABELS[kind].severity,
    }))
    .sort((left, right) => {
      const severityRank = { critical: 0, warning: 1 };
      if (severityRank[left.severity] !== severityRank[right.severity]) {
        return severityRank[left.severity] - severityRank[right.severity];
      }
      return right.count - left.count;
    });
}

function summarizeSourceSignals(sourceRuns: DiscoveryRunLike[], completedRuns: DiscoveryRunLike[]) {
  const signals: DiscoverySourceSignal[] = [];
  const stopReasonCounts = new Map<string, number>();

  let selectorMissingRuns = 0;
  let hiddenRecoveryRuns = 0;
  let networkPayloadsSeen = 0;
  let networkPayloadsParsed = 0;
  let hiddenFallbackRescues = 0;
  let descriptionAttempts = 0;
  let mirroredJobs = 0;

  for (const run of sourceRuns) {
    const stopReason = `${run.metadata?.stop_reason ?? ""}`.trim().toLowerCase();
    if (stopReason) {
      stopReasonCounts.set(stopReason, (stopReasonCounts.get(stopReason) ?? 0) + 1);
    }
  }

  for (const run of completedRuns) {
    if (run.metadata?.job_cards_selector_missing === true) {
      selectorMissingRuns += 1;
    }
    if ((asNumber(run.metadata?.hidden_new_jobs) ?? 0) > 0) {
      hiddenRecoveryRuns += 1;
    }
    networkPayloadsSeen += asNumber(run.metadata?.hidden_network_payloads_seen) ?? 0;
    networkPayloadsParsed += asNumber(run.metadata?.hidden_network_payloads_parsed) ?? 0;
    hiddenFallbackRescues +=
      asNumber(run.metadata?.description_hidden_fallback_succeeded) ?? 0;
    descriptionAttempts += asNumber(run.metadata?.description_fetch_attempted) ?? 0;
    mirroredJobs += asNumber(run.metadata?.jobs_mirrored) ?? 0;
  }

  const topStopReason = Array.from(stopReasonCounts.entries()).sort(
    (left, right) => right[1] - left[1]
  )[0];
  if (topStopReason) {
    const humanized = humanizeStopReason(topStopReason[0]) ?? topStopReason[0];
    signals.push({
      kind: "stop_reason",
      label: "Top stop",
      value: `${humanized} (${topStopReason[1]})`,
      severity:
        topStopReason[0] === "zero_yield_limit" || topStopReason[0] === "error"
          ? "warning"
          : "info",
    });
  }

  if (completedRuns.length > 0 && selectorMissingRuns > 0) {
    const selectorMissRate = round(percent(selectorMissingRuns, completedRuns.length) * 100);
    signals.push({
      kind: "selector_miss_rate",
      label: "Selector miss",
      value: `${selectorMissRate}%`,
      severity: selectorMissRate >= 25 ? "warning" : "info",
    });
  }

  if (completedRuns.length > 0 && hiddenRecoveryRuns > 0) {
    signals.push({
      kind: "hidden_recovery",
      label: "Hidden recovery",
      value: `${round(percent(hiddenRecoveryRuns, completedRuns.length) * 100)}%`,
      severity: "info",
    });
  }

  if (networkPayloadsSeen > 0) {
    const networkParseRate = round(percent(networkPayloadsParsed, networkPayloadsSeen) * 100);
    signals.push({
      kind: "network_parse_rate",
      label: "Network parse",
      value: `${networkParseRate}%`,
      severity: networkParseRate < 40 ? "warning" : "info",
    });
  }

  if (descriptionAttempts > 0 && hiddenFallbackRescues > 0) {
    signals.push({
      kind: "description_fallback",
      label: "Fallback rescue",
      value: `${round(percent(hiddenFallbackRescues, descriptionAttempts) * 100)}%`,
      severity: "info",
    });
  }

  if (mirroredJobs > 0) {
    signals.push({
      kind: "mirror_collapse",
      label: "Mirrors collapsed",
      value: `${mirroredJobs}`,
      severity: "info",
    });
  }

  return signals.sort((left, right) => {
    const severityRank = { warning: 0, info: 1 };
    if (severityRank[left.severity] !== severityRank[right.severity]) {
      return severityRank[left.severity] - severityRank[right.severity];
    }
    return left.label.localeCompare(right.label);
  });
}

function buildFailureSignalSummary(run: DiscoveryRunLike) {
  const parts: string[] = [];
  const stopReason = humanizeStopReason(`${run.metadata?.stop_reason ?? ""}`);
  const failureStage = `${run.metadata?.failure_stage ?? ""}`.trim();
  const selectorMissing = run.metadata?.job_cards_selector_missing === true;
  const networkSeen = asNumber(run.metadata?.hidden_network_payloads_seen) ?? 0;
  const networkParsed = asNumber(run.metadata?.hidden_network_payloads_parsed) ?? 0;
  const saveErrors = asNumber(run.metadata?.save_errors) ?? 0;

  if (failureStage) {
    parts.push(`Stage: ${titleCaseWords(failureStage)}`);
  }
  if (stopReason) {
    parts.push(`Stop: ${stopReason}`);
  }
  if (selectorMissing) {
    parts.push("Selector missing");
  }
  if (networkSeen > 0) {
    parts.push(`Network parsed ${networkParsed}/${networkSeen}`);
  }
  if (saveErrors > 0) {
    parts.push(`Save errors ${saveErrors}`);
  }

  return parts.length > 0 ? parts.join(" | ") : null;
}

function summarizeStopReasons(runs: DiscoveryRunLike[]) {
  const counts = new Map<string, number>();
  for (const run of runs) {
    const stopReason = `${run.metadata?.stop_reason ?? ""}`.trim().toLowerCase();
    if (!stopReason) {
      continue;
    }
    counts.set(stopReason, (counts.get(stopReason) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([reason, count]) => ({
      reason,
      label: humanizeStopReason(reason) ?? reason,
      count,
      severity:
        reason === "zero_yield_limit" || reason === "error" ? ("warning" as const) : ("info" as const),
    }))
    .sort((left, right) => right.count - left.count);
}

function computeSourceHealthStatus(source: {
  successRate: number;
  zeroYieldRate: number;
  saveErrorRate: number;
  descriptionSuccessRate: number | null;
}) {
  if (
    source.successRate < 0.6 ||
    source.zeroYieldRate >= 0.6 ||
    source.saveErrorRate >= 0.2 ||
    (source.descriptionSuccessRate !== null && source.descriptionSuccessRate < 0.4)
  ) {
    return "poor" as const;
  }

  if (
    source.successRate < 0.85 ||
    source.zeroYieldRate >= 0.35 ||
    source.saveErrorRate > 0 ||
    (source.descriptionSuccessRate !== null && source.descriptionSuccessRate < 0.65)
  ) {
    return "watch" as const;
  }

  return "healthy" as const;
}

export function buildDiscoveryHealthSnapshot(
  runs: DiscoveryRunLike[],
  searches: DiscoverySearchLike[],
  now = new Date()
): {
  summary: DiscoveryHealthSummary;
  sourceHealth: DiscoverySourceHealth[];
  searchAlerts: DiscoverySearchAlert[];
  recentFailures: DiscoveryRecentFailure[];
} {
  const runsBySource = new Map<string, DiscoveryRunLike[]>();
  for (const run of runs) {
    const key = (run.source_name || "unknown").toLowerCase();
    const bucket = runsBySource.get(key) ?? [];
    bucket.push(run);
    runsBySource.set(key, bucket);
  }

  const sourceHealth = Array.from(runsBySource.entries())
    .map(([sourceKey, sourceRuns]) => {
      const completedRuns = sourceRuns.filter((run) => run.status === "COMPLETED");
      const failedRuns = sourceRuns.filter((run) => run.status === "FAILED");
      const zeroYieldRuns = completedRuns.filter((run) => (run.jobs_found ?? 0) === 0);

      const descriptionRates = completedRuns
        .map((run) => {
          const attempted = asNumber(run.metadata?.description_fetch_attempted);
          const succeeded = asNumber(run.metadata?.description_fetch_succeeded);
          if (!attempted || attempted <= 0 || succeeded === null) {
            return null;
          }
          return succeeded / attempted;
        })
        .filter((value): value is number => value !== null);

      const saveErrorRuns = completedRuns.filter(
        (run) => (asNumber(run.metadata?.save_errors) ?? 0) > 0
      );
      const hiddenRecoveryRuns = completedRuns.filter(
        (run) => (asNumber(run.metadata?.hidden_new_jobs) ?? 0) > 0
      );

      const successRate = percent(completedRuns.length, sourceRuns.length);
      const zeroYieldRate = percent(zeroYieldRuns.length, completedRuns.length);
      const saveErrorRate = percent(saveErrorRuns.length, completedRuns.length);
      const descriptionSuccessRate =
        descriptionRates.length > 0 ? average(descriptionRates) : null;
      const diagnostics = summarizeDiagnostics(sourceRuns);
      const signals = summarizeSourceSignals(sourceRuns, completedRuns);

      const health = computeSourceHealthStatus({
        successRate,
        zeroYieldRate,
        saveErrorRate,
        descriptionSuccessRate,
      });

      const lastRunAt = sourceRuns
        .map((run) => run.completed_at ?? run.started_at ?? run.created_at)
        .sort((a, b) => (toTimestamp(b) ?? 0) - (toTimestamp(a) ?? 0))[0] ?? null;

      return {
        sourceName: sourceRuns[0]?.source_name ?? sourceKey,
        totalRuns: sourceRuns.length,
        completedRuns: completedRuns.length,
        failedRuns: failedRuns.length,
        zeroYieldRuns: zeroYieldRuns.length,
        successRate: round(successRate * 100),
        zeroYieldRate: round(zeroYieldRate * 100),
        avgJobsFound: round(average(completedRuns.map((run) => run.jobs_found ?? 0))),
        avgNewJobs: round(average(completedRuns.map((run) => run.jobs_new ?? 0))),
        avgPagesScraped: round(average(completedRuns.map((run) => run.pages_scraped ?? 0))),
        descriptionSuccessRate:
          descriptionSuccessRate === null ? null : round(descriptionSuccessRate * 100),
        hiddenRecoveryRate: round(
          percent(hiddenRecoveryRuns.length, completedRuns.length) * 100
        ),
        saveErrorRate: round(saveErrorRate * 100),
        lastRunAt,
        health,
        diagnostics,
        signals,
        dominantDiagnostic: diagnostics[0]?.label ?? null,
        dominantStopReason:
          signals.find((signal) => signal.kind === "stop_reason")?.value ?? null,
      };
    })
    .sort((left, right) => {
      const severityRank = { poor: 0, watch: 1, healthy: 2 };
      if (severityRank[left.health] !== severityRank[right.health]) {
        return severityRank[left.health] - severityRank[right.health];
      }
      return right.totalRuns - left.totalRuns;
    });

  const runsBySearch = new Map<string, DiscoveryRunLike[]>();
  for (const run of runs) {
    if (!run.search_id) continue;
    const bucket = runsBySearch.get(run.search_id) ?? [];
    bucket.push(run);
    runsBySearch.set(run.search_id, bucket);
  }

  const searchAlerts: DiscoverySearchAlert[] = [];
  const nowTs = now.getTime();
  for (const search of searches) {
    if (!search.enabled) {
      continue;
    }

    const recentRuns = (runsBySearch.get(search.id) ?? [])
      .slice()
      .sort(
        (left, right) =>
          (toTimestamp(right.created_at ?? right.started_at ?? right.completed_at) ?? 0) -
          (toTimestamp(left.created_at ?? left.started_at ?? left.completed_at) ?? 0)
      );

    const recentThree = recentRuns.slice(0, 3);
    const failedCount = recentThree.filter((run) => run.status === "FAILED").length;
    const zeroYieldCount = recentThree.filter(
      (run) => run.status === "COMPLETED" && (run.jobs_found ?? 0) === 0
    ).length;

    if (failedCount >= 2) {
      searchAlerts.push({
        searchId: search.id,
        searchName: search.search_name,
        sourceName: search.source_name,
        location: search.location,
        severity: failedCount >= 3 ? "critical" : "warning",
        kind: "failures",
        message: `${failedCount} of the last ${recentThree.length} runs failed.`,
      });
    } else if (zeroYieldCount >= 2) {
      searchAlerts.push({
        searchId: search.id,
        searchName: search.search_name,
        sourceName: search.source_name,
        location: search.location,
        severity: zeroYieldCount >= 3 ? "critical" : "warning",
        kind: "zero_yield",
        message: `${zeroYieldCount} of the last ${recentThree.length} completed runs returned zero jobs.`,
      });
    }

    const lastRunTs = toTimestamp(search.last_run_at);
    const runFrequencyHours = search.run_frequency_hours ?? 24;
    if (!lastRunTs || nowTs - lastRunTs > runFrequencyHours * 2 * 60 * 60 * 1000) {
      searchAlerts.push({
        searchId: search.id,
        searchName: search.search_name,
        sourceName: search.source_name,
        location: search.location,
        severity: "warning",
        kind: "overdue",
        message: lastRunTs
          ? `No run within ${runFrequencyHours * 2} hours.`
          : "Search has not run yet.",
      });
    }
  }

  const recentFailures = runs
    .filter((run) => run.status === "FAILED")
    .sort(
      (left, right) =>
        (toTimestamp(right.created_at ?? right.started_at ?? right.completed_at) ?? 0) -
        (toTimestamp(left.created_at ?? left.started_at ?? left.completed_at) ?? 0)
    )
    .slice(0, 8)
    .map((run) => {
      const primaryKind = inferRunDiagnostics(run)[0] ?? "other_failure";
      return {
        runId: run.id,
        sourceName: run.source_name,
        searchName: run.search_name ?? null,
        location: run.location ?? null,
        errorMessage: run.error_message || "Unknown failure",
        createdAt: run.created_at ?? run.started_at ?? run.completed_at ?? null,
        diagnosticKind: primaryKind,
        diagnosticLabel: DISCOVERY_DIAGNOSTIC_LABELS[primaryKind].label,
        signalSummary: buildFailureSignalSummary(run),
      };
    });

  const summary: DiscoveryHealthSummary = {
    totalRuns: runs.length,
    completedRuns: runs.filter((run) => run.status === "COMPLETED").length,
    failedRuns: runs.filter((run) => run.status === "FAILED").length,
    zeroYieldRuns: runs.filter(
      (run) => run.status === "COMPLETED" && (run.jobs_found ?? 0) === 0
    ).length,
    healthySources: sourceHealth.filter((source) => source.health === "healthy").length,
    watchSources: sourceHealth.filter((source) => source.health === "watch").length,
    poorSources: sourceHealth.filter((source) => source.health === "poor").length,
  };

  return {
    summary,
    sourceHealth,
    searchAlerts: searchAlerts.sort((left, right) => {
      const severityRank = { critical: 0, warning: 1 };
      if (severityRank[left.severity] !== severityRank[right.severity]) {
        return severityRank[left.severity] - severityRank[right.severity];
      }
      return left.searchName.localeCompare(right.searchName);
    }),
    recentFailures,
  };
}

export function buildDiscoverySourceDrilldown(
  sourceName: string,
  runs: DiscoveryRunLike[],
  searches: DiscoverySearchLike[],
  sourceMeta?: { source_type: string | null; enabled: boolean | null } | null
): DiscoverySourceDrilldown {
  const normalizedSourceName = sourceName.toLowerCase();
  const sourceRuns = runs.filter(
    (run) => run.source_name.toLowerCase() === normalizedSourceName
  );
  const sourceSearches = searches.filter(
    (search) => search.source_name.toLowerCase() === normalizedSourceName
  );
  const snapshot = buildDiscoveryHealthSnapshot(sourceRuns, sourceSearches);
  const sourceHealth =
    snapshot.sourceHealth.find(
      (entry) => entry.sourceName.toLowerCase() === normalizedSourceName
    ) ?? null;

  const searchesByKey = new Map<string, DiscoveryRunLike[]>();
  for (const run of sourceRuns) {
    const key = [
      run.search_id ?? "no-search-id",
      run.search_name ?? "Unnamed search",
      run.location ?? "unknown-location",
    ].join("::");
    const bucket = searchesByKey.get(key) ?? [];
    bucket.push(run);
    searchesByKey.set(key, bucket);
  }

  const searchBreakdown = Array.from(searchesByKey.values())
    .map((searchRuns) => {
      const firstRun = searchRuns[0];
      const completedRuns = searchRuns.filter((run) => run.status === "COMPLETED");
      const failedRuns = searchRuns.filter((run) => run.status === "FAILED");
      const zeroYieldRuns = completedRuns.filter((run) => (run.jobs_found ?? 0) === 0);
      const stopReasons = summarizeStopReasons(searchRuns);

      return {
        searchId: firstRun?.search_id ?? null,
        searchName: firstRun?.search_name ?? "Unnamed search",
        location: firstRun?.location ?? null,
        totalRuns: searchRuns.length,
        completedRuns: completedRuns.length,
        failedRuns: failedRuns.length,
        zeroYieldRuns: zeroYieldRuns.length,
        avgJobsFound: round(average(completedRuns.map((run) => run.jobs_found ?? 0))),
        avgNewJobs: round(average(completedRuns.map((run) => run.jobs_new ?? 0))),
        lastRunAt:
          searchRuns
            .map((run) => run.completed_at ?? run.started_at ?? run.created_at)
            .sort((left, right) => (toTimestamp(right) ?? 0) - (toTimestamp(left) ?? 0))[0] ??
          null,
        diagnostics: summarizeDiagnostics(searchRuns),
        stopReasons,
        dominantStopReason: stopReasons[0]?.label ?? null,
      };
    })
    .sort((left, right) => {
      if (right.failedRuns !== left.failedRuns) {
        return right.failedRuns - left.failedRuns;
      }
      if (right.zeroYieldRuns !== left.zeroYieldRuns) {
        return right.zeroYieldRuns - left.zeroYieldRuns;
      }
      return right.totalRuns - left.totalRuns;
    });

  const recentRuns = sourceRuns
    .slice()
    .sort(
      (left, right) =>
        (toTimestamp(right.created_at ?? right.started_at ?? right.completed_at) ?? 0) -
        (toTimestamp(left.created_at ?? left.started_at ?? left.completed_at) ?? 0)
    )
    .slice(0, 30)
    .map((run) => {
      const diagnostics = inferRunDiagnostics(run);
      const attempted = asNumber(run.metadata?.description_fetch_attempted) ?? 0;
      const succeeded = asNumber(run.metadata?.description_fetch_succeeded) ?? 0;
      return {
        runId: run.id,
        searchId: run.search_id,
        searchName: run.search_name ?? null,
        location: run.location ?? null,
        status: run.status,
        jobsFound: run.jobs_found ?? 0,
        jobsNew: run.jobs_new ?? 0,
        jobsUpdated: run.jobs_updated ?? 0,
        pagesScraped: run.pages_scraped ?? 0,
        createdAt: run.created_at ?? run.started_at ?? null,
        completedAt: run.completed_at ?? null,
        stopReason: humanizeStopReason(run.metadata?.stop_reason as string | null) ?? null,
        diagnostics,
        diagnosticLabels: diagnostics.map(
          (kind) => DISCOVERY_DIAGNOSTIC_LABELS[kind].label
        ),
        signalSummary: buildFailureSignalSummary(run),
        errorMessage: run.error_message ?? null,
        sourceType: `${run.metadata?.source_type ?? ""}` || null,
        failureStage: `${run.metadata?.failure_stage ?? ""}` || null,
        hiddenNewJobs: asNumber(run.metadata?.hidden_new_jobs) ?? 0,
        mirroredJobs: asNumber(run.metadata?.jobs_mirrored) ?? 0,
        saveErrors: asNumber(run.metadata?.save_errors) ?? 0,
        descriptionSuccessRate:
          attempted > 0 ? round(percent(succeeded, attempted) * 100) : null,
      };
    });

  return {
    sourceName,
    sourceType:
      sourceMeta?.source_type ??
      recentRuns.find((run) => run.sourceType)?.sourceType ??
      null,
    enabled: sourceMeta?.enabled ?? null,
    totalRuns: sourceHealth?.totalRuns ?? 0,
    completedRuns: sourceHealth?.completedRuns ?? 0,
    failedRuns: sourceHealth?.failedRuns ?? 0,
    zeroYieldRuns: sourceHealth?.zeroYieldRuns ?? 0,
    health: sourceHealth?.health ?? "healthy",
    lastRunAt: sourceHealth?.lastRunAt ?? null,
    successRate: sourceHealth?.successRate ?? 0,
    zeroYieldRate: sourceHealth?.zeroYieldRate ?? 0,
    descriptionSuccessRate: sourceHealth?.descriptionSuccessRate ?? null,
    hiddenRecoveryRate: sourceHealth?.hiddenRecoveryRate ?? 0,
    saveErrorRate: sourceHealth?.saveErrorRate ?? 0,
    diagnostics: sourceHealth?.diagnostics ?? [],
    signals: sourceHealth?.signals ?? [],
    stopReasons: summarizeStopReasons(sourceRuns),
    searchAlerts: snapshot.searchAlerts,
    searches: searchBreakdown,
    recentRuns,
  };
}
