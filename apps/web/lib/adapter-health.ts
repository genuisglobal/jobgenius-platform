/**
 * ATS Adapter Health Monitor
 *
 * Tracks per-adapter success/failure rates and provides
 * circuit-breaking for degraded adapters.
 */

import { supabaseServer } from "@/lib/supabase/server";

export type HealthOutcome = "success" | "failure" | "timeout" | "captcha_blocked" | "session_expired";

export async function recordAdapterEvent(input: {
  atsType: string;
  runId: string;
  outcome: HealthOutcome;
  step?: string;
  errorCode?: string;
  durationMs?: number;
  urlHost?: string;
}) {
  await supabaseServer.from("adapter_health_events").insert({
    ats_type: input.atsType,
    run_id: input.runId,
    outcome: input.outcome,
    step: input.step ?? null,
    error_code: input.errorCode ?? null,
    duration_ms: input.durationMs ?? null,
    url_host: input.urlHost ?? null,
  });
}

export type AdapterHealthStats = {
  ats_type: string;
  total_runs: number;
  successes: number;
  failures: number;
  timeouts: number;
  captcha_blocks: number;
  session_expires: number;
  success_rate: number;
  avg_success_ms: number | null;
  last_event_at: string | null;
  status: "healthy" | "degraded" | "down";
};

/**
 * Get health stats for all adapters, with configurable time window
 */
export async function getAdapterHealthStats(windowDays: number = 30): Promise<AdapterHealthStats[]> {
  const since = new Date(Date.now() - windowDays * 86400000).toISOString();

  const { data } = await supabaseServer.rpc("get_adapter_health_stats", { since_date: since });

  // Fallback to manual query if RPC not available
  if (!data) {
    return getAdapterHealthStatsFallback(since);
  }

  return (data as AdapterHealthStats[]).map(addStatus);
}

async function getAdapterHealthStatsFallback(since: string): Promise<AdapterHealthStats[]> {
  const { data: events } = await supabaseServer
    .from("adapter_health_events")
    .select("ats_type, outcome, duration_ms, created_at")
    .gte("created_at", since);

  if (!events || events.length === 0) return [];

  const byAts: Record<string, {
    total: number; successes: number; failures: number; timeouts: number;
    captcha: number; sessions: number; durations: number[]; lastAt: string;
  }> = {};

  for (const e of events) {
    if (!byAts[e.ats_type]) {
      byAts[e.ats_type] = { total: 0, successes: 0, failures: 0, timeouts: 0, captcha: 0, sessions: 0, durations: [], lastAt: e.created_at };
    }
    const b = byAts[e.ats_type];
    b.total++;
    if (e.outcome === "success") { b.successes++; if (e.duration_ms) b.durations.push(e.duration_ms); }
    else if (e.outcome === "failure") b.failures++;
    else if (e.outcome === "timeout") b.timeouts++;
    else if (e.outcome === "captcha_blocked") b.captcha++;
    else if (e.outcome === "session_expired") b.sessions++;
    if (e.created_at > b.lastAt) b.lastAt = e.created_at;
  }

  return Object.entries(byAts).map(([atsType, b]) => addStatus({
    ats_type: atsType,
    total_runs: b.total,
    successes: b.successes,
    failures: b.failures,
    timeouts: b.timeouts,
    captcha_blocks: b.captcha,
    session_expires: b.sessions,
    success_rate: b.total > 0 ? Math.round(1000 * b.successes / b.total) / 10 : 0,
    avg_success_ms: b.durations.length > 0 ? Math.round(b.durations.reduce((a, c) => a + c, 0) / b.durations.length) : null,
    last_event_at: b.lastAt,
    status: "healthy",
  }));
}

function addStatus(s: AdapterHealthStats): AdapterHealthStats {
  if (s.total_runs < 5) s.status = "healthy"; // Not enough data
  else if (s.success_rate >= 70) s.status = "healthy";
  else if (s.success_rate >= 40) s.status = "degraded";
  else s.status = "down";
  return s;
}

/**
 * Check if an ATS adapter should be circuit-broken
 * Looks at last 10 runs; if 8+ failed, circuit-break
 */
export async function shouldCircuitBreak(atsType: string): Promise<{ blocked: boolean; reason?: string }> {
  const { data: recent } = await supabaseServer
    .from("adapter_health_events")
    .select("outcome")
    .eq("ats_type", atsType)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!recent || recent.length < 5) return { blocked: false };

  const failures = recent.filter((e) => e.outcome !== "success").length;
  if (failures >= 8) {
    return {
      blocked: true,
      reason: `${atsType} adapter circuit-broken: ${failures}/${recent.length} recent failures`,
    };
  }

  return { blocked: false };
}

/**
 * Get failure breakdown by step for a specific ATS
 */
export async function getFailureBreakdown(atsType: string, days: number = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { data } = await supabaseServer
    .from("adapter_health_events")
    .select("step, error_code, outcome")
    .eq("ats_type", atsType)
    .neq("outcome", "success")
    .gte("created_at", since);

  if (!data) return { byStep: {}, byError: {} };

  const byStep: Record<string, number> = {};
  const byError: Record<string, number> = {};

  for (const e of data) {
    if (e.step) byStep[e.step] = (byStep[e.step] || 0) + 1;
    if (e.error_code) byError[e.error_code] = (byError[e.error_code] || 0) + 1;
  }

  return { byStep, byError };
}
