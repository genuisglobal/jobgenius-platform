import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { formatCurrency, type Payslip } from "@/lib/payroll";
import MyPayslipsClient, { type MyPayslipRow } from "./MyPayslipsClient";

export default async function MyPayslipsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data: workers } = await supabaseAdmin
    .from("payroll_workers")
    .select("id, full_name, base_salary, currency, pay_frequency")
    .eq("account_manager_id", user.id)
    .limit(1);

  const worker = workers?.[0];

  if (!worker) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">My Payslips</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">
            You don&apos;t have a payroll record yet. Contact an administrator if
            you believe this is a mistake.
          </p>
        </div>
      </div>
    );
  }

  const { data: payslipsRaw } = await supabaseAdmin
    .from("payslips")
    .select("*")
    .eq("worker_id", worker.id)
    .in("status", ["issued", "paid"])
    .order("created_at", { ascending: false });

  const payslips = (payslipsRaw ?? []) as Payslip[];
  const periodIds = Array.from(new Set(payslips.map((p) => p.pay_period_id)));
  const { data: periods } = periodIds.length
    ? await supabaseAdmin
        .from("pay_periods")
        .select("id, label, period_start, period_end, pay_date")
        .in("id", periodIds)
    : { data: [] as { id: string; label: string; period_start: string; period_end: string; pay_date: string | null }[] };
  const periodById = new Map((periods ?? []).map((p) => [p.id as string, p]));

  const rows: MyPayslipRow[] = payslips.map((p) => {
    const period = periodById.get(p.pay_period_id);
    return {
      ...p,
      periodLabel: period?.label ?? "Pay period",
      periodStart: period?.period_start ?? null,
      periodEnd: period?.period_end ?? null,
      payDate: period?.pay_date ?? null,
    };
  });

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">My Payslips</h1>
      <p className="text-sm text-gray-500 mb-6">
        {worker.full_name} · base {formatCurrency(Number(worker.base_salary) || 0, worker.currency)} / {worker.pay_frequency}
      </p>
      <MyPayslipsClient initialPayslips={rows} />
    </div>
  );
}
