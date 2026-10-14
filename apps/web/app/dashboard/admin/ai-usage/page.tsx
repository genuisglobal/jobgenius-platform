import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";

interface AiCallRow {
  id: string;
  route: string | null;
  function_name: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  latency_ms: number | null;
  status: string;
  error: string | null;
  cost_usd: number | string | null;
  created_at: string;
}

function fmtCurrency(usd: number): string {
  return usd.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function bucketDate(iso: string): string {
  return iso.slice(0, 10);
}

export default async function AiUsagePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am" || !isAdminRole(user.role)) redirect("/dashboard");

  const since30d = new Date(Date.now() - 30 * 86400000).toISOString();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ data: recentRaw }, { data: rollingRaw }] = await Promise.all([
    supabaseAdmin
      .from("ai_call_logs")
      .select(
        "id, route, function_name, model, input_tokens, output_tokens, total_tokens, latency_ms, status, error, cost_usd, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("ai_call_logs")
      .select("created_at, function_name, model, status, cost_usd, total_tokens")
      .gte("created_at", since30d),
  ]);

  const recent = (recentRaw ?? []) as AiCallRow[];
  const rolling = (rollingRaw ?? []) as Array<{
    created_at: string;
    function_name: string;
    model: string;
    status: string;
    cost_usd: number | string | null;
    total_tokens: number | null;
  }>;

  const last24h = rolling.filter((r) => r.created_at >= since24h);
  const totalCost24h = last24h.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
  const totalCalls24h = last24h.length;
  const errorCalls24h = last24h.filter((r) => r.status === "error").length;

  // Daily series for last 30 days
  const byDay = new Map<string, { calls: number; cost: number; errors: number }>();
  for (const r of rolling) {
    const day = bucketDate(r.created_at);
    const entry = byDay.get(day) ?? { calls: 0, cost: 0, errors: 0 };
    entry.calls += 1;
    entry.cost += Number(r.cost_usd) || 0;
    if (r.status === "error") entry.errors += 1;
    byDay.set(day, entry);
  }
  const days = Array.from(byDay.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 30);
  const maxDailyCost = Math.max(0.0001, ...days.map(([, v]) => v.cost));

  // By function name (24h)
  const byFunction = new Map<string, { calls: number; cost: number; errors: number }>();
  for (const r of last24h) {
    const entry = byFunction.get(r.function_name) ?? { calls: 0, cost: 0, errors: 0 };
    entry.calls += 1;
    entry.cost += Number(r.cost_usd) || 0;
    if (r.status === "error") entry.errors += 1;
    byFunction.set(r.function_name, entry);
  }
  const functionRows = Array.from(byFunction.entries())
    .sort((a, b) => b[1].cost - a[1].cost)
    .slice(0, 20);

  const capRaw = Number(process.env.OPENAI_DAILY_USD_CAP);
  const cap = Number.isFinite(capRaw) && capRaw > 0 ? capRaw : null;
  const capPct = cap ? Math.min(100, (totalCost24h / cap) * 100) : 0;

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">AI usage</h1>
      <p className="text-sm text-gray-500 mb-6">
        Per-call OpenAI usage written by{" "}
        <code className="text-xs">lib/ai-logging.ts</code>. Rolling 24-hour cost
        guard:{" "}
        {cap
          ? `OPENAI_DAILY_USD_CAP = ${fmtCurrency(cap)}`
          : "no cap set (OPENAI_DAILY_USD_CAP unset)"}
        .
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Stat label="Calls (24h)" value={String(totalCalls24h)} tone="text-gray-900" />
        <Stat label="Cost (24h)" value={fmtCurrency(totalCost24h)} tone="text-violet-700" />
        <Stat
          label="Errors (24h)"
          value={String(errorCalls24h)}
          tone={errorCalls24h > 0 ? "text-red-600" : "text-gray-900"}
        />
        <Stat
          label="Cap usage"
          value={cap ? `${capPct.toFixed(0)}%` : "—"}
          tone={capPct >= 90 ? "text-red-600" : capPct >= 70 ? "text-amber-600" : "text-green-700"}
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Daily cost (last 30 days)</h2>
        {days.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">No AI calls recorded yet.</p>
        ) : (
          <div className="space-y-1">
            {days.map(([day, v]) => (
              <div key={day} className="flex items-center gap-3 text-xs">
                <span className="w-20 text-gray-500 font-mono">{day}</span>
                <div className="flex-1 bg-gray-100 rounded h-4 relative overflow-hidden">
                  <div
                    className="bg-violet-500 h-full"
                    style={{ width: `${(v.cost / maxDailyCost) * 100}%` }}
                  />
                </div>
                <span className="w-24 text-right text-gray-700 font-medium">{fmtCurrency(v.cost)}</span>
                <span className="w-16 text-right text-gray-500">{v.calls} calls</span>
                <span className="w-16 text-right text-red-500">{v.errors > 0 ? `${v.errors} err` : "—"}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">
          Top functions (24h, by cost)
        </div>
        {functionRows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">No calls in the last 24 hours.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Function</th>
                <th className="px-4 py-2 text-right font-semibold">Calls</th>
                <th className="px-4 py-2 text-right font-semibold">Cost</th>
                <th className="px-4 py-2 text-right font-semibold">Errors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {functionRows.map(([fn, v]) => (
                <tr key={fn} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs text-gray-800">{fn}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{v.calls}</td>
                  <td className="px-4 py-2 text-right font-medium text-gray-900">
                    {fmtCurrency(v.cost)}
                  </td>
                  <td className={`px-4 py-2 text-right ${v.errors > 0 ? "text-red-600" : "text-gray-500"}`}>
                    {v.errors > 0 ? v.errors : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">
          Recent calls
        </div>
        {recent.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">No AI calls logged yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">When</th>
                <th className="px-3 py-2 text-left font-semibold">Function</th>
                <th className="px-3 py-2 text-left font-semibold">Model</th>
                <th className="px-3 py-2 text-right font-semibold">Tokens</th>
                <th className="px-3 py-2 text-right font-semibold">Latency</th>
                <th className="px-3 py-2 text-right font-semibold">Cost</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recent.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{fmtDateTime(row.created_at)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-800">{row.function_name}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{row.model}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{row.total_tokens ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-gray-700">
                    {row.latency_ms != null ? `${row.latency_ms}ms` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-900 font-medium">
                    {row.cost_usd != null ? fmtCurrency(Number(row.cost_usd)) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        row.status === "success"
                          ? "bg-green-100 text-green-700"
                          : row.status === "error"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${tone}`}>{value}</p>
    </div>
  );
}
