"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { getRangeBounds, normalizeSheetDate } from "@/lib/activity-sheet";
import { formatDuration, watDate, watDateLabel } from "@/lib/attendance";
import {
  MIN_RATED_HOURS,
  PACE_LABELS,
  UNMEASURED_LABELS,
  applicationTotal,
  formatHours,
  formatPaceIndex,
  formatPercent,
  formatRate,
  type AmProductivity,
  type PaceBand,
  type ProductivityTeam,
} from "@/lib/am-productivity";

type Payload = {
  start: string;
  end: string;
  days: number;
  /** "team" for admins, "self" for everyone else — see the API route. */
  scope: "team" | "self";
  my_account_manager_id: string;
  managers: AmProductivity[];
  team: ProductivityTeam;
};

const PACE_STYLES: Record<PaceBand, string> = {
  fast: "bg-green-50 text-green-700 border border-green-200",
  steady: "bg-blue-50 text-blue-700 border border-blue-200",
  slow: "bg-amber-50 text-amber-700 border border-amber-200",
  unrated: "bg-gray-100 text-gray-500 border border-gray-200",
};

/** Shift a YYYY-MM-DD by whole days without touching the local timezone. */
function shiftDate(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

type Preset = { label: string; bounds: () => { start: string; end: string } };

const PRESETS: Preset[] = [
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

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
    </div>
  );
}

export default function ProductivityClient({
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
        `/api/am/productivity?start=${encodeURIComponent(from)}&end=${encodeURIComponent(to)}`,
        { cache: "no-store" }
      );
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Failed to load productivity.");
        return;
      }
      setData(payload as Payload);
    } catch {
      setError("Network error loading productivity.");
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
  const team = data?.team;
  const isSelfScope = data?.scope === "self";

  const unmatched = useMemo(
    () => managers.reduce((sum, m) => sum + m.unmatched_days, 0),
    [managers]
  );
  const idle = useMemo(
    () => managers.reduce((sum, m) => sum + m.idle_days, 0),
    [managers]
  );

  function applyPreset(preset: Preset) {
    const bounds = preset.bounds();
    setStart(bounds.start);
    setEnd(bounds.end);
  }

  const activePreset = PRESETS.find((preset) => {
    const bounds = preset.bounds();
    return bounds.start === start && bounds.end === end;
  })?.label;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isSelfScope ? "My Productivity" : "Productivity"}
          </h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            What the Activity Sheet recorded, divided by the hours the
            attendance clock measured. Rates cover days with a complete
            shift — a day on the clock with nothing logged counts against
            the rate, a day logged with no shift is left out of it.
          </p>
          {isSelfScope && (
            <p className="text-sm text-gray-500 mt-2 max-w-2xl">
              These are your own numbers. The tiles below compare them to an
              anonymous team median — nobody else&apos;s individual figures are
              shown here, and yours are not shown to them.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => applyPreset(preset)}
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

      {error && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200">
          {error}
        </div>
      )}

      {team && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label="Measured hours"
              value={formatHours(team.measured_hours)}
              hint={`${team.managers} account manager${team.managers === 1 ? "" : "s"} · ${data?.days ?? 0} days`}
            />
            <Tile
              label="Team pace"
              value={
                team.median_score_per_hour === null
                  ? "—"
                  : `${formatRate(team.median_score_per_hour)}/h`
              }
              hint={
                team.median_score_per_hour === null
                  ? `Needs ${MIN_RATED_HOURS}h measured per AM`
                  : `Median points per hour · ${team.rated_managers} rated`
              }
            />
            <Tile
              label="Applications"
              value={String(team.funnel.applications)}
              hint={`${team.funnel.follow_ups} follow-ups · ${
                team.funnel.follow_ups_per_application === null
                  ? "—"
                  : `${formatRate(team.funnel.follow_ups_per_application)} per app`
              }`}
            />
            <Tile
              label="Interviews / Offers"
              value={`${team.funnel.interviews} / ${team.funnel.offers}`}
              hint={`${formatRate(team.funnel.interviews_per_100_applications)} interviews & ${formatRate(
                team.funnel.offers_per_100_applications
              )} offers per 100 apps`}
            />
          </section>

          {(unmatched > 0 || idle > 0) && (
            <div className="p-3 rounded-lg text-sm bg-amber-50 text-amber-900 border border-amber-200">
              {idle > 0 && (
                <span>
                  <strong>{idle}</strong> day{idle === 1 ? "" : "s"} on the
                  clock with nothing logged on the sheet.
                </span>
              )}
              {idle > 0 && unmatched > 0 && " "}
              {unmatched > 0 && (
                <span>
                  <strong>{unmatched}</strong> day{unmatched === 1 ? "" : "s"} of
                  logged work with no measurable shift (never clocked in, or
                  never signed out) — that work is in the totals but excluded
                  from every rate.
                </span>
              )}
            </div>
          )}
        </>
      )}

      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">
            {isSelfScope ? "My time usage" : "Time usage by account manager"}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {isSelfScope
              ? "Click the row for your daily breakdown."
              : "Ranked by output per measured hour. Click a row for the daily breakdown."}
          </p>
        </div>

        {loading && !data ? (
          <p className="text-sm text-gray-500 px-5 py-12 text-center">Loading…</p>
        ) : managers.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-gray-700 font-medium">
              {isSelfScope
                ? "You have nothing logged in this range."
                : "Nothing logged in this range."}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              This report needs both an Activity Sheet row and an attendance
              shift to say anything.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold min-w-[170px]">
                    Account Manager
                  </th>
                  <th className="px-3 py-2 text-left font-semibold w-32">Pace</th>
                  <th className="px-3 py-2 text-right font-semibold">Hours</th>
                  <th className="px-3 py-2 text-right font-semibold">Apps</th>
                  <th className="px-3 py-2 text-right font-semibold">Follow-ups</th>
                  <th className="px-3 py-2 text-right font-semibold">Interviews</th>
                  <th className="px-3 py-2 text-right font-semibold">Offers</th>
                  <th className="px-3 py-2 text-right font-semibold">Pts/h</th>
                  <th className="px-3 py-2 text-right font-semibold">Apps/h</th>
                  <th
                    className="px-3 py-2 text-right font-semibold"
                    title="Interviews per 100 applications"
                  >
                    Int/100
                  </th>
                  <th
                    className="px-3 py-2 text-right font-semibold"
                    title="Offers per 100 applications"
                  >
                    Off/100
                  </th>
                  <th
                    className="px-4 py-2 text-right font-semibold"
                    title="Share of days on the clock with activity logged"
                  >
                    Logged
                  </th>
                  <th
                    className="px-4 py-2 text-right font-semibold"
                    title="Rostered days with no shift and nothing logged, excluding approved leave and holidays"
                  >
                    Absent
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {managers.map((manager) => {
                  const isMe =
                    manager.account_manager_id === data?.my_account_manager_id;
                  const open = expanded === manager.account_manager_id;
                  return (
                    <Fragment key={manager.account_manager_id}>
                      <tr
                        onClick={() =>
                          setExpanded(open ? null : manager.account_manager_id)
                        }
                        className={`cursor-pointer hover:bg-gray-50 ${
                          isMe ? "bg-violet-50 hover:bg-violet-100" : ""
                        }`}
                      >
                        <td className="px-4 py-2 font-medium text-gray-900">
                          <span className="text-gray-400 mr-1.5 inline-block w-3">
                            {open ? "▾" : "▸"}
                          </span>
                          {manager.am_name}
                          {isMe && (
                            <span className="ml-2 text-xs font-normal text-violet-600">
                              you
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                              PACE_STYLES[manager.pace]
                            }`}
                            title={
                              manager.rates
                                ? "Against the team's median points per hour"
                                : `Under ${MIN_RATED_HOURS} measured hours`
                            }
                          >
                            {PACE_LABELS[manager.pace]}
                            {manager.pace_index !== null && (
                              <span className="ml-1 tabular-nums font-normal">
                                {formatPaceIndex(manager.pace_index)}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                          {formatHours(manager.measured_hours)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                          {manager.funnel.applications}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                          {manager.funnel.follow_ups}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                          {manager.funnel.interviews}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">
                          {manager.funnel.offers}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">
                          {formatRate(manager.rates?.score_per_hour ?? null)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                          {formatRate(manager.rates?.applications_per_hour ?? null)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                          {formatRate(manager.funnel.interviews_per_100_applications)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                          {formatRate(manager.funnel.offers_per_100_applications)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-700">
                          {formatPercent(manager.coverage)}
                          <span className="text-gray-400 text-xs ml-1">
                            {manager.days_logged}/{manager.days_on_clock}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {manager.attendance === null ? (
                            <span className="text-gray-400">—</span>
                          ) : manager.attendance.absent_days > 0 ? (
                            <span
                              className="text-amber-700 font-semibold"
                              title={`Expected ${manager.attendance.expected_days} days${
                                manager.attendance.exempt_days > 0
                                  ? `, ${manager.attendance.exempt_days} excused`
                                  : ""
                              }`}
                            >
                              {manager.attendance.absent_days}
                            </span>
                          ) : (
                            <span className="text-gray-400">0</span>
                          )}
                          {manager.attendance &&
                            manager.attendance.exempt_days > 0 && (
                              <span
                                className="text-gray-400 text-xs ml-1"
                                title="Approved leave or public holidays"
                              >
                                +{manager.attendance.exempt_days} off
                              </span>
                            )}
                        </td>
                      </tr>

                      {open && (
                        <tr>
                          <td colSpan={13} className="bg-gray-50 px-4 py-3">
                            <table className="w-full text-xs">
                              <thead className="text-gray-500 uppercase">
                                <tr>
                                  <th className="py-1 text-left font-semibold min-w-[200px]">
                                    Day
                                  </th>
                                  <th className="py-1 text-right font-semibold">Worked</th>
                                  <th className="py-1 text-right font-semibold">Apps</th>
                                  <th className="py-1 text-right font-semibold">
                                    Follow-ups
                                  </th>
                                  <th className="py-1 text-right font-semibold">Phone</th>
                                  <th className="py-1 text-right font-semibold">AI</th>
                                  <th className="py-1 text-right font-semibold">Video</th>
                                  <th className="py-1 text-right font-semibold">Offers</th>
                                  <th className="py-1 text-right font-semibold">Pts/h</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {manager.days.map((day) => {
                                  const hours =
                                    day.worked_ms === null
                                      ? null
                                      : day.worked_ms / 3_600_000;
                                  return (
                                    <tr key={day.work_date}>
                                      <td className="py-1.5 text-gray-700">
                                        {watDateLabel(day.work_date)}
                                        {day.unmeasured && (
                                          <span className="ml-2 text-amber-600">
                                            {UNMEASURED_LABELS[day.unmeasured]}
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-1.5 text-right tabular-nums text-gray-700">
                                        {day.worked_ms === null
                                          ? "—"
                                          : formatDuration(day.worked_ms)}
                                      </td>
                                      <td className="py-1.5 text-right tabular-nums text-gray-700">
                                        {applicationTotal(day.counts)}
                                      </td>
                                      <td className="py-1.5 text-right tabular-nums text-gray-700">
                                        {day.counts.follow_ups}
                                      </td>
                                      <td className="py-1.5 text-right tabular-nums text-gray-700">
                                        {day.counts.phone_interviews}
                                      </td>
                                      <td className="py-1.5 text-right tabular-nums text-gray-700">
                                        {day.counts.ai_interviews}
                                      </td>
                                      <td className="py-1.5 text-right tabular-nums text-gray-700">
                                        {day.counts.video_interviews}
                                      </td>
                                      <td className="py-1.5 text-right tabular-nums text-gray-700">
                                        {day.counts.offers}
                                      </td>
                                      <td className="py-1.5 text-right tabular-nums font-medium text-gray-900">
                                        {hours && hours > 0
                                          ? formatRate(day.score / hours)
                                          : "—"}
                                      </td>
                                    </tr>
                                  );
                                })}
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
        Points weight the sheet&apos;s columns by effort and outcome (a company
        application counts 1.5, a video interview 2, an offer 100), so points
        per hour rewards placing people rather than piling up easy applies.
        Pace compares each AM to the team&apos;s median points per hour over
        the same range; anyone under {MIN_RATED_HOURS} measured hours is left
        unrated rather than judged on a sample too small to mean anything.
        Every Friday each account manager is sent their own week by
        notification and email.
      </p>
    </div>
  );
}
