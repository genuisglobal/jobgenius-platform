"use client";

import { useCallback, useEffect, useState } from "react";

type WeeklyStats = {
  week_start: string;
  applications_submitted: number;
  companies: Array<{ company: string; title: string }>;
  in_progress: number;
  needs_attention: number;
  interviews_scheduled: number;
  recruiter_replies: number;
};

type Report = {
  id: string;
  job_seeker_id: string;
  week_start: string;
  stats: WeeklyStats;
  am_note: string | null;
  status: "DRAFT" | "SENT" | "SKIPPED";
  generated_at: string;
  sent_at: string | null;
  seeker: { id: string; full_name: string | null; email: string | null } | null;
};

export default function ClientReportsClient() {
  const [reports, setReports] = useState<Report[]>([]);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (week?: string) => {
    setLoading(true);
    setMsg(null);
    try {
      const url = week
        ? `/api/am/client-reports?week=${encodeURIComponent(week)}`
        : "/api/am/client-reports";
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) {
        setReports(data.reports ?? []);
        setWeekStart(data.week_start ?? null);
      } else {
        setMsg({ type: "error", text: data.error || "Failed to load reports." });
      }
    } catch {
      setMsg({ type: "error", text: "Network error loading reports." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function shiftWeek(days: number) {
    if (!weekStart) return;
    const next = new Date(`${weekStart}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + days);
    load(next.toISOString().slice(0, 10));
  }

  async function send(report: Report) {
    setBusy(report.id);
    setMsg(null);
    try {
      const res = await fetch("/api/am/client-reports/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id: report.id,
          am_note: notes[report.id] ?? "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Failed to send report." });
      } else {
        setMsg({
          type: "success",
          text: `Report sent to ${report.seeker?.full_name ?? "the seeker"}'s portal inbox.`,
        });
        setReports((prev) =>
          prev.map((r) =>
            r.id === report.id
              ? { ...r, status: "SENT", sent_at: new Date().toISOString() }
              : r
          )
        );
      }
    } catch {
      setMsg({ type: "error", text: "Network error sending report." });
    } finally {
      setBusy(null);
    }
  }

  const drafts = reports.filter((r) => r.status === "DRAFT");
  const sent = reports.filter((r) => r.status === "SENT");

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Weekly Client Reports</h1>
          <p className="text-sm text-gray-500">
            Drafted every Friday from the week&apos;s activity — add a personal note and
            send to the seeker&apos;s portal inbox.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => shiftWeek(-7)}
            className="px-2 py-1 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            ← Prev
          </button>
          <span className="font-medium text-gray-700">
            Week of {weekStart ?? "…"}
          </span>
          <button
            onClick={() => shiftWeek(7)}
            className="px-2 py-1 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Next →
          </button>
        </div>
      </div>

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
      ) : reports.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-gray-700 font-medium">No reports for this week yet.</p>
          <p className="text-sm text-gray-500 mt-1">
            Drafts are generated Friday afternoons for your active clients.
          </p>
        </div>
      ) : (
        <>
          {drafts.length > 0 && (
            <div className="space-y-4 mb-8">
              <h2 className="text-sm font-semibold text-gray-500 uppercase">
                Ready to send ({drafts.length})
              </h2>
              {drafts.map((report) => (
                <div
                  key={report.id}
                  className="bg-white border border-gray-200 rounded-xl p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                    <p className="font-semibold text-gray-900">
                      {report.seeker?.full_name ?? "Unknown seeker"}
                      <span className="ml-2 text-xs font-normal text-gray-400">
                        {report.seeker?.email}
                      </span>
                    </p>
                    <StatChips stats={report.stats} />
                  </div>

                  {report.stats.companies.length > 0 && (
                    <ul className="mb-3 text-sm text-gray-600 space-y-0.5">
                      {report.stats.companies.slice(0, 5).map((c, i) => (
                        <li key={i}>
                          – {c.title} <span className="text-gray-400">@</span> {c.company}
                        </li>
                      ))}
                      {report.stats.companies.length > 5 && (
                        <li className="text-gray-400">
                          …and {report.stats.companies.length - 5} more
                        </li>
                      )}
                    </ul>
                  )}

                  <div className="flex flex-wrap items-end gap-3">
                    <textarea
                      placeholder="Personal note for this client (recommended — 1–2 sentences)…"
                      value={notes[report.id] ?? ""}
                      onChange={(e) =>
                        setNotes((prev) => ({ ...prev, [report.id]: e.target.value }))
                      }
                      rows={2}
                      className="flex-1 min-w-[240px] px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    />
                    <button
                      onClick={() => send(report)}
                      disabled={busy === report.id}
                      className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
                    >
                      {busy === report.id ? "Sending…" : "Send to portal"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {sent.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-500 uppercase">
                Sent ({sent.length})
              </h2>
              {sent.map((report) => (
                <div
                  key={report.id}
                  className="flex flex-wrap items-center justify-between gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5"
                >
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">
                      {report.seeker?.full_name ?? "Unknown seeker"}
                    </span>
                    <span className="ml-2 text-xs text-gray-400">
                      sent{" "}
                      {report.sent_at ? new Date(report.sent_at).toLocaleString() : ""}
                    </span>
                  </p>
                  <StatChips stats={report.stats} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatChips({ stats }: { stats: WeeklyStats }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
        {stats.applications_submitted} applied
      </span>
      {stats.interviews_scheduled > 0 && (
        <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
          {stats.interviews_scheduled} interview{stats.interviews_scheduled > 1 ? "s" : ""}
        </span>
      )}
      {stats.recruiter_replies > 0 && (
        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
          {stats.recruiter_replies} repl{stats.recruiter_replies > 1 ? "ies" : "y"}
        </span>
      )}
      {stats.needs_attention > 0 && (
        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
          {stats.needs_attention} need you
        </span>
      )}
    </div>
  );
}
