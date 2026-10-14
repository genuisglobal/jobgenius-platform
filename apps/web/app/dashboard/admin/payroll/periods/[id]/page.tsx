import Link from "next/link";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import type { PayPeriod, Payslip } from "@/lib/payroll";
import PeriodDetailClient, { type PayslipRow } from "./PeriodDetailClient";

interface PageProps {
  params: { id: string };
}

export default async function PeriodDetailPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { id } = params;

  const { data: period } = await supabaseAdmin
    .from("pay_periods")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!period) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <p className="text-gray-500">Pay period not found.</p>
        <Link
          href="/dashboard/admin/payroll/periods"
          className="text-violet-600 hover:text-violet-700 text-sm font-medium mt-2 inline-block"
        >
          ← Back to pay periods
        </Link>
      </div>
    );
  }

  const { data: payslips } = await supabaseAdmin
    .from("payslips")
    .select("*")
    .eq("pay_period_id", id)
    .order("created_at", { ascending: true });

  const list = (payslips ?? []) as Payslip[];
  const workerIds = Array.from(new Set(list.map((p) => p.worker_id)));

  const { data: workers } = workerIds.length
    ? await supabaseAdmin
        .from("payroll_workers")
        .select("id, full_name, job_title")
        .in("id", workerIds)
    : { data: [] as { id: string; full_name: string; job_title: string | null }[] };

  const workerById = new Map(
    (workers ?? []).map((w) => [w.id as string, w])
  );

  const rows: PayslipRow[] = list.map((p) => ({
    ...p,
    workerName: workerById.get(p.worker_id)?.full_name ?? "Unknown",
    workerTitle: workerById.get(p.worker_id)?.job_title ?? null,
  }));

  return (
    <PeriodDetailClient period={period as PayPeriod} initialPayslips={rows} />
  );
}
