import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { buildPayslipPdf, type PayslipPdfLineItem } from "@/lib/pdf";

/**
 * GET /api/me/payslips/[id]/pdf
 * A worker (account manager) downloads their OWN issued/paid payslip.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAM(request);
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
  if (payslip.status === "draft") {
    return NextResponse.json({ error: "Payslip not available." }, { status: 403 });
  }

  const { data: worker } = await supabaseAdmin
    .from("payroll_workers")
    .select("account_manager_id, full_name, email, job_title, payout_details")
    .eq("id", payslip.worker_id)
    .maybeSingle();

  if (!worker || worker.account_manager_id !== auth.user.id) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const [{ data: lineItems }, { data: period }] = await Promise.all([
    supabaseAdmin
      .from("payslip_line_items")
      .select("kind, label, amount")
      .eq("payslip_id", id)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("pay_periods")
      .select("label, period_start, period_end, pay_date")
      .eq("id", payslip.pay_period_id)
      .maybeSingle(),
  ]);

  const items = (lineItems ?? []) as { kind: string; label: string; amount: number }[];
  const earnings: PayslipPdfLineItem[] = items
    .filter((i) => i.kind === "earning")
    .map((i) => ({ label: i.label, amount: Number(i.amount) || 0 }));
  const deductions: PayslipPdfLineItem[] = items
    .filter((i) => i.kind === "deduction")
    .map((i) => ({ label: i.label, amount: Number(i.amount) || 0 }));

  const pdf = buildPayslipPdf({
    workerName: worker.full_name,
    workerEmail: worker.email,
    jobTitle: worker.job_title,
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
    payoutDetails: worker.payout_details ?? null,
    reference: payslip.payment_reference ?? null,
  });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="payslip.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
