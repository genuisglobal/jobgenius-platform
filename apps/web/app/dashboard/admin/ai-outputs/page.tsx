import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import AiOutputsClient, { type AiOutputRow } from "./AiOutputsClient";

interface PageProps {
  searchParams: {
    status?: string;
    kind?: string;
  };
}

const STATUSES = [
  "pending",
  "auto_approved",
  "approved",
  "rejected",
  "published",
  "expired",
];

const KINDS = [
  "qa_card",
  "quiz_card",
  "lesson",
  "outreach_draft",
  "interview_followup",
  "cover_letter",
  "jobgenius_report",
  "tailored_resume",
  "other",
];

export default async function AdminAiOutputsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am" || !isAdminRole(user.role)) redirect("/dashboard");

  const statusFilter = STATUSES.includes(searchParams.status ?? "")
    ? searchParams.status!
    : "pending";
  const kindFilter: string | null = KINDS.includes(searchParams.kind ?? "")
    ? searchParams.kind ?? null
    : null;

  let query = supabaseAdmin
    .from("ai_outputs")
    .select(
      "id, kind, ref_type, ref_id, payload, status, reviewer_id, decided_at, decision_notes, ai_call_log_id, seeker_id, am_id, expires_at, created_by, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  query = query.eq("status", statusFilter);
  if (kindFilter) query = query.eq("kind", kindFilter);

  const { data: rowsRaw } = await query;
  const rows = (rowsRaw ?? []) as AiOutputRow[];

  // Aggregate counts per status for the filter bar
  const since30d = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: countsRaw } = await supabaseAdmin
    .from("ai_outputs")
    .select("status")
    .gte("created_at", since30d);
  const counts: Record<string, number> = {};
  for (const r of countsRaw ?? []) {
    const s = (r.status as string) || "unknown";
    counts[s] = (counts[s] ?? 0) + 1;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">AI Outputs</h1>
      <p className="text-sm text-gray-500 mb-6">
        Every AI-generated artifact passes through this queue. Pending items
        need a human review before they ship. Auto-approved items are visible
        for audit and can still be rejected.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {STATUSES.map((s) => {
          const url = new URLSearchParams({
            status: s,
            ...(kindFilter ? { kind: kindFilter } : {}),
          });
          return (
            <a
              key={s}
              href={`/dashboard/admin/ai-outputs?${url.toString()}`}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
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
          href={`/dashboard/admin/ai-outputs?status=${statusFilter}`}
          className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
            !kindFilter
              ? "bg-gray-900 text-white"
              : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
          }`}
        >
          All kinds
        </a>
        {KINDS.map((k) => {
          const url = new URLSearchParams({ status: statusFilter, kind: k });
          return (
            <a
              key={k}
              href={`/dashboard/admin/ai-outputs?${url.toString()}`}
              className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
                kindFilter === k
                  ? "bg-gray-900 text-white"
                  : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              {k}
            </a>
          );
        })}
      </div>

      <AiOutputsClient
        initialRows={rows}
        statusFilter={statusFilter}
        kindFilter={kindFilter}
      />
    </div>
  );
}
