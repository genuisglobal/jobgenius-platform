"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ACTIVITY_METRICS,
  ACTIVITY_METRIC_LABELS,
  INTERVIEW_METRICS,
  MAX_METRIC_VALUE,
  coerceCount,
  emptyCounts,
  interviewTotal,
  normalizeSheetDate,
  rowTotal,
  shiftSheetDate,
  sumCounts,
  type ActivityCounts,
  type ActivityMetric,
  type LeaderboardEntry,
  type SheetRange,
  type SheetRow,
} from "@/lib/activity-sheet";

type SheetPayload = {
  date: string;
  range: SheetRange;
  range_start: string;
  range_end: string;
  can_edit_any: boolean;
  my_account_manager_id: string;
  rows: SheetRow[];
  day_totals: ActivityCounts;
  leaderboard: LeaderboardEntry[];
};

/** Compact column headers — the full labels live in the caption. */
const METRIC_HEADERS: Record<ActivityMetric, string> = {
  easy_applications: "Easy Apply",
  company_applications: "Company",
  follow_ups: "Follow Ups",
  phone_interviews: "Phone",
  ai_interviews: "AI",
  video_interviews: "Video",
  offers: "Offers",
};

/**
 * Two-row header groups. At seven metrics a flat header stops reading as a
 * spreadsheet, and "Phone / AI / Video" only means anything sitting under
 * an Interviews banner.
 */
const METRIC_GROUPS: Array<{ label: string; metrics: readonly ActivityMetric[] }> = [
  { label: "Applications", metrics: ["easy_applications", "company_applications"] },
  { label: "", metrics: ["follow_ups"] },
  { label: "Interviews", metrics: INTERVIEW_METRICS },
  { label: "", metrics: ["offers"] },
];

const RANGE_LABELS: Record<SheetRange, string> = {
  day: "Today",
  week: "This week",
  month: "This month",
};

const MEDALS = ["🥇", "🥈", "🥉"];

/**
 * The leaderboard collapses the three interview types into one figure.
 * Nine numeric columns is a spreadsheet, not a scoreboard — the type
 * breakdown lives on the sheet below, where you go to read detail.
 */
const LEADERBOARD_COLUMNS: Array<{
  key: string;
  label: string;
  value: (entry: LeaderboardEntry) => number;
}> = [
  { key: "easy_applications", label: "Easy Apply", value: (e) => e.counts.easy_applications },
  { key: "company_applications", label: "Company", value: (e) => e.counts.company_applications },
  { key: "follow_ups", label: "Follow Ups", value: (e) => e.counts.follow_ups },
  { key: "interviews", label: "Interviews", value: (e) => e.interviews },
  { key: "offers", label: "Offers", value: (e) => e.counts.offers },
];

export default function ActivitySheetClient({
  initialDate,
  initialRange,
}: {
  initialDate: string;
  initialRange: SheetRange;
}) {
  const [date, setDate] = useState(initialDate);
  const [range, setRange] = useState<SheetRange>(initialRange);
  const [data, setData] = useState<SheetPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Local edits keyed by job_seeker_id — one row per client per day.
  const [drafts, setDrafts] = useState<Record<string, ActivityCounts & { note: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [savedAt, setSavedAt] = useState<Record<string, number>>({});

  const today = useMemo(() => normalizeSheetDate(), []);

  const load = useCallback(async (nextDate: string, nextRange: SheetRange) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/am/activity-sheet?date=${encodeURIComponent(nextDate)}&range=${nextRange}`
      );
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error || "Failed to load the sheet.");
        return;
      }
      setData(payload as SheetPayload);
      setDrafts({});
    } catch {
      setError("Network error loading the sheet.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(date, range);
  }, [date, range, load]);

  // Keep the URL shareable without re-rendering the server component.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("date", date);
    url.searchParams.set("range", range);
    window.history.replaceState(null, "", url.toString());
  }, [date, range]);

  /** The value shown in a cell: the local draft if the AM has touched it, else the saved row. */
  const cellValue = useCallback(
    (row: SheetRow, metric: ActivityMetric): number =>
      drafts[row.job_seeker_id]?.[metric] ?? row[metric],
    [drafts]
  );

  const noteValue = useCallback(
    (row: SheetRow): string => drafts[row.job_seeker_id]?.note ?? row.note ?? "",
    [drafts]
  );

  /**
   * A row's currently-displayed counts, drafts included. Every total on the
   * page derives from this, so nothing enumerates the metrics by hand.
   */
  const liveCounts = useCallback(
    (row: SheetRow): ActivityCounts => {
      const counts = emptyCounts();
      for (const metric of ACTIVITY_METRICS) counts[metric] = cellValue(row, metric);
      return counts;
    },
    [cellValue]
  );

  function editRow(row: SheetRow, patch: Partial<ActivityCounts & { note: string }>) {
    setDrafts((prev) => {
      const current =
        prev[row.job_seeker_id] ??
        ({
          ...ACTIVITY_METRICS.reduce(
            (acc, metric) => ({ ...acc, [metric]: row[metric] }),
            emptyCounts()
          ),
          note: row.note ?? "",
        } as ActivityCounts & { note: string });
      return { ...prev, [row.job_seeker_id]: { ...current, ...patch } };
    });
  }

  const save = useCallback(
    async (row: SheetRow) => {
      const draft = drafts[row.job_seeker_id];
      if (!draft) return; // Nothing touched — don't write an empty row on blur.

      setSaving((prev) => ({ ...prev, [row.job_seeker_id]: true }));
      setError(null);
      try {
        const res = await fetch("/api/am/activity-sheet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date,
            job_seeker_id: row.job_seeker_id,
            note: draft.note,
            ...ACTIVITY_METRICS.reduce(
              (acc, metric) => ({ ...acc, [metric]: draft[metric] }),
              {} as ActivityCounts
            ),
          }),
        });
        const payload = await res.json();
        if (!res.ok) {
          setError(payload.error || "Failed to save the row.");
          return;
        }
        // Fold the saved values back into the row so totals and the
        // leaderboard recompute off one source.
        setData((prev) =>
          prev
            ? {
                ...prev,
                rows: prev.rows.map((r) =>
                  r.job_seeker_id === row.job_seeker_id
                    ? { ...r, ...payload.entry, seeker_name: r.seeker_name, am_name: r.am_name }
                    : r
                ),
              }
            : prev
        );
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[row.job_seeker_id];
          return next;
        });
        setSavedAt((prev) => ({ ...prev, [row.job_seeker_id]: Date.now() }));
      } catch {
        setError("Network error saving the row.");
      } finally {
        setSaving((prev) => ({ ...prev, [row.job_seeker_id]: false }));
      }
    },
    [date, drafts]
  );

  // Group the day grid by account manager, the way the old sheet's colour
  // blocks did — each AM's clients under their name.
  const groups = useMemo(() => {
    const byAm = new Map<string, { amName: string; rows: SheetRow[] }>();
    for (const row of data?.rows ?? []) {
      let group = byAm.get(row.account_manager_id);
      if (!group) {
        group = { amName: row.am_name, rows: [] };
        byAm.set(row.account_manager_id, group);
      }
      group.rows.push(row);
    }
    // The viewer's own block first — it is the one they have to fill in.
    return Array.from(byAm.entries()).sort(([a], [b]) => {
      if (a === data?.my_account_manager_id) return -1;
      if (b === data?.my_account_manager_id) return 1;
      return (byAm.get(a)?.amName ?? "").localeCompare(byAm.get(b)?.amName ?? "");
    });
  }, [data]);

  const liveDayTotals = useMemo(
    () => sumCounts((data?.rows ?? []).map(liveCounts)),
    [data, liveCounts]
  );

  const canEdit = (row: SheetRow) =>
    Boolean(data && (data.can_edit_any || row.account_manager_id === data.my_account_manager_id));

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Activity Sheet</h1>
          <p className="text-sm text-gray-500 mt-1">
            One row per client per day. Type what you did — everyone sees the
            whole sheet.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setDate((d) => shiftSheetDate(d, -1))}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            ←
          </button>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(normalizeSheetDate(e.target.value))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
          <button
            onClick={() => setDate((d) => shiftSheetDate(d, 1))}
            disabled={date >= today}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            →
          </button>
          <button
            onClick={() => setDate(today)}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${
              date === today
                ? "bg-violet-600 text-white"
                : "border border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            Today
          </button>
        </div>
      </header>

      {error && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200">
          {error}
        </div>
      )}

      {/* ── Leaderboard ────────────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-gray-200">
          <div>
            <h2 className="font-semibold text-gray-900">Leaderboard</h2>
            <p className="text-xs text-gray-500">
              Ranked by offers, then interviews — volume only breaks ties.
              {data && ` ${data.range_start} → ${data.range_end}`}
            </p>
          </div>
          <div className="flex gap-1">
            {(["day", "week", "month"] as SheetRange[]).map((option) => (
              <button
                key={option}
                onClick={() => setRange(option)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                  range === option
                    ? "bg-violet-600 text-white"
                    : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {RANGE_LABELS[option]}
              </button>
            ))}
          </div>
        </div>

        {loading && !data ? (
          <p className="text-sm text-gray-500 px-5 py-8 text-center">Loading…</p>
        ) : (data?.leaderboard.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-500 px-5 py-8 text-center">
            Nothing logged in this period yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold w-12">#</th>
                  <th className="px-4 py-2 text-left font-semibold">Account Manager</th>
                  {LEADERBOARD_COLUMNS.map((column) => (
                    <th key={column.key} className="px-3 py-2 text-right font-semibold">
                      {column.label}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-semibold">Clients</th>
                  <th className="px-4 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data?.leaderboard.map((entry, index) => {
                  const isMe = entry.account_manager_id === data.my_account_manager_id;
                  return (
                    <tr
                      key={entry.account_manager_id}
                      className={isMe ? "bg-violet-50" : undefined}
                    >
                      <td className="px-4 py-2 text-gray-500">
                        {MEDALS[index] ?? index + 1}
                      </td>
                      <td className="px-4 py-2 font-medium text-gray-900">
                        {entry.am_name}
                        {isMe && (
                          <span className="ml-2 text-xs font-normal text-violet-600">you</span>
                        )}
                      </td>
                      {LEADERBOARD_COLUMNS.map((column) => {
                        const value = column.value(entry);
                        return (
                          <td
                            key={column.key}
                            className={`px-3 py-2 text-right tabular-nums ${
                              column.key === "offers" && value > 0
                                ? "font-semibold text-green-700"
                                : "text-gray-700"
                            }`}
                          >
                            {value}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                        {entry.clients}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold text-gray-900">
                        {entry.total}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── The sheet ──────────────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">
            {new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </h2>
          <p className="text-xs text-gray-500">
            {ACTIVITY_METRICS.map((m) => ACTIVITY_METRIC_LABELS[m]).join(" · ")} — your
            rows save when you leave a cell.
          </p>
        </div>

        {loading && !data ? (
          <p className="text-sm text-gray-500 px-5 py-12 text-center">Loading…</p>
        ) : groups.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-gray-700 font-medium">Nothing on the sheet for this day.</p>
            <p className="text-sm text-gray-500 mt-1">
              Clients assigned to you appear here automatically.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th
                    rowSpan={2}
                    className="px-4 py-2 text-left font-semibold min-w-[180px] align-bottom"
                  >
                    Client
                  </th>
                  {METRIC_GROUPS.map((group, index) => (
                    <th
                      key={group.label || `group-${index}`}
                      colSpan={group.metrics.length}
                      className={`px-3 pt-2 text-center font-semibold ${
                        group.label ? "border-l border-gray-200" : ""
                      }`}
                    >
                      {group.label}
                    </th>
                  ))}
                  <th rowSpan={2} className="px-3 py-2 text-right font-semibold w-16 align-bottom">
                    Total
                  </th>
                  <th
                    rowSpan={2}
                    className="px-4 py-2 text-left font-semibold min-w-[200px] align-bottom"
                  >
                    Note
                  </th>
                </tr>
                <tr>
                  {METRIC_GROUPS.flatMap((group) =>
                    group.metrics.map((metric, index) => (
                      <th
                        key={metric}
                        className={`px-3 pb-2 text-right font-semibold w-24 ${
                          group.label && index === 0 ? "border-l border-gray-200" : ""
                        }`}
                      >
                        {METRIC_HEADERS[metric]}
                      </th>
                    ))
                  )}
                </tr>
              </thead>

              {groups.map(([amId, group]) => {
                const groupTotals = sumCounts(group.rows.map(liveCounts));
                const isMine = amId === data?.my_account_manager_id;

                return (
                  <tbody key={amId} className="divide-y divide-gray-100">
                    <tr className={isMine ? "bg-violet-100" : "bg-gray-100"}>
                      <td
                        colSpan={ACTIVITY_METRICS.length + 3}
                        className="px-4 py-2 font-semibold text-gray-800"
                      >
                        {group.amName}
                        {isMine && (
                          <span className="ml-2 text-xs font-normal text-violet-700">you</span>
                        )}
                        <span className="ml-2 text-xs font-normal text-gray-500">
                          {rowTotal(groupTotals)} activities · {interviewTotal(groupTotals)}{" "}
                          interview{interviewTotal(groupTotals) === 1 ? "" : "s"} ·{" "}
                          {group.rows.length} client{group.rows.length === 1 ? "" : "s"}
                        </span>
                      </td>
                    </tr>

                    {group.rows.map((row) => {
                      const editable = canEdit(row);
                      const dirty = Boolean(drafts[row.job_seeker_id]);
                      const total = rowTotal(liveCounts(row));

                      return (
                        <tr key={row.job_seeker_id} className="hover:bg-gray-50">
                          <td className="px-4 py-1.5 text-gray-900">
                            {row.seeker_name}
                            {saving[row.job_seeker_id] ? (
                              <span className="ml-2 text-xs text-gray-400">saving…</span>
                            ) : dirty ? (
                              <span className="ml-2 text-xs text-amber-600">unsaved</span>
                            ) : savedAt[row.job_seeker_id] ? (
                              <span className="ml-2 text-xs text-green-600">saved</span>
                            ) : null}
                          </td>

                          {ACTIVITY_METRICS.map((metric) => (
                            <td key={metric} className="px-1 py-1">
                              {editable ? (
                                <input
                                  type="number"
                                  min={0}
                                  max={MAX_METRIC_VALUE}
                                  value={cellValue(row, metric)}
                                  onChange={(e) =>
                                    editRow(row, { [metric]: coerceCount(e.target.value) })
                                  }
                                  onFocus={(e) => e.target.select()}
                                  onBlur={() => save(row)}
                                  className="w-full px-2 py-1 text-right tabular-nums rounded border border-transparent hover:border-gray-300 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                                />
                              ) : (
                                <span className="block px-2 py-1 text-right tabular-nums text-gray-600">
                                  {row[metric]}
                                </span>
                              )}
                            </td>
                          ))}

                          <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-gray-900">
                            {total}
                          </td>

                          <td className="px-2 py-1">
                            {editable ? (
                              <input
                                type="text"
                                value={noteValue(row)}
                                placeholder="—"
                                maxLength={280}
                                onChange={(e) => editRow(row, { note: e.target.value })}
                                onBlur={() => save(row)}
                                className="w-full px-2 py-1 rounded border border-transparent hover:border-gray-300 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                              />
                            ) : (
                              <span className="block px-2 py-1 text-gray-500">
                                {row.note || "—"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}

              <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                <tr>
                  <td className="px-4 py-2 font-semibold text-gray-900">Team total</td>
                  {ACTIVITY_METRICS.map((metric) => (
                    <td
                      key={metric}
                      className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900"
                    >
                      {liveDayTotals[metric]}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-gray-900">
                    {rowTotal(liveDayTotals)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
