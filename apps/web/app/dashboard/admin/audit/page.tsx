import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";

interface PageProps {
  searchParams: {
    action?: string;
    actor?: string;
    target_type?: string;
    target_id?: string;
    limit?: string;
  };
}

interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  ip: string | null;
  created_at: string;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function parseLimit(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.min(Math.max(n, 1), 500);
}

export default async function AdminAuditPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am" || !isAdminRole(user.role)) redirect("/dashboard");

  const limit = parseLimit(searchParams.limit);

  let query = supabaseAdmin
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (searchParams.action) query = query.eq("action", searchParams.action);
  if (searchParams.actor) {
    const term = `%${searchParams.actor}%`;
    query = query.or(`actor_email.ilike.${term},actor_id.eq.${searchParams.actor}`);
  }
  if (searchParams.target_type) query = query.eq("target_type", searchParams.target_type);
  if (searchParams.target_id) query = query.eq("target_id", searchParams.target_id);

  const { data: rowsRaw } = await query;
  const rows = (rowsRaw ?? []) as AuditRow[];

  const { data: distinctActionsRaw } = await supabaseAdmin
    .from("audit_logs")
    .select("action")
    .order("created_at", { ascending: false })
    .limit(500);
  const distinctActions = Array.from(
    new Set((distinctActionsRaw ?? []).map((r) => r.action as string))
  ).sort();

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Audit log</h1>
      <p className="text-sm text-gray-500 mb-6">
        Persistent record of admin actions written by{" "}
        <code className="text-xs">lib/audit.ts</code>. Showing the last {rows.length}{" "}
        of {limit}.
      </p>

      <form className="bg-white rounded-xl border border-gray-200 p-4 mb-6 grid grid-cols-1 sm:grid-cols-5 gap-3 text-sm">
        <label className="block">
          <span className="block text-xs font-medium text-gray-600 mb-1">Action</span>
          <select
            name="action"
            defaultValue={searchParams.action ?? ""}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="">All</option>
            {distinctActions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-600 mb-1">Actor (email)</span>
          <input
            name="actor"
            defaultValue={searchParams.actor ?? ""}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-600 mb-1">Target type</span>
          <input
            name="target_type"
            defaultValue={searchParams.target_type ?? ""}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-600 mb-1">Target id</span>
          <input
            name="target_id"
            defaultValue={searchParams.target_id ?? ""}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          />
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700"
          >
            Filter
          </button>
          <a
            href="/dashboard/admin/audit"
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Reset
          </a>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400">
            No audit rows match the filters.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">When</th>
                <th className="px-3 py-2 text-left font-semibold">Actor</th>
                <th className="px-3 py-2 text-left font-semibold">Action</th>
                <th className="px-3 py-2 text-left font-semibold">Target</th>
                <th className="px-3 py-2 text-left font-semibold">Details</th>
                <th className="px-3 py-2 text-left font-semibold">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                    {fmtDateTime(row.created_at)}
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    {row.actor_email ?? row.actor_id ?? "—"}
                    {row.actor_role && (
                      <span className="block text-[10px] text-gray-400">{row.actor_role}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-violet-700">{row.action}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {row.target_type ?? "—"}
                    {row.target_id && (
                      <span className="block text-[10px] text-gray-400 break-all">{row.target_id}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {Object.keys(row.details ?? {}).length === 0 ? (
                      "—"
                    ) : (
                      <details>
                        <summary className="cursor-pointer text-gray-700">
                          {Object.keys(row.details).length} fields
                        </summary>
                        <pre className="text-[10px] mt-1 bg-gray-50 rounded p-2 overflow-x-auto">
                          {JSON.stringify(row.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                    {row.ip ?? "—"}
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
