"use client";

import { useCallback, useEffect, useState } from "react";
import { watDate, watDateLabel } from "@/lib/attendance";
import {
  EXEMPTION_LABELS,
  EXEMPTION_REASONS,
  WEEKDAY_LABELS,
  formatWorkDays,
  type Exemption,
  type ExemptionReason,
} from "@/lib/roster";

type RosterManager = {
  id: string;
  name: string;
  role: string;
  work_days: number[];
  is_default: boolean;
};

type Payload = {
  can_edit: boolean;
  managers: RosterManager[];
  exemptions: Exemption[];
};

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

export default function RosterClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // New-exemption form.
  const [target, setTarget] = useState<string>("");
  const [startDate, setStartDate] = useState(() => watDate());
  const [endDate, setEndDate] = useState(() => watDate());
  const [reason, setReason] = useState<ExemptionReason>("leave");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/am/roster", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Failed to load the roster.");
        return;
      }
      setData(payload as Payload);
      setError(null);
    } catch {
      setError("Network error loading the roster.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleDay(manager: RosterManager, day: number) {
    const next = manager.work_days.includes(day)
      ? manager.work_days.filter((d) => d !== day)
      : [...manager.work_days, day].sort((a, b) => a - b);

    if (next.length === 0) {
      setError("Everyone needs at least one working day.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/am/roster", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_manager_id: manager.id, work_days: next }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Failed to save the schedule.");
        return;
      }
      await load();
    } catch {
      setError("Network error saving the schedule.");
    } finally {
      setBusy(false);
    }
  }

  async function addExemption() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/am/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_manager_id: target || null,
          start_date: startDate,
          end_date: endDate,
          reason,
          note,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Failed to record the exemption.");
        return;
      }
      setNote("");
      await load();
    } catch {
      setError("Network error recording the exemption.");
    } finally {
      setBusy(false);
    }
  }

  async function removeExemption(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/am/roster?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = await res.json();
        setError(payload.error ?? "Failed to remove the exemption.");
        return;
      }
      await load();
    } catch {
      setError("Network error removing the exemption.");
    } finally {
      setBusy(false);
    }
  }

  const managers = data?.managers ?? [];
  const exemptions = data?.exemptions ?? [];
  const canEdit = data?.can_edit ?? false;
  const nameById = new Map(managers.map((m) => [m.id, m.name]));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Work Roster</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-3xl">
          Which days each person is expected in, and the days that do not
          count against them. This is what the productivity report measures
          absence against — without it, someone who never clocks in simply
          disappears from the report instead of showing up as absent.
        </p>
      </header>

      {error && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200">
          {error}
        </div>
      )}

      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Expected working days</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Everyone starts on Monday–Friday. Only change the people whose
            week is genuinely different.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 px-5 py-12 text-center">Loading…</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {managers.map((manager) => (
              <div
                key={manager.id}
                className="px-5 py-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-[180px]">
                  <p className="font-medium text-gray-900 text-sm">{manager.name}</p>
                  <p className="text-xs text-gray-500">
                    {formatWorkDays(manager.work_days)}
                    {manager.is_default && (
                      <span className="ml-1 text-gray-400">(default)</span>
                    )}
                  </p>
                </div>

                <div className="flex gap-1">
                  {ALL_DAYS.map((day) => {
                    const on = manager.work_days.includes(day);
                    return (
                      <button
                        key={day}
                        disabled={!canEdit || busy}
                        onClick={() => toggleDay(manager, day)}
                        className={`w-11 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
                          on
                            ? "bg-violet-600 text-white border-violet-600"
                            : "bg-white text-gray-500 border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        {WEEKDAY_LABELS[day]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {canEdit && (
        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900">Record an exemption</h2>
          <p className="text-xs text-gray-500 mt-0.5 mb-4">
            Leave, sickness, training, or a public holiday. Leave the person
            as &quot;Whole company&quot; for a holiday — it applies to
            everyone without touching individual rosters.
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Who
              </label>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 min-w-[180px]"
              >
                <option value="">Whole company</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                From
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (e.target.value > endDate) setEndDate(e.target.value);
                }}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                To
              </label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Reason
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as ExemptionReason)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              >
                {EXEMPTION_REASONS.map((value) => (
                  <option key={value} value={value}>
                    {EXEMPTION_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Note (optional)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </div>
            <button
              onClick={addExemption}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Add"}
            </button>
          </div>
        </section>
      )}

      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Exemptions</h2>
        </div>

        {exemptions.length === 0 ? (
          <p className="text-sm text-gray-500 px-5 py-8 text-center">
            Nothing recorded. Every rostered day counts.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Who</th>
                  <th className="px-3 py-2 text-left font-semibold">From</th>
                  <th className="px-3 py-2 text-left font-semibold">To</th>
                  <th className="px-3 py-2 text-left font-semibold">Reason</th>
                  <th className="px-3 py-2 text-left font-semibold">Note</th>
                  {canEdit && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {exemptions.map((exemption) => (
                  <tr key={exemption.id}>
                    <td className="px-4 py-2 font-medium text-gray-900">
                      {exemption.account_manager_id === null ? (
                        <span className="text-violet-700">Whole company</span>
                      ) : (
                        nameById.get(exemption.account_manager_id) ?? "Unknown AM"
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {watDateLabel(exemption.start_date)}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {watDateLabel(exemption.end_date)}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {EXEMPTION_LABELS[exemption.reason]}
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      {exemption.note ?? "—"}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => removeExemption(exemption.id)}
                          disabled={busy}
                          className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
