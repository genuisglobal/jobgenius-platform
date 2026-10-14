import Link from "next/link";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import type { Payslip, PayslipLineItemRow } from "@/lib/payroll";
import PayslipDetailClient, {
  type PayslipWorkerInfo,
  type PayslipPeriodInfo,
} from "./PayslipDetailClient";

interface PageProps {
  params: { id: string };
}

export default async function PayslipDetailPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { id } = params;

  const { data: payslip } = await supabaseAdmin
    .from("payslips")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!payslip) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <p className="text-gray-500">Payslip not found.</p>
        <Link
          href="/dashboard/admin/payroll/periods"
          className="text-violet-600 hover:text-violet-700 text-sm font-medium mt-2 inline-block"
        >
          ← Back to pay periods
        </Link>
      </div>
    );
  }

  const [{ data: lineItems }, { data: worker }, { data: period }] = await Promise.all([
    supabaseAdmin
      .from("payslip_line_items")
      .select("*")
      .eq("payslip_id", id)
      .order("kind", { ascending: true })
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("payroll_workers")
      .select("id, full_name, job_title, email, currency")
      .eq("id", payslip.worker_id)
      .maybeSingle(),
    supabaseAdmin
      .from("pay_periods")
      .select("id, label, period_start, period_end, pay_date")
      .eq("id", payslip.pay_period_id)
      .maybeSingle(),
  ]);

  return (
    <PayslipDetailClient
      payslip={payslip as Payslip}
      initialLineItems={(lineItems ?? []) as PayslipLineItemRow[]}
      worker={worker as PayslipWorkerInfo | null}
      period={period as PayslipPeriodInfo | null}
    />
  );
}
