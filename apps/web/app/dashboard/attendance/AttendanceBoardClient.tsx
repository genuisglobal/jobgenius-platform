"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  WAT_LABEL,
  STATUS_LABELS,
  LONG_SHIFT_HOURS,
  breakMs,
  deriveStatus,
  formatDuration,
  isLongOpenShift,
  isStale,
  watDate,
  watDateLabel,
  watTime,
  workedMs,
  type AttendanceDay,
  type AttendanceStatus,
} from "@/lib/attendance";

type BoardRow = AttendanceDay & {
  am_name: string;
  adjusted_by_name?: string | null;
};

type BoardPayload = {
  work_date: string;
  my_account_manager_id: string;
  /** People managers may correct a sign-out time somebody never set. */
  can_adjust: boolean;
  rows: BoardRow[];
};

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  off: "bg-gray-100 text-gray-600",
  working: "bg-green-50 text-green-700 border border-green-200",
  on_break: "bg-amber-50 text-amber-700 border border-amber-200",
  done: "bg-gray-100 text-gray-600 border border-gray-200",
};

/** Shift a YYYY-MM-DD by whole days without touching the local timezone. */
function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}

export default function AttendanceBoardClient({
  initialDate,
}: {
  initialDate: string;
}) {
  const [date, setDate] = useState(initialDate);
  const [data, setData] = useState<BoardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  // Sign-out correction (people managers only).
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [adjustTime, setAdjustTime] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const today = useMemo(() => watDate(), []);

  const load = useCallback(async (target: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/am/attendance/day?date=${encodeURIComponent(target)}`,
        { cache: "no-store" }
      );
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Failed to load attendance.");
        return;
      }
      setData(payload as BoardPayload);
    } catch {
      setError("Network error loading attendance.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  // Keeps running shifts counting up, and refreshes the board periodically
  // so a colleague signing in appears without a manual reload.
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (date !== today) return; // Past days never change.
    const id = setInterval(() => load(date), 60000);
    return () => clearInterval(id);
  }, [date, today, load]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("date", date);
    window.history.replaceState(null, "", url.toString());
  }, [date]);

  function startAdjusting(row: BoardRow) {
    setAdjusting(row.id);
    setAdjustError(null);
    setAdjustNote("");
    // Seeded with the sign-in time rather than "now": the whole point is
    // that nobody knows when they left, so an obviously-wrong default is
    // safer than a plausible one somebody accepts without thinking.
    setAdjustTime(watTime(row.signed_in_at));
  }

  async function submitAdjustment(row: BoardRow) {
    if (!/^\d{2}:\d{2}$/.test(adjustTime)) {
      setAdjustError("Enter a time as HH:MM.");
      return;
    }
    setSaving(true);
    setAdjustError(null);
    try {
      const res = await fetch(`/api/am/attendance/day/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // WAT is UTC+1 with no daylight saving, so the offset is a
          // constant and the server receives an unambiguous instant.
          signed_out_at: `${row.work_date}T${adjustTime}:00+01:00`,
          note: adjustNote,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setAdjustError(payload.error ?? "Failed to save the sign-out time.");
        return;
      }
      setAdjusting(null);
      await load(date);
    } catch {
      setAdjustError("Network error saving the sign-out time.");
    } finally {
      setSaving(false);
    }
  }

  const rows = data?.rows ?? [];
  const canAdjust = data?.can_adjust ?? false;
  const totalWorked = rows.reduce((sum, row) => sum + workedMs(row, now), 0);
  const present = rows.filter((row) => deriveStatus(row) !== "done").length;
  const openTooLong = rows.filter((row) => isLongOpenShift(row, now)).length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
          <p className="text-sm text-gray-500 mt-1">
            Sign in and out from the clock in the header. All times are{" "}
            {WAT_LABEL} and recorded by the server.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setDate((d) => shiftDate(d, -1))}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            ←
          </button>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
          <button
            onClick={() => setDate((d) => shiftDate(d, 1))}
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

      {openTooLong > 0 && (
        <div className="p-3 rounded-lg text-sm bg-amber-50 text-amber-900 border border-amber-200">
          <strong>{openTooLong}</strong> shift{openTooLong === 1 ? " has" : "s have"}{" "}
          been open more than {LONG_SHIFT_HOURS} hours. Nothing is closed
          automatically — a power cut is not a sign-out.{" "}
          {canAdjust
            ? "Set the time they actually left using Adjust."
            : "A people manager needs to set the real sign-out time."}
        </div>
      )}

      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold text-gray-900">{watDateLabel(date)}</h2>
          <p className="text-xs text-gray-500">
            {rows.length} signed in
            {date === today && present > 0 && ` · ${present} still on the clock`}
            {rows.length > 0 && ` · ${formatDuration(totalWorked)} logged`}
          </p>
        </div>

        {loading && !data ? (
          <p className="text-sm text-gray-500 px-5 py-12 text-center">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-gray-700 font-medium">Nobody signed in on this day.</p>
            <p className="text-sm text-gray-500 mt-1">
              Use the Sign In button in the header when you arrive.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold min-w-[180px]">
                    Account Manager
                  </th>
                  <th className="px-3 py-2 text-left font-semibold w-28">Status</th>
                  <th className="px-3 py-2 text-right font-semibold w-24">Signed In</th>
                  <th className="px-3 py-2 text-right font-semibold w-24">Signed Out</th>
                  <th className="px-3 py-2 text-right font-semibold w-24">Breaks</th>
                  <th className="px-4 py-2 text-right font-semibold w-24">Worked</th>
                  {canAdjust && (
                    <th className="px-4 py-2 text-right font-semibold w-24">
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => {
                  const status = deriveStatus(row);
                  const isMe = row.account_manager_id === data?.my_account_manager_id;
                  const stale = isStale(row, now);
                  const longOpen = isLongOpenShift(row, now);
                  const editing = adjusting === row.id;
                  return (
                    <Fragment key={row.id}>
                    <tr className={isMe ? "bg-violet-50" : undefined}>
                      <td className="px-4 py-2 font-medium text-gray-900">
                        {row.am_name}
                        {isMe && (
                          <span className="ml-2 text-xs font-normal text-violet-600">
                            you
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}
                        >
                          {STATUS_LABELS[status]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                        {watTime(row.signed_in_at)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                        {row.signed_out_at ? (
                          <>
                            {watTime(row.signed_out_at)}
                            {row.adjusted_at && (
                              <span
                                className="ml-1 text-violet-600 cursor-help"
                                title={`Set by ${row.adjusted_by_name ?? "a people manager"}${
                                  row.adjustment_note ? ` — ${row.adjustment_note}` : ""
                                }`}
                              >
                                *
                              </span>
                            )}
                          </>
                        ) : longOpen || stale ? (
                          <span
                            className="text-amber-600"
                            title={`Open ${formatDuration(
                              now.getTime() - new Date(row.signed_in_at).getTime()
                            )} — never signed out`}
                          >
                            not signed out
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                        {row.breaks.length === 0
                          ? "—"
                          : `${row.breaks.length} · ${formatDuration(breakMs(row, now))}`}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold text-gray-900">
                        {stale ? "—" : formatDuration(workedMs(row, now))}
                      </td>
                      {canAdjust && (
                        <td className="px-4 py-2 text-right">
                          {!row.signed_out_at && (
                            <button
                              onClick={() =>
                                editing ? setAdjusting(null) : startAdjusting(row)
                              }
                              className="px-2 py-1 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              {editing ? "Cancel" : "Adjust"}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>

                    {editing && (
                      <tr>
                        <td colSpan={7} className="bg-amber-50 px-4 py-3">
                          <div className="flex flex-wrap items-end gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                What time did {row.am_name} actually leave? ({WAT_LABEL})
                              </label>
                              <input
                                type="time"
                                value={adjustTime}
                                onChange={(e) => setAdjustTime(e.target.value)}
                                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 tabular-nums"
                              />
                            </div>
                            <div className="flex-1 min-w-[220px]">
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Why (optional, kept on the record)
                              </label>
                              <input
                                type="text"
                                value={adjustNote}
                                onChange={(e) => setAdjustNote(e.target.value)}
                                placeholder="Power cut at 14:00, confirmed with them"
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                              />
                            </div>
                            <button
                              onClick={() => submitAdjustment(row)}
                              disabled={saving}
                              className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
                            >
                              {saving ? "Saving…" : "Save sign-out"}
                            </button>
                          </div>
                          <p className="text-xs text-gray-600 mt-2">
                            Signed in at {watTime(row.signed_in_at)}. This is
                            recorded against your name — it is the only way an
                            hours record changes without the clock observing it.
                          </p>
                          {adjustError && (
                            <p className="text-xs text-red-700 mt-1">{adjustError}</p>
                          )}
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
    </div>
  );
}
