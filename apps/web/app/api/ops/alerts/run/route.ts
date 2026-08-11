import { supabaseServer } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/ops-auth";
import { enforceOpsRateLimit } from "@/lib/rate-limit-presets";

type AlertInsert = {
  severity: string;
  type: string;
  message: string;
  meta?: Record<string, unknown>;
};

async function sendSlackAlert(text: string) {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) {
    return;
  }
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    // Best-effort only.
  }
}

async function runAlerts(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;

  const auth = requireOpsAuth(request.headers, request.url);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: 401 });
  }

  const minSuccessRate = Number(process.env.OPS_ALERT_SUCCESS_RATE_MIN ?? 0.6);
  const maxPauseRate = Number(process.env.OPS_ALERT_PAUSE_RATE_MAX ?? 0.4);
  const heartbeatStaleMinutes = Number(process.env.OPS_ALERT_HEARTBEAT_STALE_MIN ?? 5);
  const now = Date.now();
  const since = new Date(now - 60 * 60 * 1000).toISOString();

  const { data: kpis } = await supabaseServer
    .from("v_ops_kpis_hourly")
    .select("*")
    .gte("hour", since);

  const alertsToInsert: AlertInsert[] = [];

  for (const row of kpis ?? []) {
    const claimed = row.claimed ?? 0;
    const completed = row.completed ?? 0;
    const paused = row.paused ?? 0;
    const successRate = row.success_rate ?? (claimed > 0 ? completed / claimed : 1);
    const pauseRate = claimed > 0 ? paused / claimed : 0;

    if (claimed >= 5 && successRate < minSuccessRate) {
      alertsToInsert.push({
        severity: "HIGH",
        type: "LOW_SUCCESS_RATE",
        message: `Success rate ${successRate} below threshold for ${row.ats_type ?? "UNKNOWN"}.`,
        meta: {
          ats_type: row.ats_type ?? null,
          hour: row.hour,
          success_rate: successRate,
          claimed,
          completed,
        },
      });
    }

    if (claimed >= 5 && pauseRate > maxPauseRate) {
      alertsToInsert.push({
        severity: "MEDIUM",
        type: "HIGH_PAUSE_RATE",
        message: `Pause rate ${pauseRate} above threshold for ${row.ats_type ?? "UNKNOWN"}.`,
        meta: {
          ats_type: row.ats_type ?? null,
          hour: row.hour,
          pause_rate: pauseRate,
          claimed,
          paused,
          top_pause_reason: row.top_pause_reason ?? null,
        },
      });
    }
  }

  const { data: heartbeats } = await supabaseServer
    .from("runner_heartbeats")
    .select("runner_id, ts")
    .order("ts", { ascending: false })
    .limit(200);

  const latestByRunner = new Map<string, string>();
  for (const hb of heartbeats ?? []) {
    if (!latestByRunner.has(hb.runner_id)) {
      latestByRunner.set(hb.runner_id, hb.ts);
    }
  }

  latestByRunner.forEach((ts, runnerId) => {
    const ageMinutes = (now - new Date(ts).getTime()) / 60000;
    if (ageMinutes > heartbeatStaleMinutes) {
      alertsToInsert.push({
        severity: "HIGH",
        type: "RUNNER_HEARTBEAT_STALE",
        message: `Runner ${runnerId} heartbeat stale (${Math.round(ageMinutes)}m).`,
        meta: { runner_id: runnerId, last_ts: ts },
      });
    }
  });

  if (alertsToInsert.length === 0) {
    return Response.json({ success: true, created: 0 });
  }

  const { data: existingAlerts } = await supabaseServer
    .from("ops_alerts")
    .select("id, type, meta, resolved_at")
    .is("resolved_at", null);

  const deduped = alertsToInsert.filter((alert) => {
    return !(existingAlerts ?? []).some((existing) => {
      if (existing.type !== alert.type) {
        return false;
      }
      const existingMeta = existing.meta as Record<string, unknown> | null;
      const alertMeta = alert.meta ?? {};
      if (existingMeta?.runner_id && alertMeta.runner_id) {
        return existingMeta.runner_id === alertMeta.runner_id;
      }
      if (existingMeta?.ats_type && alertMeta.ats_type) {
        return existingMeta.ats_type === alertMeta.ats_type;
      }
      return false;
    });
  });

  if (deduped.length === 0) {
    return Response.json({ success: true, created: 0 });
  }

  const { data: inserted, error } = await supabaseServer
    .from("ops_alerts")
    .insert(
      deduped.map((alert) => ({
        severity: alert.severity,
        type: alert.type,
        message: alert.message,
        meta: alert.meta ?? {},
        created_at: new Date().toISOString(),
      }))
    )
    .select("id, severity, type, message");

  if (error) {
    return Response.json(
      { success: false, error: "Failed to create alerts." },
      { status: 500 }
    );
  }

  for (const alert of inserted ?? []) {
    if (alert.severity === "HIGH") {
      await sendSlackAlert(`[${alert.type}] ${alert.message}`);
    }
  }

  return Response.json({ success: true, created: inserted?.length ?? 0, alerts: inserted });
}

export async function POST(request: Request) {
  return runAlerts(request);
}

export async function GET(request: Request) {
  return runAlerts(request);
}
