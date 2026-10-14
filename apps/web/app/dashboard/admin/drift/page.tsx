import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import DriftClient, { type DriftIncidentRow } from "./DriftClient";

interface PageProps {
  searchParams: { status?: string };
}

const STATUSES = ["open", "acknowledged", "resolved", "auto_closed"];

export default async function DriftPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am" || !isAdminRole(user.role)) redirect("/dashboard");

  const statusFilter = STATUSES.includes(searchParams.status ?? "")
    ? searchParams.status!
    : "open";

  const { data } = await supabaseAdmin
    .from("drift_incidents")
    .select("*")
    .eq("status", statusFilter)
    .order("opened_at", { ascending: false })
    .limit(100);

  const rows = (data ?? []) as DriftIncidentRow[];

  const since30d = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: countsRaw } = await supabaseAdmin
    .from("drift_incidents")
    .select("status")
    .gte("opened_at", since30d);
  const counts: Record<string, number> = {};
  for (const r of countsRaw ?? []) {
    const s = (r.status as string) || "unknown";
    counts[s] = (counts[s] ?? 0) + 1;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Drift Command Center</h1>
      <p className="text-sm text-gray-500 mb-6">
        Incidents auto-opened by the drift detector: canary failures, host
        failure-rate spikes, and selector-change clusters from the diagnoses
        loop. Acknowledge to claim, resolve when you&apos;ve patched the host
        rule.
      </p>

      <div className="flex flex-wrap gap-2 mb-6">
        {STATUSES.map((s) => (
          <a
            key={s}
            href={`/dashboard/admin/drift?status=${s}`}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${
              statusFilter === s
                ? "bg-violet-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {s}
            {counts[s] !== undefined && <span className="ml-1.5 opacity-70">{counts[s]}</span>}
          </a>
        ))}
      </div>

      <DriftClient initialRows={rows} statusFilter={statusFilter} />
    </div>
  );
}
