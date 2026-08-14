"use client";

import { useCallback, useEffect, useState } from "react";
import {
  WAT_LABEL,
  deriveStatus,
  formatDuration,
  watTime,
  workedMs,
  type AttendanceAction,
  type AttendanceDay,
  type AttendanceStatus,
} from "@/lib/attendance";

/**
 * The sign in / break / sign out control in the dashboard header.
 *
 * Lives in the header on every page precisely so nobody has to remember to
 * navigate somewhere to sign out. The clock shown is WAT, derived from the
 * browser instant but formatted in Africa/Lagos — and every recorded time
 * comes from the server, never from here.
 */
export default function AttendanceClock() {
  const [day, setDay] = useState<AttendanceDay | null>(null);
  const [status, setStatus] = useState<AttendanceStatus>("off");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/am/attendance", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setDay(data.day ?? null);
      setStatus(data.status ?? "off");
    } catch {
      // Transient — the widget simply keeps its last known state.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Ticks the wall clock and the running worked-time counter.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Someone signed in on another tab or device — stay in step, and pick up
  // the WAT day rollover for anyone who leaves the dashboard open overnight.
  useEffect(() => {
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  async function perform(action: AttendanceAction) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/am/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        // The server knows the real state; adopt it rather than guessing.
        if (data.status) setStatus(data.status);
        await load();
        return;
      }
      setDay(data.day ?? null);
      setStatus(data.status ?? deriveStatus(data.day ?? null));
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  const clock = watTime(now);
  const worked = day ? formatDuration(workedMs(day, now)) : null;

  return (
    <div className="flex items-center gap-2">
      <div className="hidden sm:flex flex-col items-end leading-tight">
        <span className="text-sm font-semibold text-gray-900 tabular-nums">
          {clock}{" "}
          <span className="text-[10px] font-normal text-gray-400">{WAT_LABEL}</span>
        </span>
        {day && (
          <span className="text-[11px] text-gray-500 tabular-nums">
            {status === "on_break" ? (
              <span className="text-amber-600 font-medium">On break</span>
            ) : status === "done" ? (
              <>out {watTime(day.signed_out_at)} · {worked}</>
            ) : (
              <>in {watTime(day.signed_in_at)} · {worked}</>
            )}
          </span>
        )}
      </div>

      {loading ? (
        <span className="text-xs text-gray-400 px-2">…</span>
      ) : status === "off" ? (
        <button
          onClick={() => perform("sign_in")}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {busy ? "…" : "Sign In"}
        </button>
      ) : status === "done" ? (
        <span className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-500 text-sm font-medium">
          Signed out
        </span>
      ) : (
        <>
          <button
            onClick={() => perform(status === "on_break" ? "break_end" : "break_start")}
            disabled={busy}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 ${
              status === "on_break"
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : "border border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {status === "on_break" ? "End Break" : "Break"}
          </button>
          <button
            onClick={() => perform("sign_out")}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            Sign Out
          </button>
        </>
      )}

      {error && (
        <span className="hidden md:inline text-xs text-red-600 max-w-[160px] truncate" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}
