"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  formatCurrency,
  type PayPeriod,
  type Payslip,
  type PayslipStatus,
} from "@/lib/payroll";

export interface PayslipRow extends Payslip {
  workerName: string;
  workerTitle: string | null;
}

const PAYSLIP_STATUS_STYLES: Record<PayslipStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  issued: "bg-violet-100 text-violet-700",
  paid: "bg-green-100 text-green-700",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export default function PeriodDetailClient({
  period,
  initialPayslips,
}: {
  period: PayPeriod;
  initialPayslips: PayslipRow[];
}) {
  const router = useRouter();
  const [payslips, setPayslips] = useState(initialPayslips);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDraft = period.status === "draft";
  const totalNet = payslips.reduce((s, p) => s + (Number(p.net_pay) || 0), 0);
  const totalGross = payslips.reduce((s, p) => s + (Number(p.gross_earnings) || 0), 0);

  async function generate() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/admin/payroll/pay-periods/${period.id}/generate`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to generate.");
        return;
      }
      setMsg(
        `Generated ${data.generated}, updated ${data.updated}, skipped ${data.skipped}.`
      );
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function setPeriodStatus(status: string) {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/payroll/pay-periods/${period.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to update period.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function issuePayslip(p: PayslipRow) {
    const res = await fetch(`/api/admin/payroll/payslips/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "issued" }),
    });
    if (res.ok) {
      const data = await res.json();
      setPayslips((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, ...(data.payslip as Payslip) } : x))
      );
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <Link
        href="/dashboard/admin/payroll/periods"
        className="text-sm text-violet-600 hover:text-violet-700 font-medium"
      >
        ← Pay periods
      </Link>

      <div className="flex items-start justify-between mt-2 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{period.label}</h1>
          <p className="text-sm text-gray-500">
            {fmtDate(period.period_start)} – {fmtDate(period.period_end)} · Pay date{" "}
            {fmtDate(period.pay_date)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDraft && (
            <>
              <button
                onClick={generate}
                disabled={busy}
                className="px-3 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                Generate payslips
              </button>
              <button
                onClick={() => setPeriodStatus("finalized")}
                disabled={busy || payslips.length === 0}
                className="px-3 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
              >
                Finalize
              </button>
            </>
          )}
          {period.status === "finalized" && (
            <button
              onClick={() => setPeriodStatus("paid")}
              disabled={busy}
              className="px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              Mark period paid
            </button>
          )}
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

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Stat label="Payslips" value={String(payslips.length)} tone="text-gray-900" />
        <Stat label="Total gross" value={formatCurrency(totalGross)} tone="text-green-700" />
        <Stat label="Total net" value={formatCurrency(totalNet)} tone="text-violet-700" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {payslips.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400">
            No payslips yet.{" "}
            {isDraft
              ? "Click “Generate payslips” to create them from active workers."
              : ""}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Worker</th>
                <th className="px-4 py-3 text-right font-semibold">Gross</th>
                <th className="px-4 py-3 text-right font-semibold">Deductions</th>
                <th className="px-4 py-3 text-right font-semibold">Net</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payslips.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900">{p.workerName}</span>
                    {p.workerTitle && (
                      <p className="text-xs text-gray-400">{p.workerTitle}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {formatCurrency(Number(p.gross_earnings) || 0, p.currency)}
                  </td>
                  <td className="px-4 py-3 text-right text-red-600">
                    {formatCurrency(Number(p.total_deductions) || 0, p.currency)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {formatCurrency(Number(p.net_pay) || 0, p.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${PAYSLIP_STATUS_STYLES[p.status]}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-3 whitespace-nowrap">
                    <Link
                      href={`/dashboard/admin/payroll/payslips/${p.id}`}
                      className="text-xs text-violet-600 hover:text-violet-700"
                    >
                      {p.status === "draft" ? "Edit" : "View"}
                    </Link>
                    <a
                      href={`/api/admin/payroll/payslips/${p.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-gray-600 hover:text-gray-800"
                    >
                      PDF
                    </a>
                    {p.status === "draft" && (
                      <button
                        onClick={() => issuePayslip(p)}
                        className="text-xs text-green-600 hover:text-green-700"
                      >
                        Issue
                      </button>
                    )}
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

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-1 ${tone}`}>{value}</p>
    </div>
  );
}
