"use client";

import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Slot = {
  id?: string;
  day_of_week: number; // 0 = Monday … 6 = Sunday
  start_time: string;  // "HH:MM"
  end_time: string;    // "HH:MM"
  timezone: string;
  is_active?: boolean;
};

type DayState = {
  available: boolean;
  windows: { start: string; end: string }[];
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slotsToState(slots: Slot[]): { days: DayState[]; timezone: string } {
  const days: DayState[] = DAYS.map(() => ({ available: false, windows: [] }));
  let timezone = "America/New_York";

  for (const slot of slots) {
    if (slot.is_active === false) continue;
    const d = slot.day_of_week;
    if (d < 0 || d > 6) continue;
    days[d].available = true;
    days[d].windows.push({ start: slot.start_time.slice(0, 5), end: slot.end_time.slice(0, 5) });
    timezone = slot.timezone;
  }

  // Default window for days that are available but have no windows
  for (const day of days) {
    if (day.available && day.windows.length === 0) {
      day.windows.push({ start: "09:00", end: "17:00" });
    }
  }

  return { days, timezone };
}

function stateToSlots(days: DayState[], timezone: string): Omit<Slot, "id" | "is_active">[] {
  const result: Omit<Slot, "id" | "is_active">[] = [];
  for (let i = 0; i < days.length; i++) {
    if (!days[i].available) continue;
    for (const w of days[i].windows) {
      result.push({ day_of_week: i, start_time: w.start, end_time: w.end, timezone });
    }
  }
  return result;
}

function formatWeekStart(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AvailabilityClient({
  initialSlots,
  weekStart,
  confirmedThisWeek,
  confirmedAt,
}: {
  initialSlots: Slot[];
  weekStart: string;
  confirmedThisWeek: boolean;
  confirmedAt: string | null;
}) {
  const initial = slotsToState(initialSlots);
  const hasExisting = initialSlots.length > 0;

  const [days, setDays] = useState<DayState[]>(initial.days);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(confirmedThisWeek);
  const [confirmedTime, setConfirmedTime] = useState(confirmedAt);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Day toggle ──────────────────────────────────────────────────────────────
  function toggleDay(i: number) {
    setDays((prev) => {
      const next = [...prev];
      const wasAvailable = next[i].available;
      next[i] = {
        available: !wasAvailable,
        windows: !wasAvailable && next[i].windows.length === 0
          ? [{ start: "09:00", end: "17:00" }]
          : next[i].windows,
      };
      return next;
    });
  }

  // ── Window editing ──────────────────────────────────────────────────────────
  function updateWindow(dayIdx: number, winIdx: number, field: "start" | "end", value: string) {
    setDays((prev) => {
      const next = [...prev];
      const windows = [...next[dayIdx].windows];
      windows[winIdx] = { ...windows[winIdx], [field]: value };
      next[dayIdx] = { ...next[dayIdx], windows };
      return next;
    });
  }

  function addWindow(dayIdx: number) {
    setDays((prev) => {
      const next = [...prev];
      next[dayIdx] = {
        ...next[dayIdx],
        windows: [...next[dayIdx].windows, { start: "13:00", end: "17:00" }],
      };
      return next;
    });
  }

  function removeWindow(dayIdx: number, winIdx: number) {
    setDays((prev) => {
      const next = [...prev];
      const windows = next[dayIdx].windows.filter((_, j) => j !== winIdx);
      next[dayIdx] = {
        available: windows.length > 0,
        windows,
      };
      return next;
    });
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    setError(null);
    setSaveSuccess(false);
    setSaving(true);
    try {
      const slots = stateToSlots(days, timezone);
      const res = await fetch("/api/portal/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone, slots }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to save");
      }
      setSaveSuccess(true);
      // Reset success state after 3s
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save availability");
    } finally {
      setSaving(false);
    }
  }

  // ── Confirm ────────────────────────────────────────────────────────────────
  async function handleConfirm() {
    setError(null);
    setConfirming(true);
    try {
      const res = await fetch("/api/portal/availability/confirm", { method: "POST" });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to confirm");
      }
      setConfirmed(true);
      setConfirmedTime(new Date().toISOString());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to confirm");
    } finally {
      setConfirming(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const isMonday = new Date().getUTCDay() === 1;
  const showReminderBanner = hasExisting && !confirmed && isMonday;
  const showFirstTimeBanner = !hasExisting;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Weekly Availability</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Set the times you&apos;re available for interviews each week. Your account manager uses
          this to schedule interviews automatically.
        </p>
      </div>

      {/* First-time setup banner */}
      {showFirstTimeBanner && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex gap-3">
          <svg className="w-5 h-5 text-violet-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-violet-800">Set up your availability</p>
            <p className="text-sm text-violet-700 mt-0.5">
              Once you save your availability, interviews can be scheduled automatically. You&apos;ll
              receive a reminder every Monday morning to confirm or adjust your schedule.
            </p>
          </div>
        </div>
      )}

      {/* Monday confirmation banner */}
      {showReminderBanner && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-amber-800">Confirm this week&apos;s availability</p>
              <p className="text-sm text-amber-700 mt-0.5">
                Week of {formatWeekStart(weekStart)}. Please confirm your availability is still
                accurate, or make any adjustments below.
              </p>
            </div>
          </div>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="flex-shrink-0 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {confirming ? "Confirming…" : "Confirm"}
          </button>
        </div>
      )}

      {/* Confirmed this week */}
      {confirmed && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex gap-3">
          <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-green-800">
            <span className="font-medium">Availability confirmed</span> for the week of{" "}
            {formatWeekStart(weekStart)}
            {confirmedTime && (
              <span className="text-green-600">
                {" "}at {new Date(confirmedTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            . You can still make changes below.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Timezone selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <label className="block text-sm font-medium text-gray-700 mb-2">Your timezone</label>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>

      {/* Weekly grid */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {DAYS.map((dayName, i) => {
          const day = days[i];
          return (
            <div key={dayName} className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Toggle */}
                  <button
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-1 ${
                      day.available ? "bg-violet-600" : "bg-gray-200"
                    }`}
                    role="switch"
                    aria-checked={day.available}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        day.available ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <span className={`text-sm font-medium w-24 ${day.available ? "text-gray-900" : "text-gray-400"}`}>
                    {dayName}
                  </span>
                </div>

                {!day.available && (
                  <span className="text-sm text-gray-400">Unavailable</span>
                )}
              </div>

              {/* Time windows */}
              {day.available && (
                <div className="mt-3 space-y-2 pl-14">
                  {day.windows.map((win, j) => (
                    <div key={j} className="flex items-center gap-2 flex-wrap">
                      <input
                        type="time"
                        value={win.start}
                        onChange={(e) => updateWindow(i, j, "start", e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                      <span className="text-gray-400 text-sm">to</span>
                      <input
                        type="time"
                        value={win.end}
                        onChange={(e) => updateWindow(i, j, "end", e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                      {win.start >= win.end && (
                        <span className="text-xs text-red-500">End must be after start</span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeWindow(i, j)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        title="Remove this window"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => addWindow(i)}
                    className="flex items-center gap-1 text-sm text-violet-600 hover:text-violet-700 transition-colors mt-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add time window
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Save button */}
      <div className="flex items-center gap-4 pb-8">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? "Saving…" : "Save Availability"}
        </button>

        {saveSuccess && (
          <span className="flex items-center gap-1.5 text-sm text-green-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Saved
          </span>
        )}

        {/* Confirm button also available in footer when not yet confirmed */}
        {hasExisting && !confirmed && !showReminderBanner && (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirming}
            className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors"
          >
            {confirming ? "Confirming…" : "Confirm this week"}
          </button>
        )}
      </div>
    </div>
  );
}
