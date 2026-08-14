"use client";

import { useState } from "react";
import Link from "next/link";

export interface FailureDiagnosisRow {
  id: string;
  run_id: string;
  screenshot_path: string | null;
  root_cause: string;
  proposed_action: string;
  proposed_rule: Record<string, unknown> | null;
  confidence: number | string | null;
  reasoning: string | null;
  model: string | null;
  status: string;
  reviewer_id: string | null;
  decided_at: string | null;
  applied_rule_id: string | null;
  created_at: string;
}

export interface DiagnosisWithRun extends FailureDiagnosisRow {
  run: {
    id: string;
    ats_type: string | null;
    last_error_code: string | null;
    last_seen_url: string | null;
    job_post_id: string | null;
    job_seeker_id: string | null;
  } | null;
}

const CAUSE_STYLES: Record<string, string> = {
  captcha: "bg-amber-100 text-amber-700",
  required_field_missing: "bg-violet-100 text-violet-700",
  overlay: "bg-purple-100 text-purple-700",
  selector_changed: "bg-red-100 text-red-700",
  auth_expired: "bg-orange-100 text-orange-700",
  popup_handoff_needed: "bg-indigo-100 text-indigo-700",
  rate_limit: "bg-pink-100 text-pink-700",
  layout_drift: "bg-rose-100 text-rose-700",
  unknown: "bg-gray-100 text-gray-700",
};

const ACTION_STYLES: Record<string, string> = {
  retry_same: "bg-gray-100 text-gray-700",
  rotate_session: "bg-amber-100 text-amber-700",
  skip_optional: "bg-violet-100 text-violet-700",
  simplified_fields: "bg-violet-100 text-violet-700",
  alt_resume: "bg-cyan-100 text-cyan-700",
  add_host_rule: "bg-emerald-100 text-emerald-700",
  human_review: "bg-purple-100 text-purple-700",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  reviewed: "bg-violet-100 text-violet-700",
  applied: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-gray-100 text-gray-500",
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function fmtConfidence(c: number | string | null): string {
  const n = Number(c);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

export default function DiagnosesClient({
  initialRows,
  statusFilter,
}: {
  initialRows: DiagnosisWithRun[];
  statusFilter: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [openId, setOpenId] = useState<string | null>(null);
  const [screenshotUrls, setScreenshotUrls] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadScreenshot(row: DiagnosisWithRun) {
    if (screenshotUrls[row.id]) return;
    const res = await fetch(`/api/admin/failure-diagnoses/${row.id}/screenshot`).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { signedUrl?: string };
    if (data.signedUrl) {
      setScreenshotUrls((prev) => ({ ...prev, [row.id]: data.signedUrl! }));
    }
  }

  function toggle(row: DiagnosisWithRun) {
    if (openId === row.id) {
      setOpenId(null);
    } else {
      setOpenId(row.id);
      void loadScreenshot(row);
    }
  }

  async function decide(row: DiagnosisWithRun, status: "reviewed" | "rejected") {
    setBusyId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/failure-diagnoses/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to update.");
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch {
      setError("Network error.");
    } finally {
      setBusyId(null);
    }
  }

  async function applyRule(row: DiagnosisWithRun) {
    setBusyId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/failure-diagnoses/${row.id}/apply`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        error?: string;
        hostRuleId?: string;
        created?: boolean;
      };
      if (!res.ok) {
        setError(data.error || "Failed to apply rule.");
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      if (data.hostRuleId) {
        setError(
          data.created
            ? "Rule staged as pending_review on Host Rules — go approve to activate."
            : "Linked to an existing pending_review rule on Host Rules."
        );
      }
    } catch {
      setError("Network error.");
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center text-sm text-gray-400">
        No {statusFilter} diagnoses.
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
                        CAUSE_STYLES[row.root_cause] ?? CAUSE_STYLES.unknown
                      }`}
                    >
                      {row.root_cause}
                    </span>
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        ACTION_STYLES[row.proposed_action] ?? ACTION_STYLES.human_review
                      }`}
                    >
                      → {row.proposed_action}
                    </span>
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        STATUS_STYLES[row.status] ?? STATUS_STYLES.pending
                      }`}
                    >
                      {row.status}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {fmtDateTime(row.created_at)} · conf {fmtConfidence(row.confidence)}
                    </span>
                  </div>
                  {row.reasoning && (
                    <p className="text-sm text-gray-700 mt-1">{row.reasoning}</p>
                  )}
                  <div className="text-[11px] text-gray-400 mt-1 flex flex-wrap gap-x-3">
                    {row.run?.ats_type && <span>ATS: {row.run.ats_type}</span>}
                    {row.run?.last_error_code && <span>error: {row.run.last_error_code}</span>}
                    {row.run?.last_seen_url && (
                      <span className="truncate max-w-[280px]" title={row.run.last_seen_url}>
                        url: {row.run.last_seen_url}
                      </span>
                    )}
                    <span>
                      run:{" "}
                      <Link
                        href={`/dashboard/attention?run=${row.run_id}`}
                        className="text-violet-600 hover:text-violet-700"
                      >
                        {row.run_id.slice(0, 8)}
                      </Link>
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button
                    onClick={() => toggle(row)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    {isOpen ? "Hide" : "View"}
                  </button>
                  {isPending && (
                    <>
                      {row.proposed_rule && (
                        <button
                          onClick={() => applyRule(row)}
                          disabled={isBusy}
                          className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                          title="Stage as a pending_review host rule"
                        >
                          Apply rule
                        </button>
                      )}
                      <button
                        onClick={() => decide(row, "reviewed")}
                        disabled={isBusy}
                        className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        Mark reviewed
                      </button>
                      <button
                        onClick={() => decide(row, "rejected")}
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
                  {screenshotUrls[row.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={screenshotUrls[row.id]}
                      alt="failure screenshot"
                      className="max-w-full rounded-lg border border-gray-200"
                    />
                  ) : (
                    <div className="bg-white rounded-lg border border-gray-200 px-4 py-6 text-center text-xs text-gray-400">
                      Loading screenshot…
                    </div>
                  )}
                  {row.proposed_rule && (
                    <div>
                      <p className="text-xs font-medium text-gray-600 mb-1">
                        Proposed rule patch
                      </p>
                      <pre className="text-[10px] bg-white border border-gray-200 rounded p-2 overflow-x-auto">
                        {JSON.stringify(row.proposed_rule, null, 2)}
                      </pre>
                      <p className="mt-2 text-[11px] text-gray-500">
                        Apply by adding/editing the matching row at{" "}
                        <Link
                          href="/dashboard/admin/host-rules"
                          className="text-violet-600 hover:text-violet-700"
                        >
                          Host Rules
                        </Link>
                        . Auto-promotion lands in PR-Q.
                      </p>
                    </div>
                  )}
                  <p className="text-[10px] text-gray-400">
                    model: <code>{row.model ?? "—"}</code>
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
