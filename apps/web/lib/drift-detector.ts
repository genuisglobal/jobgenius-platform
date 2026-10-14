import { supabaseAdmin } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

// ============================================================
// Drift detector (drift_incidents, migration 087).
//
// Three signals, each opens an incident when its threshold is crossed.
// Idempotency: only one OPEN incident per (ats_type, url_host, kind).
//
// Designed to be called from a cron tick that fires after the canary
// cron — see /api/cron/run-canaries.
// ============================================================

const log = createLogger("drift-detector");

const CANARY_FAIL_STREAK = Number(process.env.DRIFT_CANARY_FAIL_STREAK ?? 2);
const FAILURE_RATE_SPIKE_THRESHOLD = Number(
  process.env.DRIFT_FAILURE_RATE_SPIKE ?? 0.2
);
const SELECTOR_CLUSTER_THRESHOLD = Number(
  process.env.DRIFT_SELECTOR_CLUSTER ?? 3
);

type DriftKind = "canary_failing" | "failure_rate_spike" | "selector_change_cluster";

interface OpenIncidentArgs {
  atsType: string;
  urlHost: string | null;
  kind: DriftKind;
  signal: Record<string, unknown>;
  summary: string;
  relatedRunIds?: string[];
}

async function alreadyOpen(args: {
  atsType: string;
  urlHost: string | null;
  kind: DriftKind;
}): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("drift_incidents")
    .select("id")
    .eq("ats_type", args.atsType)
    .eq("kind", args.kind)
    .in("status", ["open", "acknowledged"])
    .limit(1)
    .maybeSingle();
  if (data) return true;
  // If kind is host-scoped, also check the host-filtered variant. (We could
  // tighten the index to enforce uniqueness, but a query is simpler.)
  if (args.urlHost) {
    const { data: hostRow } = await supabaseAdmin
      .from("drift_incidents")
      .select("id")
      .eq("ats_type", args.atsType)
      .eq("url_host", args.urlHost)
      .eq("kind", args.kind)
      .in("status", ["open", "acknowledged"])
      .limit(1)
      .maybeSingle();
    return Boolean(hostRow);
  }
  return false;
}

async function openIncident(args: OpenIncidentArgs): Promise<string | null> {
  if (await alreadyOpen({ atsType: args.atsType, urlHost: args.urlHost, kind: args.kind })) {
    return null;
  }
  const { data, error } = await supabaseAdmin
    .from("drift_incidents")
    .insert({
      ats_type: args.atsType,
      url_host: args.urlHost,
      kind: args.kind,
      signal: args.signal,
      summary: args.summary,
      related_run_ids: args.relatedRunIds ?? null,
    })
    .select("id")
    .single();
  if (error) {
    log.warn("openIncident failed", { kind: args.kind, error: error.message });
    return null;
  }
  return (data?.id as string) ?? null;
}

interface DetectorResult {
  opened: number;
  byKind: Partial<Record<DriftKind, number>>;
}

// ─── Signal 1: canary failing ─────────────────────────────────

async function detectCanaryFailing(): Promise<{ kind: DriftKind; opened: number }> {
  const since = new Date(Date.now() - 3 * 86400000).toISOString();
  const { data } = await supabaseAdmin
    .from("canary_runs")
    .select("ats_type, outcome, created_at, error")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  const byAts = new Map<string, Array<{ outcome: string; error: string | null }>>();
  for (const row of data ?? []) {
    const list = byAts.get(row.ats_type as string) ?? [];
    list.push({ outcome: row.outcome as string, error: row.error as string | null });
    byAts.set(row.ats_type as string, list);
  }

  let opened = 0;
  for (const [ats, list] of Array.from(byAts.entries())) {
    let streak = 0;
    for (const r of list) {
      if (r.outcome === "pass") break;
      streak += 1;
    }
    if (streak >= CANARY_FAIL_STREAK) {
      const id = await openIncident({
        atsType: ats,
        urlHost: null,
        kind: "canary_failing",
        signal: { streak, threshold: CANARY_FAIL_STREAK },
        summary: `${ats}: ${streak} consecutive canary failures (latest: ${list[0]?.error ?? "unknown"}).`,
      });
      if (id) opened += 1;
    }
  }
  return { kind: "canary_failing", opened };
}

// ─── Signal 2: failure-rate spike per host (week over week) ───

async function detectFailureRateSpike(): Promise<{ kind: DriftKind; opened: number }> {
  const sinceThisWeek = new Date(Date.now() - 7 * 86400000).toISOString();
  const sincePrevWeek = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data } = await supabaseAdmin
    .from("adapter_health_events")
    .select("ats_type, url_host, outcome, created_at")
    .gte("created_at", sincePrevWeek);

  type Window = { ok: number; fail: number };
  const this7d = new Map<string, Window>();
  const prev7d = new Map<string, Window>();

  for (const row of data ?? []) {
    if (!row.url_host) continue;
    const key = `${row.ats_type ?? "UNKNOWN"}::${row.url_host}`;
    const isOk = row.outcome === "success";
    const map = row.created_at >= sinceThisWeek ? this7d : prev7d;
    const w = map.get(key) ?? { ok: 0, fail: 0 };
    if (isOk) w.ok += 1;
    else w.fail += 1;
    map.set(key, w);
  }

  let opened = 0;
  for (const [key, current] of Array.from(this7d.entries())) {
    const previous = prev7d.get(key);
    if (!previous) continue;
    const currentTotal = current.ok + current.fail;
    const previousTotal = previous.ok + previous.fail;
    // Need enough volume to be meaningful.
    if (currentTotal < 10 || previousTotal < 10) continue;
    const currentRate = current.fail / currentTotal;
    const previousRate = previous.fail / previousTotal;
    const delta = currentRate - previousRate;
    if (delta < FAILURE_RATE_SPIKE_THRESHOLD) continue;

    const [atsType, urlHost] = key.split("::");
    const id = await openIncident({
      atsType,
      urlHost,
      kind: "failure_rate_spike",
      signal: {
        current_rate: Math.round(currentRate * 1000) / 10,
        previous_rate: Math.round(previousRate * 1000) / 10,
        delta_pct: Math.round(delta * 1000) / 10,
        current_total: currentTotal,
        previous_total: previousTotal,
        threshold: FAILURE_RATE_SPIKE_THRESHOLD,
      },
      summary: `${atsType} on ${urlHost}: failure rate jumped from ${(previousRate * 100).toFixed(1)}% to ${(currentRate * 100).toFixed(1)}% (+${(delta * 100).toFixed(1)} pts).`,
    });
    if (id) opened += 1;
  }
  return { kind: "failure_rate_spike", opened };
}

// ─── Signal 3: selector_change cluster from diagnoses ─────────

async function detectSelectorClusters(): Promise<{ kind: DriftKind; opened: number }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: diagnoses } = await supabaseAdmin
    .from("failure_diagnoses")
    .select("run_id, created_at, status")
    .eq("root_cause", "selector_changed")
    .gte("created_at", since);

  if (!diagnoses || diagnoses.length === 0) {
    return { kind: "selector_change_cluster", opened: 0 };
  }

  const runIds = Array.from(new Set(diagnoses.map((d) => d.run_id as string)));
  const { data: runs } = await supabaseAdmin
    .from("application_runs")
    .select("id, ats_type, last_seen_url")
    .in("id", runIds);

  const byHost = new Map<string, string[]>(); // key: ats::host -> run_ids
  for (const run of runs ?? []) {
    if (!run.last_seen_url) continue;
    let host: string | null = null;
    try {
      host = new URL(run.last_seen_url as string).hostname.toLowerCase();
    } catch {
      continue;
    }
    const key = `${(run.ats_type as string) ?? "UNKNOWN"}::${host}`;
    const arr = byHost.get(key) ?? [];
    arr.push(run.id as string);
    byHost.set(key, arr);
  }

  let opened = 0;
  for (const [key, ids] of Array.from(byHost.entries())) {
    if (ids.length < SELECTOR_CLUSTER_THRESHOLD) continue;
    const [atsType, urlHost] = key.split("::");
    const id = await openIncident({
      atsType,
      urlHost,
      kind: "selector_change_cluster",
      signal: { count: ids.length, threshold: SELECTOR_CLUSTER_THRESHOLD },
      summary: `${atsType} on ${urlHost}: ${ids.length} 'selector_changed' diagnoses in the last 24h.`,
      relatedRunIds: ids.slice(0, 10),
    });
    if (id) opened += 1;
  }
  return { kind: "selector_change_cluster", opened };
}

// ─── Public entry: run all three detectors ────────────────────

export async function runDriftDetector(): Promise<DetectorResult> {
  const [canary, spike, cluster] = await Promise.all([
    detectCanaryFailing().catch((err) => {
      log.warn("canary detector threw", { error: err instanceof Error ? err.message : String(err) });
      return { kind: "canary_failing" as DriftKind, opened: 0 };
    }),
    detectFailureRateSpike().catch((err) => {
      log.warn("rate spike detector threw", { error: err instanceof Error ? err.message : String(err) });
      return { kind: "failure_rate_spike" as DriftKind, opened: 0 };
    }),
    detectSelectorClusters().catch((err) => {
      log.warn("cluster detector threw", { error: err instanceof Error ? err.message : String(err) });
      return { kind: "selector_change_cluster" as DriftKind, opened: 0 };
    }),
  ]);

  return {
    opened: canary.opened + spike.opened + cluster.opened,
    byKind: {
      canary_failing: canary.opened,
      failure_rate_spike: spike.opened,
      selector_change_cluster: cluster.opened,
    },
  };
}
