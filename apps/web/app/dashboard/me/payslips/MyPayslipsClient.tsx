"use client";

import { useState } from "react";
import { formatCurrency, type Payslip } from "@/lib/payroll";

export interface MyPayslipRow extends Payslip {
  periodLabel: string;
  periodStart: string | null;
  periodEnd: string | null;
  payDate: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export default function MyPayslipsClient({
  initialPayslips,
}: {
  initialPayslips: MyPayslipRow[];
}) {
  const [payslips, setPayslips] = useState(initialPayslips);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function acknowledge(p: MyPayslipRow) {
    setBusyId(p.id);
    setError(null);
    try {
      const res = await fetch(`/api/me/payslips/${p.id}/acknowledge`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to acknowledge.");
        return;
      }
      setPayslips((prev) =>
        prev.map((x) =>
          x.id === p.id
            ? {
                ...x,
                acknowledged_at: data.payslip.acknowledged_at,
                acknowledged_ip: data.payslip.acknowledged_ip,
              }
            : x
        )
      );
    } catch {
      setError("Network error.");
    } finally {
      setBusyId(null);
    }
  }

  if (payslips.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
        No payslips have been issued to you yet.
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
          {error}
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Period</th>
              <th className="px-4 py-3 text-left font-semibold">Pay date</th>
              <th className="px-4 py-3 text-left font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Net pay</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {payslips.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <span className="font-medium text-gray-900">{p.periodLabel}</span>
                  <p className="text-xs text-gray-400">
                    {fmtDate(p.periodStart)} – {fmtDate(p.periodEnd)}
                  </p>
                </td>
                <td className="px-4 py-3 text-gray-600">{fmtDate(p.payDate)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      p.status === "paid"
                        ? "bg-green-100 text-green-700"
                        : "bg-violet-100 text-violet-700"
                    }`}
                  >
                    {p.status}
                  </span>
                  {p.acknowledged_at && (
                    <p className="text-[10px] text-emerald-600 mt-0.5">
                      Signed {fmtDate(p.acknowledged_at)}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">
                  {formatCurrency(Number(p.net_pay) || 0, p.currency)}
                </td>
                <td className="px-4 py-3 text-right space-x-3 whitespace-nowrap">
                  <a
                    href={`/api/me/payslips/${p.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-violet-600 hover:text-violet-700"
                  >
                    Download
                  </a>
                  {!p.acknowledged_at && (
                    <button
                      onClick={() => acknowledge(p)}
                      disabled={busyId === p.id}
                      className="text-xs font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                    >
                      {busyId === p.id ? "Signing…" : "Sign / acknowledge"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-400">
        Signing acknowledges that you have reviewed this payslip. The
        timestamp is recorded.
      </p>
    </>
  );
}
