import Link from "next/link";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { formatCurrency, type PayrollWorker } from "@/lib/payroll";

export default async function PayrollOverviewPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [{ data }, { data: payslipData }] = await Promise.all([
    supabaseAdmin
      .from("payroll_workers")
      .select("id, status, base_salary, currency, pay_frequency"),
    supabaseAdmin.from("payslips").select("status, net_pay"),
  ]);

  const workers = (data ?? []) as Pick<
    PayrollWorker,
    "id" | "status" | "base_salary" | "currency" | "pay_frequency"
  >[];

  const payslips = (payslipData ?? []) as { status: string; net_pay: number }[];
  const issuedNet = payslips
    .filter((p) => p.status === "issued")
    .reduce((s, p) => s + (Number(p.net_pay) || 0), 0);
  const paidNet = payslips
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + (Number(p.net_pay) || 0), 0);

  const active = workers.filter((w) => w.status === "active");
  const onLeave = workers.filter((w) => w.status === "on_leave");
  const terminated = workers.filter((w) => w.status === "terminated");
  const activeBaseTotal = active.reduce(
    (sum, w) => sum + (Number(w.base_salary) || 0),
    0
  );
  const currency = workers[0]?.currency || "USD";

  const stats = [
    { label: "Active staff", value: String(active.length), tone: "text-green-700" },
    { label: "On leave", value: String(onLeave.length), tone: "text-amber-700" },
    { label: "Terminated", value: String(terminated.length), tone: "text-gray-500" },
    {
      label: "Active base / pay period",
      value: formatCurrency(activeBaseTotal, currency),
      tone: "text-violet-700",
    },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll</h1>
          <p className="text-sm text-gray-500 mt-1">
            Staff accounts, salaries, payslips, and employment contracts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/admin/payroll/periods"
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Pay periods
          </Link>
          <Link
            href="/dashboard/admin/payroll/workers"
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
          >
            Manage workers
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-white rounded-xl border border-gray-200 p-5"
          >
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {s.label}
            </p>
            <p className={`text-2xl font-bold mt-2 ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Issued, awaiting payment
          </p>
          <p className="text-2xl font-bold mt-2 text-amber-700">
            {formatCurrency(issuedNet, currency)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Paid (all periods)
          </p>
          <p className="text-2xl font-bold mt-2 text-green-700">
            {formatCurrency(paidNet, currency)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-2">
          Getting started
        </h2>
        <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1">
          <li>Add staff and contractors under <strong>Manage workers</strong>.</li>
          <li>Set each worker&apos;s base salary and recurring pay components (allowances, tax, benefit deductions).</li>
          <li>Generate and e-sign their employment contract.</li>
          <li>Open <strong>Pay periods</strong>, create a period, generate payslips, then finalize the run.</li>
        </ol>
        <p className="text-xs text-gray-400 mt-4">
          This module keeps records only — payments are made outside the system.
        </p>
      </div>
    </div>
  );
}
