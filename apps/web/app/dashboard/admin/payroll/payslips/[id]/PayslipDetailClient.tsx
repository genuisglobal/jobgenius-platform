"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PAY_COMPONENT_CATEGORIES,
  computePayslipTotals,
  formatCurrency,
  type Payslip,
  type PayslipLineItemRow,
  type PayComponentKind,
  type PayComponentCategory,
} from "@/lib/payroll";

export interface PayslipWorkerInfo {
  id: string;
  full_name: string;
  job_title: string | null;
  email: string | null;
  currency: string;
}

export interface PayslipPeriodInfo {
  id: string;
  label: string;
  period_start: string;
  period_end: string;
  pay_date: string | null;
}

interface EditableLine {
  kind: PayComponentKind;
  category: PayComponentCategory;
  label: string;
  amount: string;
}

const INPUT =
  "w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-violet-600 focus:ring-1 focus:ring-violet-600";

function labelize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function toEditable(rows: PayslipLineItemRow[]): EditableLine[] {
  return rows.map((r) => ({
    kind: r.kind,
    category: r.category,
    label: r.label,
    amount: String(r.amount ?? 0),
  }));
}

export default function PayslipDetailClient({
  payslip: initialPayslip,
  initialLineItems,
  worker,
  period,
}: {
  payslip: Payslip;
  initialLineItems: PayslipLineItemRow[];
  worker: PayslipWorkerInfo | null;
  period: PayslipPeriodInfo | null;
}) {
  const router = useRouter();
  const [payslip, setPayslip] = useState(initialPayslip);
  const [lines, setLines] = useState<EditableLine[]>(toEditable(initialLineItems));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState(initialPayslip.payment_method ?? "");
  const [payRef, setPayRef] = useState(initialPayslip.payment_reference ?? "");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [hasProof, setHasProof] = useState(Boolean(initialPayslip.proof_storage_path));
  const [copied, setCopied] = useState(false);

  const editable = payslip.status === "draft";
  const currency = payslip.currency || worker?.currency || "USD";

  const totals = computePayslipTotals(
    lines.map((l) => ({ kind: l.kind, amount: Number(l.amount) || 0 }))
  );

  function updateLine(idx: number, patch: Partial<EditableLine>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function addLine(kind: PayComponentKind) {
    setLines((prev) => [
      ...prev,
      {
        kind,
        category: kind === "earning" ? "bonus" : "other",
        label: "",
        amount: "",
      },
    ]);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/payroll/payslips/${payslip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineItems: lines
            .filter((l) => l.label.trim())
            .map((l) => ({
              kind: l.kind,
              category: l.category,
              label: l.label.trim(),
              amount: Number(l.amount) || 0,
            })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save.");
        return;
      }
      setPayslip(data.payslip as Payslip);
      setMsg("Saved.");
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function markIssued() {
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/payroll/payslips/${payslip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "issued" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to issue.");
        return;
      }
      setPayslip(data.payslip as Payslip);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function reloadPayslip() {
    const res = await fetch(`/api/admin/payroll/payslips/${payslip.id}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      setPayslip(data.payslip as Payslip);
      setLines(toEditable((data.lineItems ?? []) as PayslipLineItemRow[]));
    }
  }

  async function addCommission() {
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/admin/payroll/payslips/${payslip.id}/placement-commission`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add commission.");
        return;
      }
      if (data.added) {
        setMsg(
          `Added ${formatCurrency(data.amount, currency)} from ${data.count} placement(s).`
        );
      } else {
        setMsg(data.reason || "No placement commission to add.");
      }
      await reloadPayslip();
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function markPaid() {
    setPayBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/payroll/payslips/${payslip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "paid",
          payment_method: payMethod,
          payment_reference: payRef,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to mark paid.");
        return;
      }
      setPayslip(data.payslip as Payslip);

      if (proofFile) {
        const fd = new FormData();
        fd.append("file", proofFile);
        const up = await fetch(
          `/api/admin/payroll/payslips/${payslip.id}/proof`,
          { method: "POST", body: fd }
        );
        if (up.ok) {
          setHasProof(true);
          setProofFile(null);
        }
      }
      setMsg("Marked paid.");
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setPayBusy(false);
    }
  }

  async function copyWorkerLink() {
    try {
      const url = `${window.location.origin}/dashboard/me/payslips`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy link.");
    }
  }

  async function viewProof() {
    const res = await fetch(`/api/admin/payroll/payslips/${payslip.id}/proof`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      if (data.signedUrl) window.open(data.signedUrl, "_blank");
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href={`/dashboard/admin/payroll/periods/${payslip.pay_period_id}`}
        className="text-sm text-violet-600 hover:text-violet-700 font-medium"
      >
        ← {period?.label ?? "Pay period"}
      </Link>

      <div className="flex items-start justify-between mt-2 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {worker?.full_name ?? "Payslip"}
          </h1>
          <p className="text-sm text-gray-500">
            {worker?.job_title ? `${worker.job_title} · ` : ""}
            {period?.label ?? ""} · Status{" "}
            <span className="font-medium">{payslip.status}</span>
          </p>
          <div className="mt-1">
            {payslip.acknowledged_at ? (
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                Signed by worker on {fmtDate(payslip.acknowledged_at)}
              </span>
            ) : payslip.status !== "draft" ? (
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                Awaiting worker signature
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {payslip.status !== "draft" && (
            <button
              onClick={copyWorkerLink}
              className="px-3 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
              title="Copy a link you can send to the worker. They sign in and see their payslips."
            >
              {copied ? "Copied!" : "Copy worker link"}
            </button>
          )}
          <a
            href={`/api/admin/payroll/payslips/${payslip.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
          >
            Download PDF
          </a>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
          {error}
        </div>
      )}
      {msg && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2">
          {msg}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Line items</h2>
          {editable && (
            <div className="space-x-3">
              <button onClick={() => addLine("earning")} className="text-xs text-green-600 hover:text-green-700">
                + Earning
              </button>
              <button onClick={() => addLine("deduction")} className="text-xs text-red-600 hover:text-red-700">
                + Deduction
              </button>
              <button
                onClick={addCommission}
                disabled={saving}
                className="text-xs text-violet-600 hover:text-violet-700 disabled:opacity-50"
              >
                Pull placement commission
              </button>
            </div>
          )}
        </div>

        {lines.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No line items.</p>
        ) : (
          <div className="space-y-2">
            {lines.map((l, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 gap-2 items-center"
              >
                <div className="col-span-2">
                  {editable ? (
                    <select
                      className={INPUT}
                      value={l.kind}
                      onChange={(e) => updateLine(idx, { kind: e.target.value as PayComponentKind })}
                    >
                      <option value="earning">Earning</option>
                      <option value="deduction">Deduction</option>
                    </select>
                  ) : (
                    <span className={`text-xs font-medium ${l.kind === "earning" ? "text-green-700" : "text-red-600"}`}>
                      {labelize(l.kind)}
                    </span>
                  )}
                </div>
                <div className="col-span-3">
                  {editable ? (
                    <select
                      className={INPUT}
                      value={l.category}
                      onChange={(e) => updateLine(idx, { category: e.target.value as PayComponentCategory })}
                    >
                      {PAY_COMPONENT_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{labelize(c)}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-gray-500">{labelize(l.category)}</span>
                  )}
                </div>
                <div className="col-span-4">
                  {editable ? (
                    <input
                      className={INPUT}
                      value={l.label}
                      placeholder="Label"
                      onChange={(e) => updateLine(idx, { label: e.target.value })}
                    />
                  ) : (
                    <span className="text-sm text-gray-900">{l.label}</span>
                  )}
                </div>
                <div className="col-span-2 text-right">
                  {editable ? (
                    <input
                      type="number"
                      step="0.01"
                      className={`${INPUT} text-right`}
                      value={l.amount}
                      onChange={(e) => updateLine(idx, { amount: e.target.value })}
                    />
                  ) : (
                    <span className={`text-sm ${l.kind === "deduction" ? "text-red-600" : "text-gray-900"}`}>
                      {formatCurrency(Number(l.amount) || 0, currency)}
                    </span>
                  )}
                </div>
                <div className="col-span-1 text-right">
                  {editable && (
                    <button
                      onClick={() => removeLine(idx)}
                      className="text-xs text-gray-400 hover:text-red-600"
                      aria-label="Remove"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <Row label="Gross earnings" value={formatCurrency(totals.gross, currency)} />
        <Row label="Total deductions" value={formatCurrency(totals.deductions, currency)} negative />
        <div className="border-t border-gray-200 mt-2 pt-2">
          <Row label="Net pay" value={formatCurrency(totals.net, currency)} bold />
        </div>
      </div>

      {editable && (
        <div className="flex justify-end gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save line items"}
          </button>
          <button
            onClick={markIssued}
            disabled={saving}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
          >
            Issue payslip
          </button>
        </div>
      )}

      {(payslip.status === "issued" || payslip.status === "paid") && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mt-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Payment</h2>
          {payslip.status === "paid" && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2 mb-4">
              Paid {fmtDate(payslip.paid_at)}
              {payslip.payment_method ? ` · ${payslip.payment_method}` : ""}
              {payslip.payment_reference ? ` · ref ${payslip.payment_reference}` : ""}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Payment method</span>
              <input
                className={INPUT}
                value={payMethod}
                placeholder="Bank transfer, Zelle, …"
                onChange={(e) => setPayMethod(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Reference</span>
              <input
                className={INPUT}
                value={payRef}
                placeholder="Transaction ID / note"
                onChange={(e) => setPayRef(e.target.value)}
              />
            </label>
          </div>
          <label className="block mt-3">
            <span className="block text-xs font-medium text-gray-600 mb-1">
              Payment proof (optional, image or PDF)
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </label>
          <div className="flex items-center justify-between mt-4">
            <div>
              {hasProof && (
                <button onClick={viewProof} className="text-xs text-violet-600 hover:text-violet-700">
                  View proof on file
                </button>
              )}
            </div>
            <button
              onClick={markPaid}
              disabled={payBusy}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {payBusy
                ? "Saving…"
                : payslip.status === "paid"
                ? "Update payment"
                : "Mark paid"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  negative,
}: {
  label: string;
  value: string;
  bold?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className={`text-sm ${bold ? "font-semibold text-gray-900" : "text-gray-600"}`}>
        {label}
      </span>
      <span
        className={`text-sm ${
          bold ? "font-bold text-gray-900" : negative ? "text-red-600" : "text-gray-900"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
