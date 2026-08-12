import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";

// AM-facing apply success & health view. Scopes application_runs to the
// account manager's assigned seekers (admins see their own assignments here;
// the org-wide view lives under /dashboard/admin/application-analytics).

const PERIOD_DAYS = 30;

type RunRow = { status: string | null; ats_type: string | null; job_seeker_id: string | null };
type AttentionRow = {
  id: string;
  ats_type: string | null;
  current_step: string | null;
  last_error: string | null;
  last_error_code: string | null;
  created_at: string;
  job_seeker_id: string | null;
  job_posts: { title: string | null; company: string | null } | null;
};

const APPLIED = new Set(["APPLIED", "COMPLETED", "SUBMITTED"]);

function pct(n: number, d: number) {
  return d > 0 ? Math.round((100 * n) / d) : 0;
}

function humanizeReason(row: AttentionRow): string {
  const raw = row.last_error_code || row.current_step || row.last_error || "Needs review";
  return String(raw).replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

export default async function ApplyHealthPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.role || (!isAdminRole(user.role) && user.role !== "am")) {
    redirect("/dashboard");
  }

  const since = new Date(Date.now() - PERIOD_DAYS * 86400000).toISOString();

  const { data: assignments } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("job_seeker_id")
    .eq("account_manager_id", user.id);
  const seekerIds = (assignments ?? []).map((a) => a.job_seeker_id).filter(Boolean) as string[];

  let runs: RunRow[] = [];
  let attention: AttentionRow[] = [];
  const seekerNames = new Map<string, string>();

  if (seekerIds.length > 0) {
    const [runsRes, attentionRes, seekersRes] = await Promise.all([
      supabaseAdmin
        .from("application_runs")
        .select("status, ats_type, job_seeker_id")
        .gte("created_at", since)
        .in("job_seeker_id", seekerIds),
      supabaseAdmin
        .from("application_runs")
        .select(
          "id, ats_type, current_step, last_error, last_error_code, created_at, job_seeker_id, job_posts(title, company)"
        )
        .eq("status", "NEEDS_ATTENTION")
        .in("job_seeker_id", seekerIds)
        .order("created_at", { ascending: false })
        .limit(25),
      supabaseAdmin.from("job_seekers").select("id, full_name").in("id", seekerIds),
    ]);

    runs = (runsRes.data ?? []) as RunRow[];
    attention = (attentionRes.data ?? []) as unknown as AttentionRow[];
    for (const s of seekersRes.data ?? []) {
      seekerNames.set(s.id, s.full_name || "Unnamed seeker");
    }
  }

  // Summary
  let applied = 0;
  let failed = 0;
  let needsAttention = 0;
  let running = 0;
  const byAts = new Map<string, { total: number; applied: number; failed: number }>();
  const perSeeker = new Map<
    string,
    { total: number; applied: number; needsAttention: number }
  >();

  for (const r of runs) {
    const status = String(r.status ?? "").toUpperCase();
    const ats = r.ats_type || "UNKNOWN";
    if (!byAts.has(ats)) byAts.set(ats, { total: 0, applied: 0, failed: 0 });
    const a = byAts.get(ats)!;
    a.total += 1;

    const sid = r.job_seeker_id || "—";
    if (!perSeeker.has(sid)) perSeeker.set(sid, { total: 0, applied: 0, needsAttention: 0 });
    const p = perSeeker.get(sid)!;
    p.total += 1;

    if (APPLIED.has(status)) {
      applied += 1;
      a.applied += 1;
      p.applied += 1;
    } else if (status === "FAILED") {
      failed += 1;
      a.failed += 1;
    } else if (status === "NEEDS_ATTENTION") {
      needsAttention += 1;
      p.needsAttention += 1;
    } else if (status === "RUNNING") {
      running += 1;
    }
  }

  const total = runs.length;
  const successRate = pct(applied, total);

  const atsRows = Array.from(byAts.entries())
    .map(([ats, v]) => ({ ats, ...v, rate: pct(v.applied, v.total) }))
    .sort((x, y) => y.total - x.total);

  const seekerRows = Array.from(perSeeker.entries())
    .map(([sid, v]) => ({
      sid,
      name: seekerNames.get(sid) || "—",
      ...v,
      rate: pct(v.applied, v.total),
    }))
    .sort((x, y) => y.needsAttention - x.needsAttention || y.total - x.total)
    .slice(0, 12);

  const stats = [
    { label: "Runs (30d)", value: total, tone: "text-gray-900" },
    { label: "Applied", value: applied, tone: "text-green-600" },
    { label: "Success rate", value: `${successRate}%`, tone: "text-violet-600" },
    { label: "Need you", value: needsAttention, tone: needsAttention > 0 ? "text-orange-600" : "text-gray-900" },
    { label: "Failed", value: failed, tone: failed > 0 ? "text-red-600" : "text-gray-900" },
    { label: "Running", value: running, tone: "text-violet-600" },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Apply Health</h1>
          <p className="mt-1 text-sm text-gray-500">
            Application success and blockers across your seekers — last {PERIOD_DAYS} days.
          </p>
        </div>
        <Link
          href="/dashboard/attention"
          className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-700 hover:bg-orange-100"
        >
          Resolve blockers →
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className={`text-2xl font-bold ${s.tone}`}>{s.value}</div>
            <div className="mt-1 text-xs font-medium text-gray-500">{s.label}</div>
          </div>
        ))}
      </div>

      {total === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          No application runs in the last {PERIOD_DAYS} days for your seekers.
        </div>
      )}

      {/* Needs you */}
      {attention.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">
            Needs you ({attention.length})
          </h2>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Seeker</th>
                  <th className="px-4 py-2 font-medium">Job</th>
                  <th className="px-4 py-2 font-medium">ATS</th>
                  <th className="px-4 py-2 font-medium">Blocker</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {attention.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-900">
                      {r.job_seeker_id ? seekerNames.get(r.job_seeker_id) ?? "—" : "—"}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {r.job_posts?.title ?? "—"}
                      {r.job_posts?.company ? (
                        <span className="text-gray-400"> · {r.job_posts.company}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2">
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {r.ats_type ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="rounded bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
                        {humanizeReason(r)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* By ATS */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-700">By ATS</h2>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">ATS</th>
                  <th className="px-4 py-2 font-medium">Runs</th>
                  <th className="px-4 py-2 font-medium">Applied</th>
                  <th className="px-4 py-2 font-medium">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {atsRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-center text-gray-400">
                      No data
                    </td>
                  </tr>
                ) : (
                  atsRows.map((r) => (
                    <tr key={r.ats} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-900">{r.ats}</td>
                      <td className="px-4 py-2 text-gray-600">{r.total}</td>
                      <td className="px-4 py-2 text-gray-600">{r.applied}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`font-semibold ${
                            r.rate >= 60 ? "text-green-600" : r.rate >= 30 ? "text-orange-600" : "text-red-600"
                          }`}
                        >
                          {r.rate}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Per seeker */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-700">By seeker</h2>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Seeker</th>
                  <th className="px-4 py-2 font-medium">Applied</th>
                  <th className="px-4 py-2 font-medium">Need you</th>
                  <th className="px-4 py-2 font-medium">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {seekerRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-center text-gray-400">
                      No data
                    </td>
                  </tr>
                ) : (
                  seekerRows.map((r) => (
                    <tr key={r.sid} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <Link
                          href={`/dashboard/seekers/${r.sid}`}
                          className="font-medium text-violet-700 hover:underline"
                        >
                          {r.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-gray-600">
                        {r.applied}/{r.total}
                      </td>
                      <td className="px-4 py-2">
                        {r.needsAttention > 0 ? (
                          <span className="font-semibold text-orange-600">{r.needsAttention}</span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-600">{r.rate}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
