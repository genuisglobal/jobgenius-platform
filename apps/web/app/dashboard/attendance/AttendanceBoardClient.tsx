"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  WAT_LABEL,
  STATUS_LABELS,
  breakMs,
  deriveStatus,
  formatDuration,
  isStale,
  watDate,
  watDateLabel,
  watTime,
  workedMs,
  type AttendanceDay,
  type AttendanceStatus,
} from "@/lib/attendance";

type BoardRow = AttendanceDay & { am_name: string };

type BoardPayload = {
  work_date: string;
  my_account_manager_id: string;
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

  const rows = data?.rows ?? [];
  const totalWorked = rows.reduce((sum, row) => sum + workedMs(row, now), 0);
  const present = rows.filter((row) => deriveStatus(row) !== "done").length;

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
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => {
                  const status = deriveStatus(row);
                  const isMe = row.account_manager_id === data?.my_account_manager_id;
                  const stale = isStale(row, now);
                  return (
                    <tr key={row.id} className={isMe ? "bg-violet-50" : undefined}>
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
                          watTime(row.signed_out_at)
                        ) : stale ? (
                          <span
                            className="text-amber-600"
                            title="Left open overnight — never signed out"
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
                    </tr>
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
