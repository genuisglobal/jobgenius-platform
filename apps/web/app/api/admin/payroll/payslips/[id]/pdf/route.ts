import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { buildPayslipPdf, type PayslipPdfLineItem } from "@/lib/pdf";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  const { data: payslip } = await supabaseAdmin
    .from("payslips")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!payslip) {
    return NextResponse.json({ error: "Payslip not found." }, { status: 404 });
  }

  const [{ data: lineItems }, { data: worker }, { data: period }] = await Promise.all([
    supabaseAdmin
      .from("payslip_line_items")
      .select("kind, label, amount")
      .eq("payslip_id", id)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("payroll_workers")
      .select("full_name, email, job_title, payout_details")
      .eq("id", payslip.worker_id)
      .maybeSingle(),
    supabaseAdmin
      .from("pay_periods")
      .select("label, period_start, period_end, pay_date")
      .eq("id", payslip.pay_period_id)
      .maybeSingle(),
  ]);

  const items = (lineItems ?? []) as {
    kind: string;
    label: string;
    amount: number;
  }[];
  const earnings: PayslipPdfLineItem[] = items
    .filter((i) => i.kind === "earning")
    .map((i) => ({ label: i.label, amount: Number(i.amount) || 0 }));
  const deductions: PayslipPdfLineItem[] = items
    .filter((i) => i.kind === "deduction")
    .map((i) => ({ label: i.label, amount: Number(i.amount) || 0 }));

  const pdf = buildPayslipPdf({
    workerName: worker?.full_name ?? "Worker",
    workerEmail: worker?.email ?? null,
    jobTitle: worker?.job_title ?? null,
    periodLabel: period?.label ?? "Pay period",
    periodStart: period?.period_start ?? null,
    periodEnd: period?.period_end ?? null,
    payDate: period?.pay_date ?? null,
    currency: payslip.currency,
    earnings,
    deductions,
    gross: Number(payslip.gross_earnings) || 0,
    totalDeductions: Number(payslip.total_deductions) || 0,
    net: Number(payslip.net_pay) || 0,
    payoutDetails: worker?.payout_details ?? null,
    reference: payslip.payment_reference ?? null,
  });

  const slug = (worker?.full_name ?? "worker")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="payslip-${slug}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
