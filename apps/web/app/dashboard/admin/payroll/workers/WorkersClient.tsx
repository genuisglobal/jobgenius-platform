"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  EMPLOYMENT_TYPES,
  WORKER_STATUSES,
  PAY_FREQUENCIES,
  formatCurrency,
  type PayrollWorker,
  type EmploymentType,
  type WorkerStatus,
  type PayFrequency,
} from "@/lib/payroll";

export interface AccountManagerOption {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
}

const STATUS_STYLES: Record<WorkerStatus, string> = {
  active: "bg-green-100 text-green-700",
  on_leave: "bg-amber-100 text-amber-700",
  terminated: "bg-gray-100 text-gray-500",
};

function labelize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const EMPTY_FORM = {
  full_name: "",
  email: "",
  job_title: "",
  department: "",
  employment_type: "full_time" as EmploymentType,
  status: "active" as WorkerStatus,
  base_salary: "",
  pay_frequency: "monthly" as PayFrequency,
  currency: "USD",
  account_manager_id: "",
  start_date: "",
  payout_details: "",
  notes: "",
};

export default function WorkersClient({
  initialWorkers,
  accountManagers,
}: {
  initialWorkers: PayrollWorker[];
  accountManagers: AccountManagerOption[];
}) {
  const router = useRouter();
  const [workers, setWorkers] = useState<PayrollWorker[]>(initialWorkers);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) {
      setError("Full name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/payroll/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          base_salary: Number(form.base_salary) || 0,
          account_manager_id: form.account_manager_id || null,
          start_date: form.start_date || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create worker.");
        return;
      }
      setWorkers((prev) => [data.worker as PayrollWorker, ...prev]);
      setForm({ ...EMPTY_FORM });
      setShowForm(false);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workers</h1>
          <p className="text-sm text-gray-500 mt-1">
            Staff and contractors on payroll. Open a worker to set bonuses,
            deductions, contracts, and view payslips.
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
        >
          {showForm ? "Cancel" : "Add worker"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-4"
        >
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full name *">
              <input
                type="text"
                value={form.full_name}
                onChange={(e) => update("full_name", e.target.value)}
                className="input"
                required
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Job title">
              <input
                type="text"
                value={form.job_title}
                onChange={(e) => update("job_title", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Department">
              <input
                type="text"
                value={form.department}
                onChange={(e) => update("department", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Employment type">
              <select
                value={form.employment_type}
                onChange={(e) =>
                  update("employment_type", e.target.value as EmploymentType)
                }
                className="input"
              >
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {labelize(t)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) => update("status", e.target.value as WorkerStatus)}
                className="input"
              >
                {WORKER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {labelize(s)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Base salary (per pay period)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.base_salary}
                onChange={(e) => update("base_salary", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Pay frequency">
              <select
                value={form.pay_frequency}
                onChange={(e) =>
                  update("pay_frequency", e.target.value as PayFrequency)
                }
                className="input"
              >
                {PAY_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {labelize(f)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Currency">
              <input
                type="text"
                value={form.currency}
                onChange={(e) => update("currency", e.target.value.toUpperCase())}
                className="input"
                maxLength={3}
              />
            </Field>
            <Field label="Start date">
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => update("start_date", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Link to platform account (optional)">
              <select
                value={form.account_manager_id}
                onChange={(e) => update("account_manager_id", e.target.value)}
                className="input"
              >
                <option value="">— None —</option>
                {accountManagers.map((am) => (
                  <option key={am.id} value={am.id}>
                    {am.name || am.email || am.id}
                    {am.role ? ` (${am.role})` : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Payout details (shown on payslip)">
            <textarea
              value={form.payout_details}
              onChange={(e) => update("payout_details", e.target.value)}
              className="input min-h-[60px]"
              placeholder="Bank / account info, etc."
            />
          </Field>
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              className="input min-h-[60px]"
            />
          </Field>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Create worker"}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {workers.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400">
            No workers yet. Add your first staff member above.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Name</th>
                <th className="px-4 py-3 text-left font-semibold">Role</th>
                <th className="px-4 py-3 text-left font-semibold">Type</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Base / period</th>
                <th className="px-4 py-3 text-right font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {workers.map((w) => (
                <tr key={w.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/admin/payroll/workers/${w.id}`}
                      className="font-medium text-violet-600 hover:text-violet-700"
                    >
                      {w.full_name}
                    </Link>
                    {w.email && (
                      <p className="text-xs text-gray-400">{w.email}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {w.job_title || "—"}
                    {w.department && (
                      <span className="text-xs text-gray-400"> · {w.department}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {labelize(w.employment_type)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[w.status]}`}
                    >
                      {labelize(w.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900 font-medium">
                    {formatCurrency(Number(w.base_salary) || 0, w.currency)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/admin/payroll/workers/${w.id}`}
                      className="text-xs font-medium text-violet-600 hover:text-violet-700 whitespace-nowrap"
                    >
                      Manage →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border: 1px solid #d1d5db;
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: #111827;
        }
        :global(.input:focus) {
          outline: none;
          border-color: #7c3aed;
          box-shadow: 0 0 0 1px #7c3aed;
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
