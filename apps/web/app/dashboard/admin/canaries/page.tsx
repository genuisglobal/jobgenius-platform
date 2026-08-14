import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";

interface CanaryRow {
  id: string;
  ats_type: string;
  probe_url: string | null;
  outcome: string;
  duration_ms: number | null;
  http_status: number | null;
  details: Record<string, unknown>;
  error: string | null;
  created_at: string;
}

const OUTCOME_STYLES: Record<string, string> = {
  pass: "bg-green-100 text-green-700",
  fail: "bg-red-100 text-red-700",
  degraded: "bg-amber-100 text-amber-700",
  skipped: "bg-gray-100 text-gray-500",
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

interface PerAts {
  ats: string;
  last: CanaryRow | null;
  last7: CanaryRow[];
  streak: number;          // consecutive non-pass days ending today
  passRate7d: number;      // 0..1
}

function summarize(byAts: Map<string, CanaryRow[]>): PerAts[] {
  const out: PerAts[] = [];
  for (const [ats, rows] of Array.from(byAts.entries())) {
    const sorted = [...rows].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const last = sorted[0] ?? null;
    let streak = 0;
    for (const r of sorted) {
      if (r.outcome === "pass") break;
      streak += 1;
    }
    const passes = sorted.filter((r) => r.outcome === "pass").length;
    out.push({
      ats,
      last,
      last7: sorted.slice(0, 7),
      streak,
      passRate7d: sorted.length > 0 ? passes / sorted.length : 0,
    });
  }
  out.sort((a, b) => b.streak - a.streak || b.passRate7d - a.passRate7d);
  return out;
}

export default async function AdminCanariesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am" || !isAdminRole(user.role)) redirect("/dashboard");

  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data } = await supabaseAdmin
    .from("canary_runs")
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as CanaryRow[];
  const byAts = new Map<string, CanaryRow[]>();
  for (const r of rows) {
    const list = byAts.get(r.ats_type) ?? [];
    list.push(r);
    byAts.set(r.ats_type, list);
  }
  const summary = summarize(byAts);

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Canary Probes</h1>
      <p className="text-sm text-gray-500 mb-6">
        Daily per-ATS health checks. A pass means the host responded 2xx-3xx
        AND the page body still contained at least one of our apply-entry
        hints. A streak of failures opens a drift incident automatically.
      </p>

      {summary.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
          No canary results in the last 7 days. The cron may not have run yet.
        </div>
      ) : (
        <div className="space-y-3">
          {summary.map((row) => (
            <div key={row.ats} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-gray-900">{row.ats}</span>
                  {row.last && (
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        OUTCOME_STYLES[row.last.outcome] ?? OUTCOME_STYLES.skipped
                      }`}
                    >
                      {row.last.outcome}
                    </span>
                  )}
                  {row.streak >= 2 && (
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
                      streak {row.streak}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  pass rate (7d): {(row.passRate7d * 100).toFixed(0)}%
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                {row.last7.map((r) => (
                  <div
                    key={r.id}
                    title={`${fmtDateTime(r.created_at)} — ${r.outcome}${r.error ? ` (${r.error})` : ""}`}
                    className={`w-6 h-6 rounded ${
                      r.outcome === "pass"
                        ? "bg-green-500"
                        : r.outcome === "degraded"
                        ? "bg-amber-500"
                        : r.outcome === "fail"
                        ? "bg-red-500"
                        : "bg-gray-300"
                    }`}
                  />
                ))}
              </div>
              {row.last?.error && (
                <p className="text-xs text-red-600 mt-2 italic">latest error: {row.last.error}</p>
              )}
              {row.last?.probe_url && (
                <p className="text-[11px] text-gray-400 mt-1 truncate">
                  probe: <code>{row.last.probe_url}</code>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
