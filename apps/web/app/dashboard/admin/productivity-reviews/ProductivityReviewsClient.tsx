"use client";

import { useCallback, useEffect, useState } from "react";
import { watDateLabel } from "@/lib/attendance";
import { formatPaceIndex, formatRate } from "@/lib/am-productivity";
import { SUSTAINED_WEEKS, type FlagKind, type WeeklyPace } from "@/lib/productivity-reviews";

type Flag = {
  id: string;
  account_manager_id: string;
  am_name: string;
  week_start: string;
  kind: FlagKind;
  streak_weeks: number;
  evidence: { weeks?: WeeklyPace[] };
  status: "open" | "acknowledged" | "dismissed";
  resolved_by_name: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
};

type Payload = {
  can_resolve: boolean;
  scope: "team" | "self";
  flags: Flag[];
};

const KIND_STYLES: Record<FlagKind, string> = {
  concern: "bg-amber-50 text-amber-800 border-amber-200",
  commendation: "bg-green-50 text-green-800 border-green-200",
};

const KIND_LABELS: Record<FlagKind, string> = {
  concern: "Below pace",
  commendation: "Above pace",
};

export default function ProductivityReviewsClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/am/productivity-reviews", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Failed to load review flags.");
        return;
      }
      setData(payload as Payload);
      setError(null);
    } catch {
      setError("Network error loading review flags.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(flag: Flag, status: "acknowledged" | "dismissed") {
    setBusy(flag.id);
    try {
      const res = await fetch("/api/am/productivity-reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: flag.id, status, note: notes[flag.id] ?? "" }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Failed to update the flag.");
        return;
      }
      await load();
    } catch {
      setError("Network error updating the flag.");
    } finally {
      setBusy(null);
    }
  }

  const flags = (data?.flags ?? []).filter((flag) =>
    showResolved ? true : flag.status === "open"
  );
  const openCount = (data?.flags ?? []).filter((f) => f.status === "open").length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Productivity Reviews</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Raised when someone&apos;s pace stays in the same band for{" "}
            {SUSTAINED_WEEKS} consecutive rated weeks — in either direction.
          </p>
        </div>
        <button
          onClick={() => setShowResolved((value) => !value)}
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {showResolved ? "Show open only" : "Show resolved too"}
        </button>
      </header>

      <div className="p-4 rounded-xl text-sm bg-blue-50 text-blue-900 border border-blue-200">
        <p className="font-semibold">Nothing here has been recorded against anyone.</p>
        <p className="mt-1">
          These flags measure logged activity per measured hour. They do not
          know about a difficult caseload, a client in crisis, time spent
          helping colleagues, or work that never reaches the sheet. Find out
          what is behind the numbers first — and if it does turn out to be a
          performance matter, raise it deliberately through the normal review.
          Dismissing a flag is a perfectly good outcome.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500 py-12 text-center">Loading…</p>
      ) : flags.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-12 text-center">
          <p className="text-gray-700 font-medium">
            {openCount === 0 && !showResolved
              ? "Nothing open."
              : "No flags to show."}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Nobody has stayed in the same band for {SUSTAINED_WEEKS} weeks
            running.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {flags.map((flag) => (
            <section
              key={flag.id}
              className="bg-white border border-gray-200 rounded-xl overflow-hidden"
            >
              <div className="px-5 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${
                      KIND_STYLES[flag.kind]
                    }`}
                  >
                    {KIND_LABELS[flag.kind]}
                  </span>
                  <h2 className="font-semibold text-gray-900">{flag.am_name}</h2>
                  <span className="text-xs text-gray-500">
                    {flag.streak_weeks} weeks to {watDateLabel(flag.week_start)}
                  </span>
                </div>
                {flag.status !== "open" && (
                  <span className="text-xs text-gray-500">
                    {flag.status === "dismissed" ? "Dismissed" : "Acknowledged"}
                    {flag.resolved_by_name && ` by ${flag.resolved_by_name}`}
                  </span>
                )}
              </div>

              <div className="px-5 py-3">
                <table className="w-full text-xs">
                  <thead className="text-gray-500 uppercase">
                    <tr>
                      <th className="py-1 text-left font-semibold">Week of</th>
                      <th className="py-1 text-right font-semibold">Points/h</th>
                      <th className="py-1 text-right font-semibold">
                        Against team
                      </th>
                      <th className="py-1 text-right font-semibold">
                        Team median
                      </th>
                      <th className="py-1 text-right font-semibold">Measured</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(flag.evidence.weeks ?? []).map((week) => (
                      <tr key={week.week_start}>
                        <td className="py-1.5 text-gray-700">{week.week_start}</td>
                        <td className="py-1.5 text-right tabular-nums text-gray-900 font-medium">
                          {formatRate(week.score_per_hour)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-gray-700">
                          {formatPaceIndex(week.pace_index)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-gray-500">
                          {formatRate(week.team_median)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-gray-500">
                          {Math.round(week.measured_hours)}h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {flag.resolution_note && (
                  <p className="mt-3 text-xs text-gray-600">
                    <span className="font-medium">Note:</span> {flag.resolution_note}
                  </p>
                )}

                {flag.status === "open" && data?.can_resolve && (
                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[220px]">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        What did you find out? (optional)
                      </label>
                      <input
                        type="text"
                        value={notes[flag.id] ?? ""}
                        onChange={(e) =>
                          setNotes((prev) => ({ ...prev, [flag.id]: e.target.value }))
                        }
                        placeholder="Covering two extra clients while Ada is on leave"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                      />
                    </div>
                    <button
                      onClick={() => resolve(flag, "dismissed")}
                      disabled={busy === flag.id}
                      className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                    <button
                      onClick={() => resolve(flag, "acknowledged")}
                      disabled={busy === flag.id}
                      className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
                    >
                      {busy === flag.id ? "Saving…" : "Spoke to them"}
                    </button>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
