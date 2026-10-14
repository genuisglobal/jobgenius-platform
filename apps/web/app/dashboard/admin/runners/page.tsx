import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";

interface HeartbeatRow {
  runner_id: string;
  reported_at: string;
  meta: Record<string, unknown> | null;
}

interface RunRow {
  ats_type: string | null;
  status: string;
  priority: number | null;
  locked_by: string | null;
  updated_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  RUNNING: "bg-violet-100 text-violet-700",
  RETRYING: "bg-amber-100 text-amber-700",
  READY: "bg-gray-100 text-gray-600",
  NEEDS_ATTENTION: "bg-red-100 text-red-700",
};

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  normal: "bg-gray-100 text-gray-600",
  low: "bg-violet-100 text-violet-700",
};

function bucketPriority(priority: number | null): "high" | "normal" | "low" {
  const p = Number(priority);
  if (!Number.isFinite(p)) return "normal";
  if (p <= 3) return "high";
  if (p >= 7) return "low";
  return "normal";
}

function fmtAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const ACTIVE_HEARTBEAT_MIN = 5;

export default async function AdminRunnersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am" || !isAdminRole(user.role)) redirect("/dashboard");

  const sinceActive = new Date(Date.now() - ACTIVE_HEARTBEAT_MIN * 60_000).toISOString();
  const sinceThroughput = new Date(Date.now() - 60 * 60_000).toISOString();

  const [{ data: heartbeatsRaw }, { data: activeRunsRaw }, { data: queueRaw }, { data: completedRaw }] =
    await Promise.all([
      supabaseAdmin
        .from("runner_heartbeats")
        .select("runner_id, reported_at, meta")
        .gte("reported_at", sinceActive)
        .order("reported_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("application_runs")
        .select("ats_type, status, priority, locked_by, updated_at")
        .in("status", ["RUNNING", "RETRYING"]),
      supabaseAdmin
        .from("application_runs")
        .select("ats_type, status, priority")
        .in("status", ["READY", "RETRYING"]),
      supabaseAdmin
        .from("application_runs")
        .select("ats_type, status, updated_at")
        .in("status", ["APPLIED", "FAILED"])
        .gte("updated_at", sinceThroughput),
    ]);

  const heartbeats = (heartbeatsRaw ?? []) as HeartbeatRow[];
  const activeRuns = (activeRunsRaw ?? []) as RunRow[];
  const queue = (queueRaw ?? []) as RunRow[];
  const completed = (completedRaw ?? []) as RunRow[];

  // Latest heartbeat per runner_id
  const latestByRunner = new Map<string, HeartbeatRow>();
  for (const hb of heartbeats) {
    if (!latestByRunner.has(hb.runner_id)) {
      latestByRunner.set(hb.runner_id, hb);
    }
  }
  const activeRunners = Array.from(latestByRunner.values());

  // Per-ATS active count
  const perAtsActive = new Map<string, number>();
  for (const r of activeRuns) {
    const ats = r.ats_type ?? "UNKNOWN";
    perAtsActive.set(ats, (perAtsActive.get(ats) ?? 0) + 1);
  }

  // Queue depth by priority bucket
  const queueByPriority = { high: 0, normal: 0, low: 0 };
  for (const q of queue) {
    queueByPriority[bucketPriority(q.priority)] += 1;
  }

  // Throughput last hour
  const appliedLastHour = completed.filter((c) => c.status === "APPLIED").length;
  const failedLastHour = completed.filter((c) => c.status === "FAILED").length;
  const totalAttempted = appliedLastHour + failedLastHour;
  const successRate =
    totalAttempted > 0 ? Math.round((appliedLastHour / totalAttempted) * 100) : null;

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Runner Fleet</h1>
      <p className="text-sm text-gray-500 mb-6">
        Active runners (heartbeat within the last {ACTIVE_HEARTBEAT_MIN} min),
        per-ATS load, queue depth by priority, and the last hour&apos;s throughput.
        Per-ATS cap:{" "}
        <code>MAX_CONCURRENT_PER_ATS</code> = {process.env.MAX_CONCURRENT_PER_ATS ?? "3 (default)"}.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Active runners</p>
          <p className="text-2xl font-bold text-gray-900">{activeRunners.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Active runs</p>
          <p className="text-2xl font-bold text-gray-900">{activeRuns.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Queue depth</p>
          <p className="text-2xl font-bold text-gray-900">{queue.length}</p>
          <p className="text-[11px] text-gray-500 mt-1">
            high {queueByPriority.high} · normal {queueByPriority.normal} · low {queueByPriority.low}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Last 1h success</p>
          <p className="text-2xl font-bold text-gray-900">
            {successRate !== null ? `${successRate}%` : "—"}
          </p>
          <p className="text-[11px] text-gray-500 mt-1">
            {appliedLastHour} applied · {failedLastHour} failed
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">
          Active runners
        </div>
        {activeRunners.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-400">
            No runner heartbeats in the last {ACTIVE_HEARTBEAT_MIN} minutes.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Runner</th>
                <th className="px-4 py-2 text-left font-semibold">Last heartbeat</th>
                <th className="px-4 py-2 text-left font-semibold">Meta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activeRunners.map((r) => (
                <tr key={r.runner_id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs text-gray-800">{r.runner_id}</td>
                  <td className="px-4 py-2 text-gray-600">{fmtAgo(r.reported_at)}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {r.meta && Object.keys(r.meta).length > 0 ? (
                      <details>
                        <summary className="cursor-pointer">{Object.keys(r.meta).length} keys</summary>
                        <pre className="text-[10px] mt-1 bg-gray-50 p-2 rounded overflow-x-auto">
                          {JSON.stringify(r.meta, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">
          Per-ATS load
        </div>
        {perAtsActive.size === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-400">No active runs.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">ATS</th>
                <th className="px-4 py-2 text-right font-semibold">Active runs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Array.from(perAtsActive.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([ats, count]) => (
                  <tr key={ats} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs text-gray-800">{ats}</td>
                    <td className="px-4 py-2 text-right text-gray-900 font-medium">{count}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">
          Currently running
        </div>
        {activeRuns.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-400">No active runs.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">ATS</th>
                <th className="px-4 py-2 text-left font-semibold">Status</th>
                <th className="px-4 py-2 text-left font-semibold">Priority</th>
                <th className="px-4 py-2 text-left font-semibold">Locked by</th>
                <th className="px-4 py-2 text-left font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activeRuns
                .sort(
                  (a, b) =>
                    (a.priority ?? 5) - (b.priority ?? 5) ||
                    new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
                )
                .slice(0, 50)
                .map((r, idx) => {
                  const bucket = bucketPriority(r.priority);
                  return (
                    <tr key={`${r.locked_by}-${idx}`} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs text-gray-800">{r.ats_type ?? "UNKNOWN"}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            STATUS_STYLES[r.status] ?? "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${PRIORITY_STYLES[bucket]}`}
                        >
                          {bucket} ({r.priority ?? 5})
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500 truncate max-w-[200px]">
                        {r.locked_by ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">{fmtAgo(r.updated_at)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
