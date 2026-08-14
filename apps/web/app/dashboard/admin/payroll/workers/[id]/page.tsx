import Link from "next/link";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import type {
  PayrollWorker,
  WorkerPayComponent,
  EmploymentContract,
  Payslip,
} from "@/lib/payroll";
import WorkerDetailClient, { type WorkerPayslipRow } from "./WorkerDetailClient";

interface PageProps {
  params: { id: string };
}

export default async function WorkerDetailPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { id } = params;

  const { data: worker } = await supabaseAdmin
    .from("payroll_workers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!worker) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <p className="text-gray-500">Worker not found.</p>
        <Link
          href="/dashboard/admin/payroll/workers"
          className="text-violet-600 hover:text-violet-700 text-sm font-medium mt-2 inline-block"
        >
          ← Back to workers
        </Link>
      </div>
    );
  }

  const [{ data: components }, { data: contracts }, { data: payslips }] =
    await Promise.all([
      supabaseAdmin
        .from("worker_pay_components")
        .select("*")
        .eq("worker_id", id)
        .order("kind", { ascending: true })
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("employment_contracts")
        .select("*")
        .eq("worker_id", id)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("payslips")
        .select("*")
        .eq("worker_id", id)
        .order("created_at", { ascending: false }),
    ]);

  const payslipList = (payslips ?? []) as Payslip[];
  const periodIds = Array.from(new Set(payslipList.map((p) => p.pay_period_id)));
  const { data: periods } = periodIds.length
    ? await supabaseAdmin
        .from("pay_periods")
        .select("id, label")
        .in("id", periodIds)
    : { data: [] as { id: string; label: string }[] };
  const periodLabelById = new Map(
    (periods ?? []).map((p) => [p.id as string, p.label as string])
  );
  const payslipRows: WorkerPayslipRow[] = payslipList.map((p) => ({
    ...p,
    periodLabel: periodLabelById.get(p.pay_period_id) ?? "Pay period",
  }));

  return (
    <WorkerDetailClient
      worker={worker as PayrollWorker}
      initialComponents={(components ?? []) as WorkerPayComponent[]}
      initialContracts={(contracts ?? []) as EmploymentContract[]}
      payslips={payslipRows}
    />
  );
}
