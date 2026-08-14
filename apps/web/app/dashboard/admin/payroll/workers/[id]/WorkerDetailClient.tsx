"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  EMPLOYMENT_TYPES,
  WORKER_STATUSES,
  PAY_FREQUENCIES,
  PAY_COMPONENT_CATEGORIES,
  PAY_COMPONENT_AMOUNT_TYPES,
  EMPLOYMENT_CONTRACT_TYPES,
  formatCurrency,
  computePayslipTotals,
  buildPayslipLineItemsFromComponents,
  type PayrollWorker,
  type WorkerPayComponent,
  type EmploymentContract,
  type EmploymentType,
  type WorkerStatus,
  type PayFrequency,
  type PayComponentKind,
  type PayComponentCategory,
  type PayComponentAmountType,
  type EmploymentContractType,
  type Payslip,
  type PayslipStatus,
} from "@/lib/payroll";

export interface WorkerPayslipRow extends Payslip {
  periodLabel: string;
}

const PAYSLIP_STATUS_STYLES: Record<PayslipStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  issued: "bg-violet-100 text-violet-700",
  paid: "bg-green-100 text-green-700",
};

const INPUT =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-violet-600 focus:ring-1 focus:ring-violet-600";

function labelize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function WorkerDetailClient({
  worker: initialWorker,
  initialComponents,
  initialContracts,
  payslips,
}: {
  worker: PayrollWorker;
  initialComponents: WorkerPayComponent[];
  initialContracts: EmploymentContract[];
  payslips: WorkerPayslipRow[];
}) {
  const router = useRouter();
  const [worker, setWorker] = useState(initialWorker);
  const [components, setComponents] = useState(initialComponents);
  const [contracts, setContracts] = useState(initialContracts);

  return (
    <div className="max-w-4xl mx-auto space-y-10">
      <div>
        <Link
          href="/dashboard/admin/payroll/workers"
          className="text-sm text-violet-600 hover:text-violet-700 font-medium"
        >
          ← Workers
        </Link>
        <div className="flex items-center justify-between mt-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{worker.full_name}</h1>
            <p className="text-sm text-gray-500">
              {worker.job_title || "—"}
              {worker.department ? ` · ${worker.department}` : ""} ·{" "}
              {labelize(worker.employment_type)}
            </p>
          </div>
          <span className="text-right">
            <span className="block text-xs text-gray-400">Base / pay period</span>
            <span className="text-lg font-bold text-gray-900">
              {formatCurrency(Number(worker.base_salary) || 0, worker.currency)}
            </span>
          </span>
        </div>
      </div>

      <SectionHeader title="Profile" subtitle="Salary, employment type, contact, and notes." />
      <ProfileTab worker={worker} onSaved={setWorker} />

      <SectionHeader
        title="Bonuses & deductions"
        subtitle="Recurring earnings (allowances, bonuses, commission) and deductions (tax, benefits) added on every payslip."
      />
      <ComponentsTab
        worker={worker}
        components={components}
        onChange={setComponents}
      />

      <SectionHeader
        title="Contracts"
        subtitle="Generate an offer letter or employment agreement and e-sign it."
      />
      <ContractsTab
        worker={worker}
        contracts={contracts}
        payslips={payslips}
        onChange={(next) => {
          setContracts(next);
          router.refresh();
        }}
      />
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="border-b border-gray-200 pb-2">
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
    </div>
  );
}

// ─── Profile ─────────────────────────────────────────────────

function ProfileTab({
  worker,
  onSaved,
}: {
  worker: PayrollWorker;
  onSaved: (w: PayrollWorker) => void;
}) {
  const [form, setForm] = useState({
    full_name: worker.full_name,
    email: worker.email ?? "",
    job_title: worker.job_title ?? "",
    department: worker.department ?? "",
    employment_type: worker.employment_type,
    status: worker.status,
    base_salary: String(worker.base_salary ?? 0),
    pay_frequency: worker.pay_frequency,
    currency: worker.currency,
    placement_commission_pct: String((Number(worker.placement_commission_rate) || 0) * 100),
    payout_details: worker.payout_details ?? "",
    notes: worker.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/payroll/workers/${worker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          base_salary: Number(form.base_salary) || 0,
          placement_commission_rate: (Number(form.placement_commission_pct) || 0) / 100,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save.");
        return;
      }
      onSaved(data.worker as PayrollWorker);
      setMsg("Saved.");
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
          {error}
        </div>
      )}
      {msg && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2">
          {msg}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Full name">
          <input className={INPUT} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
        </Field>
        <Field label="Email">
          <input className={INPUT} value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Job title">
          <input className={INPUT} value={form.job_title} onChange={(e) => set("job_title", e.target.value)} />
        </Field>
        <Field label="Department">
          <input className={INPUT} value={form.department} onChange={(e) => set("department", e.target.value)} />
        </Field>
        <Field label="Employment type">
          <select className={INPUT} value={form.employment_type} onChange={(e) => set("employment_type", e.target.value as EmploymentType)}>
            {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{labelize(t)}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className={INPUT} value={form.status} onChange={(e) => set("status", e.target.value as WorkerStatus)}>
            {WORKER_STATUSES.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
          </select>
        </Field>
        <Field label="Base salary (per pay period)">
          <input type="number" min="0" step="0.01" className={INPUT} value={form.base_salary} onChange={(e) => set("base_salary", e.target.value)} />
        </Field>
        <Field label="Pay frequency">
          <select className={INPUT} value={form.pay_frequency} onChange={(e) => set("pay_frequency", e.target.value as PayFrequency)}>
            {PAY_FREQUENCIES.map((f) => <option key={f} value={f}>{labelize(f)}</option>)}
          </select>
        </Field>
        <Field label="Currency">
          <input className={INPUT} maxLength={3} value={form.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
        </Field>
        <Field label="Placement commission rate (%)">
          <input
            type="number"
            min="0"
            step="0.5"
            className={INPUT}
            value={form.placement_commission_pct}
            onChange={(e) => set("placement_commission_pct", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Payout details (shown on payslip)">
        <textarea className={`${INPUT} min-h-[60px]`} value={form.payout_details} onChange={(e) => set("payout_details", e.target.value)} />
      </Field>
      <Field label="Notes">
        <textarea className={`${INPUT} min-h-[60px]`} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50">
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

// ─── Pay Components ──────────────────────────────────────────

function ComponentsTab({
  worker,
  components,
  onChange,
}: {
  worker: PayrollWorker;
  components: WorkerPayComponent[];
  onChange: (next: WorkerPayComponent[]) => void;
}) {
  const [form, setForm] = useState({
    kind: "earning" as PayComponentKind,
    category: "allowance" as PayComponentCategory,
    label: "",
    amount_type: "fixed" as PayComponentAmountType,
    value: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = computePayslipTotals(
    buildPayslipLineItemsFromComponents(worker, components)
  );

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label.trim()) {
      setError("Label is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/payroll/workers/${worker.id}/components`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, value: Number(form.value) || 0 }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add.");
        return;
      }
      onChange([...components, data.component as WorkerPayComponent]);
      setForm((p) => ({ ...p, label: "", value: "" }));
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: WorkerPayComponent) {
    const res = await fetch(
      `/api/admin/payroll/workers/${worker.id}/components`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ componentId: c.id, active: !c.active }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      onChange(
        components.map((x) => (x.id === c.id ? (data.component as WorkerPayComponent) : x))
      );
    }
  }

  async function remove(c: WorkerPayComponent) {
    const res = await fetch(
      `/api/admin/payroll/workers/${worker.id}/components?componentId=${c.id}`,
      { method: "DELETE" }
    );
    if (res.ok) onChange(components.filter((x) => x.id !== c.id));
  }

  function valueLabel(c: WorkerPayComponent): string {
    if (c.amount_type === "fixed") {
      return formatCurrency(Number(c.value) || 0, worker.currency);
    }
    return `${Number(c.value) || 0}% of ${c.amount_type === "percent_of_base" ? "base" : "gross"}`;
  }

  const earnings = components.filter((c) => c.kind === "earning");
  const deductions = components.filter((c) => c.kind === "deduction");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Gross / period" value={formatCurrency(preview.gross, worker.currency)} tone="text-green-700" />
        <Stat label="Deductions" value={formatCurrency(preview.deductions, worker.currency)} tone="text-red-600" />
        <Stat label="Net / period" value={formatCurrency(preview.net, worker.currency)} tone="text-violet-700" />
      </div>

      <form onSubmit={add} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Add pay component</h3>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Field label="Kind">
            <select className={INPUT} value={form.kind} onChange={(e) => set("kind", e.target.value as PayComponentKind)}>
              <option value="earning">Earning</option>
              <option value="deduction">Deduction</option>
            </select>
          </Field>
          <Field label="Category">
            <select className={INPUT} value={form.category} onChange={(e) => set("category", e.target.value as PayComponentCategory)}>
              {PAY_COMPONENT_CATEGORIES.map((c) => <option key={c} value={c}>{labelize(c)}</option>)}
            </select>
          </Field>
          <Field label="Label">
            <input className={INPUT} value={form.label} onChange={(e) => set("label", e.target.value)} />
          </Field>
          <Field label="Amount type">
            <select className={INPUT} value={form.amount_type} onChange={(e) => set("amount_type", e.target.value as PayComponentAmountType)}>
              {PAY_COMPONENT_AMOUNT_TYPES.map((a) => <option key={a} value={a}>{labelize(a)}</option>)}
            </select>
          </Field>
          <Field label={form.amount_type === "fixed" ? "Amount" : "Percent"}>
            <input type="number" min="0" step="0.01" className={INPUT} value={form.value} onChange={(e) => set("value", e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50">
            {saving ? "Adding…" : "Add component"}
          </button>
        </div>
      </form>

      <ComponentList title="Earnings" items={earnings} valueLabel={valueLabel} onToggle={toggleActive} onRemove={remove} />
      <ComponentList title="Deductions" items={deductions} valueLabel={valueLabel} onToggle={toggleActive} onRemove={remove} />
    </div>
  );
}

function ComponentList({
  title,
  items,
  valueLabel,
  onToggle,
  onRemove,
}: {
  title: string;
  items: WorkerPayComponent[];
  valueLabel: (c: WorkerPayComponent) => string;
  onToggle: (c: WorkerPayComponent) => void;
  onRemove: (c: WorkerPayComponent) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">
        {title}
      </div>
      {items.length === 0 ? (
        <div className="px-5 py-6 text-center text-sm text-gray-400">None.</div>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {items.map((c) => (
              <tr key={c.id} className={c.active ? "" : "opacity-50"}>
                <td className="px-5 py-3">
                  <span className="font-medium text-gray-900">{c.label}</span>
                  <span className="text-xs text-gray-400 ml-2">{labelize(c.category)}</span>
                </td>
                <td className="px-5 py-3 text-gray-700">{valueLabel(c)}</td>
                <td className="px-5 py-3 text-right space-x-3">
                  <button onClick={() => onToggle(c)} className="text-xs text-gray-500 hover:text-gray-700">
                    {c.active ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => onRemove(c)} className="text-xs text-red-500 hover:text-red-700">
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Contracts ───────────────────────────────────────────────

const CONTRACT_STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-violet-100 text-violet-700",
  signed: "bg-green-100 text-green-700",
  active: "bg-emerald-100 text-emerald-700",
  terminated: "bg-red-100 text-red-700",
};

function ContractsTab({
  worker,
  contracts,
  payslips,
  onChange,
}: {
  worker: PayrollWorker;
  contracts: EmploymentContract[];
  payslips: WorkerPayslipRow[];
  onChange: (next: EmploymentContract[]) => void;
}) {
  const [form, setForm] = useState({
    contract_type: "offer_letter" as EmploymentContractType,
    title: "",
    effective_date: "",
    commission_terms: "",
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/payroll/workers/${worker.id}/contracts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            effective_date: form.effective_date || null,
            commission_terms: form.commission_terms || null,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create.");
        return;
      }
      onChange([data.contract as EmploymentContract, ...contracts]);
      setForm((p) => ({ ...p, title: "", commission_terms: "" }));
    } catch {
      setError("Network error.");
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(c: EmploymentContract, status: string) {
    const res = await fetch(`/api/admin/payroll/contracts/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const data = await res.json();
      onChange(
        contracts.map((x) => (x.id === c.id ? (data.contract as EmploymentContract) : x))
      );
    }
  }

  async function remove(c: EmploymentContract) {
    const res = await fetch(`/api/admin/payroll/contracts/${c.id}`, {
      method: "DELETE",
    });
    if (res.ok) onChange(contracts.filter((x) => x.id !== c.id));
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Generate contract</h3>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Type">
            <select className={INPUT} value={form.contract_type} onChange={(e) => set("contract_type", e.target.value as EmploymentContractType)}>
              {EMPLOYMENT_CONTRACT_TYPES.map((t) => <option key={t} value={t}>{labelize(t)}</option>)}
            </select>
          </Field>
          <Field label="Effective date">
            <input type="date" className={INPUT} value={form.effective_date} onChange={(e) => set("effective_date", e.target.value)} />
          </Field>
          <Field label="Title (optional)">
            <input className={INPUT} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Auto-generated if blank" />
          </Field>
        </div>
        <Field label="Commission / bonus terms (optional)">
          <textarea className={`${INPUT} min-h-[60px]`} value={form.commission_terms} onChange={(e) => set("commission_terms", e.target.value)} placeholder="e.g. 5% of each placement commission collected" />
        </Field>
        <div className="flex justify-end">
          <button type="submit" disabled={creating} className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50">
            {creating ? "Generating…" : "Generate contract"}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {contracts.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">No contracts yet.</div>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {contracts.map((c) => (
                <tr key={c.id}>
                  <td className="px-5 py-3">
                    <span className="font-medium text-gray-900">{c.title}</span>
                    <p className="text-xs text-gray-400">
                      {labelize(c.contract_type)}
                      {c.signed_at ? ` · signed ${new Date(c.signed_at).toLocaleDateString()}` : ""}
                    </p>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${CONTRACT_STATUS_STYLES[c.status] || "bg-gray-100 text-gray-600"}`}>
                      {labelize(c.status)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right space-x-3 whitespace-nowrap">
                    <a
                      href={`/api/admin/payroll/contracts/${c.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-violet-600 hover:text-violet-700"
                    >
                      View
                    </a>
                    {c.status === "draft" && (
                      <button onClick={() => setStatus(c, "sent")} className="text-xs text-gray-500 hover:text-gray-700">Mark sent</button>
                    )}
                    {(c.status === "draft" || c.status === "sent") && (
                      <button onClick={() => setStatus(c, "signed")} className="text-xs text-green-600 hover:text-green-700">Mark signed</button>
                    )}
                    {c.status === "signed" && (
                      <button onClick={() => setStatus(c, "active")} className="text-xs text-emerald-600 hover:text-emerald-700">Activate</button>
                    )}
                    <button onClick={() => remove(c)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900">Payslip history</span>
          <Link
            href="/dashboard/admin/payroll/periods"
            className="text-xs font-medium text-violet-600 hover:text-violet-700"
          >
            + Generate payslip →
          </Link>
        </div>
        {payslips.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            No payslips yet.
            <br />
            <Link
              href="/dashboard/admin/payroll/periods"
              className="mt-3 inline-block px-3 py-2 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700"
            >
              Open Pay Periods to generate
            </Link>
            <p className="mt-3 text-[11px] text-gray-400">
              Payslips are generated per pay period from each worker&apos;s base
              salary + bonuses & deductions.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {payslips.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <Link
                      href={`/dashboard/admin/payroll/payslips/${p.id}`}
                      className="font-medium text-violet-600 hover:text-violet-700"
                    >
                      {p.periodLabel}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${PAYSLIP_STATUS_STYLES[p.status]}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-gray-900">
                    {formatCurrency(Number(p.net_pay) || 0, p.currency)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <a
                      href={`/api/admin/payroll/payslips/${p.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-gray-600 hover:text-gray-800"
                    >
                      PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Shared ──────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-1 ${tone}`}>{value}</p>
    </div>
  );
}
