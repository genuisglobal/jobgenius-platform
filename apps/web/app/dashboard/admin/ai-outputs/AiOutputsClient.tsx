"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface AiOutputRow {
  id: string;
  kind: string;
  ref_type: string | null;
  ref_id: string | null;
  payload: Record<string, unknown>;
  status: string;
  reviewer_id: string | null;
  decided_at: string | null;
  decision_notes: string | null;
  ai_call_log_id: string | null;
  seeker_id: string | null;
  am_id: string | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
}

const KIND_STYLES: Record<string, string> = {
  qa_card: "bg-violet-100 text-violet-700",
  quiz_card: "bg-indigo-100 text-indigo-700",
  lesson: "bg-purple-100 text-purple-700",
  outreach_draft: "bg-emerald-100 text-emerald-700",
  interview_followup: "bg-cyan-100 text-cyan-700",
  cover_letter: "bg-pink-100 text-pink-700",
  jobgenius_report: "bg-amber-100 text-amber-700",
  tailored_resume: "bg-yellow-100 text-yellow-700",
  other: "bg-gray-100 text-gray-700",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  auto_approved: "bg-gray-100 text-gray-600",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  published: "bg-emerald-100 text-emerald-700",
  expired: "bg-gray-100 text-gray-500",
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function summarizePayload(payload: Record<string, unknown>): string {
  if (!payload || typeof payload !== "object") return "—";
  if (typeof payload.subject === "string") return payload.subject;
  if (typeof payload.title === "string") return payload.title;
  if (Array.isArray(payload.cards) && payload.cards.length) {
    const first = payload.cards[0] as Record<string, unknown> | undefined;
    if (first && typeof first.question === "string") return first.question;
  }
  if (Array.isArray(payload.questions) && payload.questions.length) {
    const first = payload.questions[0] as Record<string, unknown> | undefined;
    if (first && typeof first.question === "string") return first.question;
  }
  if (typeof payload.text === "string") return payload.text.slice(0, 120);
  return "—";
}

export default function AiOutputsClient({
  initialRows,
  statusFilter,
  kindFilter,
}: {
  initialRows: AiOutputRow[];
  statusFilter: string;
  kindFilter: string | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  async function decide(row: AiOutputRow, action: "approve" | "reject") {
    setBusyId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ai-outputs/${row.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesById[row.id] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Failed to ${action}.`);
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center text-sm text-gray-400">
        No {statusFilter}
        {kindFilter ? ` ${kindFilter}` : ""} outputs.
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {rows.map((row) => {
          const isOpen = openId === row.id;
          const isBusy = busyId === row.id;
          const isPending = row.status === "pending";
          return (
            <div key={row.id} className="bg-white rounded-xl border border-gray-200">
              <div className="p-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                        KIND_STYLES[row.kind] ?? KIND_STYLES.other
                      }`}
                    >
                      {row.kind}
                    </span>
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        STATUS_STYLES[row.status] ?? STATUS_STYLES.other
                      }`}
                    >
                      {row.status}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {fmtDateTime(row.created_at)}
                    </span>
                    {row.expires_at && row.status === "pending" && (
                      <span className="text-[11px] text-amber-600">
                        expires {fmtDateTime(row.expires_at)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {summarizePayload(row.payload)}
                  </p>
                  {row.ref_type && row.ref_id && (
                    <p className="text-[11px] text-gray-400 mt-0.5 font-mono">
                      {row.ref_type}/{row.ref_id}
                    </p>
                  )}
                  {row.decision_notes && (
                    <p className="text-[11px] text-gray-500 mt-1 italic">
                      “{row.decision_notes}”
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button
                    onClick={() => setOpenId(isOpen ? null : row.id)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    {isOpen ? "Hide" : "View"}
                  </button>
                  {isPending && (
                    <>
                      <button
                        onClick={() => decide(row, "approve")}
                        disabled={isBusy}
                        className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => decide(row, "reject")}
                        disabled={isBusy}
                        className="px-3 py-1.5 border border-red-300 text-red-700 text-xs font-medium rounded-lg hover:bg-red-50 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-3">
                  {isPending && (
                    <textarea
                      value={notesById[row.id] ?? ""}
                      onChange={(e) =>
                        setNotesById((p) => ({ ...p, [row.id]: e.target.value }))
                      }
                      placeholder="Optional decision notes…"
                      className="w-full text-xs border border-gray-300 rounded-lg p-2"
                      rows={2}
                    />
                  )}
                  <pre className="text-[10px] bg-white border border-gray-200 rounded-lg p-2 overflow-x-auto">
                    {JSON.stringify(row.payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
