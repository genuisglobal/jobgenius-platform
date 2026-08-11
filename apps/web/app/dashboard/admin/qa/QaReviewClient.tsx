"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Screenshot = {
  screenshot_path: string;
  reason: string;
  step: string;
  created_at: string;
};

type QueueItem = {
  id: string;
  run_id: string;
  sampled_reason: string;
  sampled_at: string;
  run: {
    ats_type: string | null;
    resume_source: string | null;
    channel: string;
    completed_at: string;
  } | null;
  job: { title: string | null; company: string | null } | null;
  seeker: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
    address_city: string | null;
    address_state: string | null;
  } | null;
  screenshots: Screenshot[];
};

type Metrics = {
  pending_count: number;
  reviewed_30d: number;
  pass_rate_30d: number | null;
  avg_accuracy_30d: number | null;
  sensitive_errors_30d: number;
  sensitive_errors_7d: number;
  screenshot_presence_30d: number | null;
  completed_runs_30d: number;
};

type Draft = {
  verdict: "PASS" | "MINOR_ISSUES" | "MAJOR_ISSUES";
  accuracy: string;
  sensitive: boolean;
  notes: string;
};

const EMPTY_DRAFT: Draft = { verdict: "PASS", accuracy: "100", sensitive: false, notes: "" };

const REASON_LABELS: Record<string, string> = {
  NEW_SEEKER_FIRST_RUNS: "New seeker (first 3)",
  RANDOM_SAMPLE: "Random sample",
  MANUAL: "Manual",
};

export default function QaReviewClient() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/qa");
      const data = await res.json();
      if (res.ok) {
        setQueue(data.queue ?? []);
        setMetrics(data.metrics ?? null);
      } else {
        setMsg({ type: "error", text: data.error || "Failed to load QA queue." });
      }
    } catch {
      setMsg({ type: "error", text: "Network error loading QA queue." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const draftFor = (id: string): Draft => drafts[id] ?? EMPTY_DRAFT;
  const setDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...draftFor(id), ...patch } }));

  async function submitReview(item: QueueItem) {
    const draft = draftFor(item.id);
    setBusy(item.id);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/qa/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review_id: item.id,
          verdict: draft.verdict,
          field_accuracy_score: Number(draft.accuracy),
          sensitive_answer_error: draft.sensitive,
          notes: draft.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Failed to save review." });
      } else {
        setMsg({
          type: "success",
          text: draft.sensitive
            ? "Review saved — HIGH alert raised for the sensitive-answer error."
            : "Review saved.",
        });
        setQueue((prev) => prev.filter((q) => q.id !== item.id));
      }
    } catch {
      setMsg({ type: "error", text: "Network error saving review." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">QA Review</h1>
          <p className="text-sm text-gray-500">
            Sampled auto-submitted applications — grade fields against the seeker&apos;s
            profile using the run&apos;s screenshots.
          </p>
        </div>
        <button
          onClick={load}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatCard label="Pending" value={String(metrics.pending_count)} />
          <StatCard
            label="Pass rate (30d)"
            value={metrics.pass_rate_30d === null ? "—" : `${metrics.pass_rate_30d}%`}
          />
          <StatCard
            label="Avg field accuracy"
            value={metrics.avg_accuracy_30d === null ? "—" : `${metrics.avg_accuracy_30d}%`}
          />
          <StatCard
            label="Sensitive errors (30d)"
            value={String(metrics.sensitive_errors_30d)}
            danger={metrics.sensitive_errors_30d > 0}
          />
          <StatCard
            label="Proof coverage (30d)"
            value={
              metrics.screenshot_presence_30d === null
                ? "—"
                : `${metrics.screenshot_presence_30d}%`
            }
            hint={`${metrics.completed_runs_30d} completed runs`}
          />
        </div>
      )}

      {metrics && metrics.sensitive_errors_7d > 0 && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          <strong>{metrics.sensitive_errors_7d} sensitive-answer error(s) this week.</strong>{" "}
          Work authorization / sponsorship / salary answers must never be wrong — check the
          seeker&apos;s screening answers and the learned rules for the affected hosts.
        </div>
      )}

      {msg && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm ${
            msg.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {msg.text}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm py-12 text-center">Loading…</p>
      ) : queue.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-gray-700 font-medium">Queue clear 🎉</p>
          <p className="text-sm text-gray-500 mt-1">
            New samples land nightly (first 3 runs per seeker + 5% of the rest).
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {queue.map((item) => {
            const draft = draftFor(item.id);
            return (
              <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {item.job?.title ?? "Unknown role"}{" "}
                      <span className="text-gray-500 font-normal">
                        @ {item.job?.company ?? "Unknown company"}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {item.run?.ats_type ?? "?"} · {item.run?.channel} · resume:{" "}
                      {item.run?.resume_source ?? "?"} ·{" "}
                      {item.run?.completed_at
                        ? new Date(item.run.completed_at).toLocaleString()
                        : ""}
                    </p>
                  </div>
                  <span className="px-2 py-1 text-xs rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                    {REASON_LABELS[item.sampled_reason] ?? item.sampled_reason}
                  </span>
                </div>

                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div className="text-sm">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                      Expected (profile)
                    </p>
                    <table className="w-full text-sm">
                      <tbody>
                        {[
                          ["Name", item.seeker?.full_name],
                          ["Email", item.seeker?.email],
                          ["Phone", item.seeker?.phone],
                          [
                            "Location",
                            item.seeker?.location ||
                              [item.seeker?.address_city, item.seeker?.address_state]
                                .filter(Boolean)
                                .join(", "),
                          ],
                        ].map(([label, value]) => (
                          <tr key={label as string} className="border-b border-gray-100">
                            <td className="py-1 pr-3 text-gray-500 w-24">{label}</td>
                            <td className="py-1 text-gray-900">{(value as string) || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {item.seeker?.id && (
                      <Link
                        href={`/dashboard/seekers/${item.seeker.id}`}
                        className="inline-block mt-2 text-xs text-violet-600 hover:underline"
                      >
                        Open seeker detail (full run timeline) →
                      </Link>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                      Actual (run evidence)
                    </p>
                    {item.screenshots.length === 0 ? (
                      <p className="text-sm text-gray-400 italic">
                        No screenshots for this run — grade from the run timeline, and note
                        the missing proof.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {item.screenshots.slice(0, 4).map((shot) => (
                          <a
                            key={shot.screenshot_path}
                            href={`/api/apply/screenshot/view?path=${encodeURIComponent(shot.screenshot_path)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="block"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/apply/screenshot/view?path=${encodeURIComponent(shot.screenshot_path)}`}
                              alt={`${shot.reason} at ${shot.step}`}
                              loading="lazy"
                              className="w-full rounded border border-gray-200 hover:border-violet-300"
                            />
                            <span className="block text-[10px] text-gray-400 mt-0.5 truncate">
                              {shot.reason} · {shot.step}
                            </span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4 flex flex-wrap items-end gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Verdict
                    </label>
                    <div className="flex gap-1">
                      {(
                        [
                          ["PASS", "Pass", "bg-green-600"],
                          ["MINOR_ISSUES", "Minor", "bg-amber-500"],
                          ["MAJOR_ISSUES", "Major", "bg-red-600"],
                        ] as const
                      ).map(([value, label, activeBg]) => (
                        <button
                          key={value}
                          onClick={() => setDraft(item.id, { verdict: value })}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                            draft.verdict === value
                              ? `${activeBg} text-white border-transparent`
                              : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Field accuracy %
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draft.accuracy}
                      onChange={(e) => setDraft(item.id, { accuracy: e.target.value })}
                      className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm text-red-700 pb-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.sensitive}
                      onChange={(e) => setDraft(item.id, { sensitive: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    Sensitive answer wrong (raises HIGH alert)
                  </label>

                  <input
                    type="text"
                    placeholder="Notes (what was wrong, which field…)"
                    value={draft.notes}
                    onChange={(e) => setDraft(item.id, { notes: e.target.value })}
                    className="flex-1 min-w-[200px] px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                  />

                  <button
                    onClick={() => submitReview(item)}
                    disabled={busy === item.id}
                    className="px-4 py-1.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
                  >
                    {busy === item.id ? "Saving…" : "Save review"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  danger,
}: {
  label: string;
  value: string;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        danger ? "bg-red-50 border-red-200" : "bg-white border-gray-200"
      }`}
    >
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${danger ? "text-red-700" : "text-gray-900"}`}>
        {value}
      </p>
      {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
    </div>
  );
}
