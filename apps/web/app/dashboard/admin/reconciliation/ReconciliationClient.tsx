"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { getRangeBounds, normalizeSheetDate } from "@/lib/activity-sheet";
import { watDate, watDateLabel } from "@/lib/attendance";
import {
  LOW_COVERAGE,
  MIN_TYPED_TO_FLAG,
  formatCoverage,
  formatGap,
  type AmReconciliation,
  type ReconciledMetric,
  type ReconciliationTotals,
} from "@/lib/activity-reconciliation";

type Payload = {
  start: string;
  end: string;
  days: number;
  managers: AmReconciliation[];
  totals: ReconciliationTotals;
};

function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

const PRESETS = [
  {
    label: "This week",
    bounds: () => getRangeBounds(normalizeSheetDate(watDate()), "week"),
  },
  {
    label: "This month",
    bounds: () => getRangeBounds(normalizeSheetDate(watDate()), "month"),
  },
  {
    label: "Last 30 days",
    bounds: () => {
      const today = watDate();
      return { start: shiftDate(today, -29), end: today };
    },
  },
];

/** Coverage cell: the number, plus a bar that makes a low one obvious. */
function Coverage({ metric }: { metric: ReconciledMetric }) {
  const value = metric.coverage;
  const low = value !== null && value < LOW_COVERAGE && metric.typed >= MIN_TYPED_TO_FLAG;
  const width = value === null ? 0 : Math.min(100, Math.round(value * 100));

  return (
    <div className="flex items-center justify-end gap-2">
      <span
        className={`tabular-nums ${low ? "text-amber-700 font-semibold" : "text-gray-700"}`}
      >
        {formatCoverage(value)}
      </span>
      <span className="hidden lg:block w-12 h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <span
          className={`block h-full rounded-full ${low ? "bg-amber-500" : "bg-gray-400"}`}
          style={{ width: `${width}%` }}
        />
      </span>
    </div>
  );
}

function MetricCells({ metric }: { metric: ReconciledMetric }) {
  return (
    <>
      <td className="px-3 py-2 text-right tabular-nums text-gray-900 font-medium">
        {metric.typed}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-gray-500">
        {metric.recorded}
      </td>
      <td className="px-3 py-2 text-right">
        <Coverage metric={metric} />
      </td>
    </>
  );
}

export default function ReconciliationClient({
  initialStart,
  initialEnd,
}: {
  initialStart: string;
  initialEnd: string;
}) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/am/reconciliation?start=${encodeURIComponent(from)}&end=${encodeURIComponent(to)}`,
        { cache: "no-store" }
      );
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Failed to load reconciliation.");
        return;
      }
      setData(payload as Payload);
    } catch {
      setError("Network error loading reconciliation.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(start, end);
  }, [start, end, load]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("start", start);
    url.searchParams.set("end", end);
    window.history.replaceState(null, "", url.toString());
  }, [start, end]);

  const managers = data?.managers ?? [];
  const totals = data?.totals;

  const activePreset = PRESETS.find((preset) => {
    const bounds = preset.bounds();
    return bounds.start === start && bounds.end === end;
  })?.label;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sheet Reconciliation</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-3xl">
            How much of each account manager&apos;s typed Activity Sheet the
            platform can corroborate from its own records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => {
                const bounds = preset.bounds();
                setStart(bounds.start);
                setEnd(bounds.end);
              }}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${
                activePreset === preset.label
                  ? "bg-violet-600 text-white"
                  : "border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {preset.label}
            </button>
          ))}
          <input
            type="date"
            value={start}
            max={end}
            onChange={(e) => e.target.value && setStart(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
          <span className="text-gray-400 text-sm">→</span>
          <input
            type="date"
            value={end}
            min={start}
            onChange={(e) => e.target.value && setEnd(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
        </div>
      </header>

      <div className="p-4 rounded-xl text-sm bg-blue-50 text-blue-900 border border-blue-200">
        <p className="font-semibold">A gap here is a question, not a finding.</p>
        <p className="mt-1">
          The Activity Sheet exists because real work happens off-platform — a
          company portal the runner cannot drive, a phone call, a referral
          chased in person. None of that leaves a row in our tables, so low
          coverage is normal and expected. What is worth asking about is a
          large claim the platform can barely see at all, repeated over weeks.
        </p>
        <p className="mt-2 text-blue-800">
          AI interviews and outreach messages are excluded entirely — the
          platform has no comparable record, so counting them would invent a
          permanent gap that means nothing.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200">
          {error}
        </div>
      )}

      {totals && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Applications", metric: totals.applications },
            { label: "Phone/video interviews", metric: totals.interviews },
            { label: "Follow-ups", metric: totals.follow_ups },
          ].map(({ label, metric }) => (
            <div
              key={label}
              className="bg-white border border-gray-200 rounded-xl px-4 py-3"
            >
              <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">
                {formatCoverage(metric.coverage)}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {metric.recorded} recorded of {metric.typed} logged
              </p>
            </div>
          ))}
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Worth a conversation
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">
              {totals.flagged}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              of {totals.managers} account manager
              {totals.managers === 1 ? "" : "s"}
            </p>
          </div>
        </section>
      )}

      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Logged vs recorded</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Least corroborated first. Click a row for the daily breakdown.
          </p>
        </div>

        {loading && !data ? (
          <p className="text-sm text-gray-500 px-5 py-12 text-center">Loading…</p>
        ) : managers.length === 0 ? (
          <p className="text-sm text-gray-500 px-5 py-12 text-center">
            Nothing logged on the sheet in this range.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold min-w-[170px]" rowSpan={2}>
                    Account Manager
                  </th>
                  <th className="px-3 py-1 text-center font-semibold border-l border-gray-200" colSpan={3}>
                    Applications
                  </th>
                  <th className="px-3 py-1 text-center font-semibold border-l border-gray-200" colSpan={3}>
                    Interviews
                  </th>
                  <th className="px-3 py-1 text-center font-semibold border-l border-gray-200" colSpan={3}>
                    Follow-ups
                  </th>
                </tr>
                <tr>
                  {["Applications", "Interviews", "Follow-ups"].map((group) => (
                    <Fragment key={group}>
                      <th className="px-3 py-1 text-right font-medium border-l border-gray-200">
                        Logged
                      </th>
                      <th className="px-3 py-1 text-right font-medium">Recorded</th>
                      <th className="px-3 py-1 text-right font-medium">Seen</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {managers.map((manager) => {
                  const open = expanded === manager.account_manager_id;
                  return (
                    <Fragment key={manager.account_manager_id}>
                      <tr
                        onClick={() =>
                          setExpanded(open ? null : manager.account_manager_id)
                        }
                        className="cursor-pointer hover:bg-gray-50"
                      >
                        <td className="px-4 py-2 font-medium text-gray-900">
                          <span className="text-gray-400 mr-1.5 inline-block w-3">
                            {open ? "▾" : "▸"}
                          </span>
                          {manager.am_name}
                          {manager.flags.length > 0 && (
                            <span
                              className="ml-2 inline-block px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-medium"
                              title={manager.flags.map((f) => f.message).join("\n")}
                            >
                              {manager.flags.length} to ask about
                            </span>
                          )}
                        </td>
                        <MetricCells metric={manager.applications} />
                        <MetricCells metric={manager.interviews} />
                        <MetricCells metric={manager.follow_ups} />
                      </tr>

                      {open && (
                        <tr>
                          <td colSpan={10} className="bg-gray-50 px-4 py-3">
                            {manager.flags.length > 0 && (
                              <ul className="mb-3 space-y-1">
                                {manager.flags.map((flag) => (
                                  <li
                                    key={flag.metric}
                                    className="text-xs text-amber-800"
                                  >
                                    • {flag.message}
                                  </li>
                                ))}
                              </ul>
                            )}
                            <table className="w-full text-xs">
                              <thead className="text-gray-500 uppercase">
                                <tr>
                                  <th className="py-1 text-left font-semibold min-w-[200px]">
                                    Day
                                  </th>
                                  <th className="py-1 text-right font-semibold">
                                    Apps logged
                                  </th>
                                  <th className="py-1 text-right font-semibold">
                                    Apps recorded
                                  </th>
                                  <th className="py-1 text-right font-semibold">Gap</th>
                                  <th className="py-1 text-right font-semibold">
                                    Interviews
                                  </th>
                                  <th className="py-1 text-right font-semibold">
                                    Follow-ups
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {manager.days.map((day) => (
                                  <tr key={day.work_date}>
                                    <td className="py-1.5 text-gray-700">
                                      {watDateLabel(day.work_date)}
                                    </td>
                                    <td className="py-1.5 text-right tabular-nums text-gray-900">
                                      {day.applications.typed}
                                    </td>
                                    <td className="py-1.5 text-right tabular-nums text-gray-500">
                                      {day.applications.recorded}
                                    </td>
                                    <td
                                      className={`py-1.5 text-right tabular-nums ${
                                        day.applications.gap > 0
                                          ? "text-amber-700"
                                          : "text-gray-500"
                                      }`}
                                    >
                                      {formatGap(day.applications.gap)}
                                    </td>
                                    <td className="py-1.5 text-right tabular-nums text-gray-700">
                                      {day.interviews.typed} / {day.interviews.recorded}
                                    </td>
                                    <td className="py-1.5 text-right tabular-nums text-gray-700">
                                      {day.follow_ups.typed} / {day.follow_ups.recorded}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-gray-500">
        &quot;Seen&quot; is the share of logged work the platform has its own
        record of. A row is marked worth asking about only when at least{" "}
        {MIN_TYPED_TO_FLAG} of something was logged and under{" "}
        {Math.round(LOW_COVERAGE * 100)}% of it can be corroborated — small
        numbers are noise, and flagging them would teach everyone to ignore
        this page. Applications are matched to whoever logged that client that
        day; a run for a client nobody logged is skipped rather than credited
        to an arbitrary account manager.
      </p>
    </div>
  );
}
