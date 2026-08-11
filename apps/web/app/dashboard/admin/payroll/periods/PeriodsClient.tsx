"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency, type PayPeriod, type PayPeriodStatus } from "@/lib/payroll";

export interface PeriodSummary {
  count: number;
  totalNet: number;
}

const INPUT =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-violet-600 focus:ring-1 focus:ring-violet-600";

const STATUS_STYLES: Record<PayPeriodStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  finalized: "bg-violet-100 text-violet-700",
  paid: "bg-green-100 text-green-700",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export default function PeriodsClient({
  initialPeriods,
  summaries,
}: {
  initialPeriods: PayPeriod[];
  summaries: Record<string, PeriodSummary>;
}) {
  const router = useRouter();
  const [periods, setPeriods] = useState(initialPeriods);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    label: "",
    period_start: "",
    period_end: "",
    pay_date: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label.trim() || !form.period_start || !form.period_end) {
      setError("Label, start, and end are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/payroll/pay-periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, pay_date: form.pay_date || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create.");
        return;
      }
      setPeriods((prev) => [data.payPeriod as PayPeriod, ...prev]);
      setForm({ label: "", period_start: "", period_end: "", pay_date: "" });
      setShowForm(false);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            href="/dashboard/admin/payroll"
            className="text-sm text-violet-600 hover:text-violet-700 font-medium"
          >
            ← Payroll
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Pay Periods</h1>
          <p className="text-sm text-gray-500">
            Create a period, generate payslips, then finalize the run.
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700"
        >
          {showForm ? "Cancel" : "New pay period"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={create}
          className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-4"
        >
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <label className="block sm:col-span-1">
              <span className="block text-xs font-medium text-gray-600 mb-1">Label</span>
              <input
                className={INPUT}
                placeholder="May 2026"
                value={form.label}
                onChange={(e) => set("label", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Period start</span>
              <input type="date" className={INPUT} value={form.period_start} onChange={(e) => set("period_start", e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Period end</span>
              <input type="date" className={INPUT} value={form.period_end} onChange={(e) => set("period_end", e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Pay date</span>
              <input type="date" className={INPUT} value={form.pay_date} onChange={(e) => set("pay_date", e.target.value)} />
            </label>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50">
              {saving ? "Creating…" : "Create period"}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {periods.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400">
            No pay periods yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Period</th>
                <th className="px-4 py-3 text-left font-semibold">Dates</th>
                <th className="px-4 py-3 text-left font-semibold">Pay date</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Payslips</th>
                <th className="px-4 py-3 text-right font-semibold">Total net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {periods.map((p) => {
                const s = summaries[p.id] ?? { count: 0, totalNet: 0 };
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/admin/payroll/periods/${p.id}`}
                        className="font-medium text-violet-600 hover:text-violet-700"
                      >
                        {p.label}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {fmtDate(p.period_start)} – {fmtDate(p.period_end)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(p.pay_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[p.status]}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{s.count}</td>
                    <td className="px-4 py-3 text-right text-gray-900 font-medium">
                      {formatCurrency(s.totalNet)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
