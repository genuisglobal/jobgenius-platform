"use client";

import { useEffect, useState } from "react";

type CapacityRow = {
  accountManagerId: string;
  accountManagerName: string;
  email: string;
  monthlyLimit: number;
  approvedCount: number;
  spotsLeft: number;
  notes: string | null;
};

type CapacitySnapshot = {
  capacityMonth: string;
  monthLabel: string;
  rows: CapacityRow[];
  totalCapacity: number;
  reservedCount: number;
  spotsLeft: number;
};

type RowForm = {
  monthlyLimit: string;
  notes: string;
};

function monthInputValue(capacityMonth: string): string {
  return capacityMonth.slice(0, 7);
}

function toCapacityMonth(value: string): string {
  return /^\d{4}-\d{2}$/.test(value)
    ? `${value}-01`
    : new Date().toISOString().slice(0, 7) + "-01";
}

function buildFormState(rows: CapacityRow[]): Record<string, RowForm> {
  return Object.fromEntries(
    rows.map((row) => [
      row.accountManagerId,
      {
        monthlyLimit: String(row.monthlyLimit),
        notes: row.notes ?? "",
      },
    ])
  );
}

export default function CapacityClient({
  initialSnapshot,
}: {
  initialSnapshot: CapacitySnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selectedMonth, setSelectedMonth] = useState(
    monthInputValue(initialSnapshot.capacityMonth)
  );
  const [forms, setForms] = useState<Record<string, RowForm>>(
    buildFormState(initialSnapshot.rows)
  );
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForms(buildFormState(snapshot.rows));
  }, [snapshot]);

  useEffect(() => {
    let cancelled = false;

    async function loadSnapshot() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/admin/capacity?month=${encodeURIComponent(toCapacityMonth(selectedMonth))}`,
          { cache: "no-store" }
        );
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          if (!cancelled) {
            setError(data?.error || "Failed to load capacity.");
          }
          return;
        }

        if (!cancelled) {
          setSnapshot(data as CapacitySnapshot);
        }
      } catch {
        if (!cancelled) {
          setError("Network error while loading capacity.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (selectedMonth !== monthInputValue(snapshot.capacityMonth)) {
      loadSnapshot();
      return () => {
        cancelled = true;
      };
    }

    return () => {
      cancelled = true;
    };
  }, [selectedMonth, snapshot.capacityMonth]);

  function updateRow(
    accountManagerId: string,
    updates: Partial<RowForm>
  ) {
    setForms((current) => ({
      ...current,
      [accountManagerId]: {
        ...(current[accountManagerId] ?? { monthlyLimit: "4", notes: "" }),
        ...updates,
      },
    }));
  }

  async function saveRow(accountManagerId: string) {
    const form = forms[accountManagerId];
    if (!form) return;

    setSavingId(accountManagerId);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/capacity", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountManagerId,
          capacityMonth: toCapacityMonth(selectedMonth),
          monthlyNewClientLimit: Number(form.monthlyLimit),
          notes: form.notes || null,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data?.error || "Failed to save capacity.");
        return;
      }

      const refreshResponse = await fetch(
        `/api/admin/capacity?month=${encodeURIComponent(toCapacityMonth(selectedMonth))}`,
        { cache: "no-store" }
      );
      const refreshData = await refreshResponse.json().catch(() => ({}));

      if (!refreshResponse.ok) {
        setError(refreshData?.error || "Capacity saved, but refresh failed.");
        return;
      }

      setSnapshot(refreshData as CapacitySnapshot);
      setMessage("Capacity updated.");
    } catch {
      setError("Network error while saving capacity.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AM Capacity</h1>
          <p className="text-gray-600">
            Set how many new seekers each approved account manager can take this
            month.
          </p>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
            Capacity Month
          </label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Total Capacity</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {snapshot.totalCapacity}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Reserved Spots</p>
          <p className="mt-2 text-3xl font-bold text-violet-600">
            {snapshot.reservedCount}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Spots Left</p>
          <p className="mt-2 text-3xl font-bold text-green-600">
            {snapshot.spotsLeft}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-gray-900">{snapshot.monthLabel}</h2>
            <p className="text-sm text-gray-500">
              Defaults start at 4 new seekers per account manager, but you can
              override them per month.
            </p>
          </div>
          {loading && <span className="text-sm text-gray-500">Loading...</span>}
        </div>

        {snapshot.rows.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-500">
            No approved account managers found.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {snapshot.rows.map((row) => {
              const form = forms[row.accountManagerId] ?? {
                monthlyLimit: String(row.monthlyLimit),
                notes: row.notes ?? "",
              };

              return (
                <div
                  key={row.accountManagerId}
                  className="grid gap-4 px-5 py-5 lg:grid-cols-[1.25fr_0.7fr_0.7fr_1fr_auto]"
                >
                  <div>
                    <p className="font-semibold text-gray-900">{row.accountManagerName}</p>
                    <p className="text-sm text-gray-500">{row.email}</p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Reserved
                    </p>
                    <p className="mt-1 text-2xl font-bold text-violet-600">
                      {row.approvedCount}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Spots Left
                    </p>
                    <p className="mt-1 text-2xl font-bold text-green-600">
                      {row.spotsLeft}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                        Monthly Limit
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={form.monthlyLimit}
                        onChange={(event) =>
                          updateRow(row.accountManagerId, {
                            monthlyLimit: event.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                        Notes
                      </label>
                      <input
                        type="text"
                        value={form.notes}
                        onChange={(event) =>
                          updateRow(row.accountManagerId, {
                            notes: event.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder="Optional"
                      />
                    </div>
                  </div>

                  <div className="flex items-end">
                    <button
                      onClick={() => saveRow(row.accountManagerId)}
                      disabled={savingId === row.accountManagerId}
                      className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                    >
                      {savingId === row.accountManagerId ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
