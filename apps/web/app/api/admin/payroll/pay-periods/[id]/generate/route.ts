import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import {
  buildPayslipLineItemsFromComponents,
  computePayslipTotals,
  type PayrollWorker,
  type WorkerPayComponent,
} from "@/lib/payroll";

/**
 * POST /api/admin/payroll/pay-periods/[id]/generate
 * Batch-creates (or refreshes) draft payslips for all active workers from
 * their base salary + active recurring components. Payslips that are already
 * issued/paid are left untouched.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  const { data: period } = await supabaseAdmin
    .from("pay_periods")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (!period) {
    return NextResponse.json({ error: "Pay period not found." }, { status: 404 });
  }
  if (period.status !== "draft") {
    return NextResponse.json(
      { error: "Payslips can only be generated while the period is in draft." },
      { status: 400 }
    );
  }

  const { data: workers } = await supabaseAdmin
    .from("payroll_workers")
    .select("*")
    .eq("status", "active");

  const activeWorkers = (workers ?? []) as PayrollWorker[];
  if (activeWorkers.length === 0) {
    return NextResponse.json({ generated: 0, updated: 0, skipped: 0 });
  }

  const workerIds = activeWorkers.map((w) => w.id);

  const [{ data: componentsRaw }, { data: existingRaw }] = await Promise.all([
    supabaseAdmin
      .from("worker_pay_components")
      .select("*")
      .in("worker_id", workerIds)
      .eq("active", true),
    supabaseAdmin
      .from("payslips")
      .select("id, worker_id, status")
      .eq("pay_period_id", id),
  ]);

  const components = (componentsRaw ?? []) as WorkerPayComponent[];
  const componentsByWorker = new Map<string, WorkerPayComponent[]>();
  for (const c of components) {
    const list = componentsByWorker.get(c.worker_id) ?? [];
    list.push(c);
    componentsByWorker.set(c.worker_id, list);
  }

  const existingByWorker = new Map<string, { id: string; status: string }>();
  for (const p of existingRaw ?? []) {
    existingByWorker.set(p.worker_id as string, {
      id: p.id as string,
      status: p.status as string,
    });
  }

  let generated = 0;
  let updated = 0;
  let skipped = 0;

  for (const worker of activeWorkers) {
    const existing = existingByWorker.get(worker.id);
    if (existing && existing.status !== "draft") {
      skipped += 1;
      continue;
    }

    const lineItems = buildPayslipLineItemsFromComponents(
      worker,
      componentsByWorker.get(worker.id) ?? []
    );
    const totals = computePayslipTotals(lineItems);

    let payslipId: string;
    if (existing) {
      // Refresh an existing draft payslip in place.
      await supabaseAdmin
        .from("payslip_line_items")
        .delete()
        .eq("payslip_id", existing.id);
      await supabaseAdmin
        .from("payslips")
        .update({
          gross_earnings: totals.gross,
          total_deductions: totals.deductions,
          net_pay: totals.net,
          currency: worker.currency,
        })
        .eq("id", existing.id);
      payslipId = existing.id;
      updated += 1;
    } else {
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("payslips")
        .insert({
          pay_period_id: id,
          worker_id: worker.id,
          gross_earnings: totals.gross,
          total_deductions: totals.deductions,
          net_pay: totals.net,
          currency: worker.currency,
          status: "draft",
          created_by: auth.user.id,
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        continue;
      }
      payslipId = inserted.id as string;
      generated += 1;
    }

    await supabaseAdmin.from("payslip_line_items").insert(
      lineItems.map((li) => ({
        payslip_id: payslipId,
        kind: li.kind,
        category: li.category,
        label: li.label,
        amount: li.amount,
      }))
    );
  }

  return NextResponse.json({ generated, updated, skipped });
}
