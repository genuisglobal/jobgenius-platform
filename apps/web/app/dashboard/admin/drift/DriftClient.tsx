"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface DriftIncidentRow {
  id: string;
  ats_type: string;
  url_host: string | null;
  kind: string;
  status: string;
  signal: Record<string, unknown>;
  summary: string | null;
  related_run_ids: string[] | null;
  opened_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
}

const KIND_STYLES: Record<string, string> = {
  canary_failing: "bg-amber-100 text-amber-700",
  failure_rate_spike: "bg-red-100 text-red-700",
  selector_change_cluster: "bg-indigo-100 text-indigo-700",
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-red-100 text-red-700",
  acknowledged: "bg-amber-100 text-amber-700",
  resolved: "bg-green-100 text-green-700",
  auto_closed: "bg-gray-100 text-gray-500",
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function DriftClient({
  initialRows,
  statusFilter,
}: {
  initialRows: DriftIncidentRow[];
  statusFilter: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function setStatus(row: DriftIncidentRow, status: string) {
    setBusyId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/drift/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          notes: status === "resolved" ? notes[row.id] : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to update.");
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
        No {statusFilter} drift incidents.
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
          const isBusy = busyId === row.id;
          return (
            <div key={row.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-semibold text-gray-900">{row.ats_type}</span>
                  {row.url_host && (
                    <span className="text-xs text-gray-600">on {row.url_host}</span>
                  )}
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                      KIND_STYLES[row.kind] ?? "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {row.kind.replace(/_/g, " ")}
                  </span>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      STATUS_STYLES[row.status] ?? STATUS_STYLES.open
                    }`}
                  >
                    {row.status}
                  </span>
                </div>
                <span className="text-xs text-gray-400">opened {fmtDateTime(row.opened_at)}</span>
              </div>

              {row.summary && (
                <p className="text-sm text-gray-700 mb-2">{row.summary}</p>
              )}

              <details className="text-xs text-gray-500 mb-3">
                <summary className="cursor-pointer">signal</summary>
                <pre className="mt-1 bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto text-[10px]">
                  {JSON.stringify(row.signal, null, 2)}
                </pre>
              </details>

              {row.related_run_ids && row.related_run_ids.length > 0 && (
                <p className="text-[11px] text-gray-500 mb-2">
                  related runs:{" "}
                  {row.related_run_ids.slice(0, 5).map((id, i) => (
                    <span key={id}>
                      <Link
                        href={`/dashboard/attention?run=${id}`}
                        className="text-violet-600 hover:text-violet-700"
                      >
                        {id.slice(0, 8)}
                      </Link>
                      {i < Math.min(row.related_run_ids!.length, 5) - 1 ? ", " : ""}
                    </span>
                  ))}
                  {row.related_run_ids.length > 5 && ` +${row.related_run_ids.length - 5} more`}
                </p>
              )}

              {row.status === "open" && (
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => setStatus(row, "acknowledged")}
                    disabled={isBusy}
                    className="px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50"
                  >
                    Acknowledge
                  </button>
                  <Link
                    href="/dashboard/admin/host-rules"
                    className="text-xs text-violet-600 hover:text-violet-700"
                  >
                    Open Host Rules →
                  </Link>
                </div>
              )}

              {row.status === "acknowledged" && (
                <div className="space-y-2 mt-3">
                  <textarea
                    value={notes[row.id] ?? ""}
                    onChange={(e) =>
                      setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))
                    }
                    placeholder="What did you change? (host rule edits, etc.)"
                    className="w-full text-xs border border-gray-300 rounded-lg p-2"
                    rows={2}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setStatus(row, "resolved")}
                      disabled={isBusy}
                      className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      Resolve
                    </button>
                    <button
                      onClick={() => setStatus(row, "auto_closed")}
                      disabled={isBusy}
                      className="px-3 py-1.5 border border-gray-300 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      Close (no action)
                    </button>
                  </div>
                </div>
              )}

              {row.resolution_notes && (
                <p className="text-[11px] text-gray-500 mt-2 italic">“{row.resolution_notes}”</p>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
