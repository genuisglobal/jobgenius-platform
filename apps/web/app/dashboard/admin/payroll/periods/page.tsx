import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import type { PayPeriod } from "@/lib/payroll";
import PeriodsClient, { type PeriodSummary } from "./PeriodsClient";

export default async function PayPeriodsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [{ data: periods }, { data: payslips }] = await Promise.all([
    supabaseAdmin
      .from("pay_periods")
      .select("*")
      .order("period_start", { ascending: false }),
    supabaseAdmin.from("payslips").select("pay_period_id, net_pay"),
  ]);

  const summaries: Record<string, PeriodSummary> = {};
  for (const p of payslips ?? []) {
    const key = p.pay_period_id as string;
    const entry = summaries[key] ?? { count: 0, totalNet: 0 };
    entry.count += 1;
    entry.totalNet += Number(p.net_pay) || 0;
    summaries[key] = entry;
  }

  return (
    <PeriodsClient
      initialPeriods={(periods ?? []) as PayPeriod[]}
      summaries={summaries}
    />
  );
}
