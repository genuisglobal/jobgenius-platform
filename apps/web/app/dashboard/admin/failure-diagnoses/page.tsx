import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import DiagnosesClient, { type FailureDiagnosisRow } from "./DiagnosesClient";

interface PageProps {
  searchParams: {
    status?: string;
    cause?: string;
  };
}

const STATUSES = ["pending", "reviewed", "applied", "rejected", "expired"];
const CAUSES = [
  "captcha",
  "required_field_missing",
  "overlay",
  "selector_changed",
  "auth_expired",
  "popup_handoff_needed",
  "rate_limit",
  "layout_drift",
  "unknown",
];

export default async function AdminFailureDiagnosesPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am" || !isAdminRole(user.role)) redirect("/dashboard");

  const statusFilter = STATUSES.includes(searchParams.status ?? "")
    ? searchParams.status!
    : "pending";
  const causeFilter: string | null = CAUSES.includes(searchParams.cause ?? "")
    ? searchParams.cause ?? null
    : null;

  let query = supabaseAdmin
    .from("failure_diagnoses")
    .select(
      "id, run_id, screenshot_path, root_cause, proposed_action, proposed_rule, confidence, reasoning, model, status, reviewer_id, decided_at, applied_rule_id, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  query = query.eq("status", statusFilter);
  if (causeFilter) query = query.eq("root_cause", causeFilter);

  const { data: rowsRaw } = await query;
  const rows = (rowsRaw ?? []) as FailureDiagnosisRow[];

  // Fetch the related runs in one go for context.
  const runIds = Array.from(new Set(rows.map((r) => r.run_id)));
  const { data: runs } = runIds.length
    ? await supabaseAdmin
        .from("application_runs")
        .select("id, ats_type, last_error_code, last_seen_url, job_post_id, job_seeker_id")
        .in("id", runIds)
    : { data: [] as Array<{
        id: string;
        ats_type: string | null;
        last_error_code: string | null;
        last_seen_url: string | null;
        job_post_id: string | null;
        job_seeker_id: string | null;
      }> };
  const runById = new Map((runs ?? []).map((r) => [r.id as string, r]));

  // Status counts for the filter bar
  const since30d = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: countsRaw } = await supabaseAdmin
    .from("failure_diagnoses")
    .select("status")
    .gte("created_at", since30d);
  const counts: Record<string, number> = {};
  for (const r of countsRaw ?? []) {
    const s = (r.status as string) || "unknown";
    counts[s] = (counts[s] ?? 0) + 1;
  }

  const enriched = rows.map((row) => ({
    ...row,
    run: runById.get(row.run_id) ?? null,
  }));

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Failure Diagnoses</h1>
      <p className="text-sm text-gray-500 mb-6">
        Vision-LLM diagnoses of recent application failures. The proposed
        action and (when present) proposed rule give you a one-click path to
        fix the underlying ATS issue.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {STATUSES.map((s) => {
          const url = new URLSearchParams({
            status: s,
            ...(causeFilter ? { cause: causeFilter } : {}),
          });
          return (
            <a
              key={s}
              href={`/dashboard/admin/failure-diagnoses?${url.toString()}`}
              className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                statusFilter === s
                  ? "bg-violet-600 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {s}
              {counts[s] !== undefined && (
                <span className="ml-1.5 opacity-70">{counts[s]}</span>
              )}
            </a>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <a
          href={`/dashboard/admin/failure-diagnoses?status=${statusFilter}`}
          className={`px-3 py-1 rounded-full text-[11px] font-medium ${
            !causeFilter
              ? "bg-gray-900 text-white"
              : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
          }`}
        >
          All causes
        </a>
        {CAUSES.map((c) => {
          const url = new URLSearchParams({ status: statusFilter, cause: c });
          return (
            <a
              key={c}
              href={`/dashboard/admin/failure-diagnoses?${url.toString()}`}
              className={`px-3 py-1 rounded-full text-[11px] font-medium ${
                causeFilter === c
                  ? "bg-gray-900 text-white"
                  : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              {c}
            </a>
          );
        })}
      </div>

      <DiagnosesClient initialRows={enriched} statusFilter={statusFilter} />
    </div>
  );
}
