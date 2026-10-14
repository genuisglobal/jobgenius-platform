import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { roundCurrency, computePayslipTotals } from "@/lib/payroll";

const STANDARD_PLACEMENT_RATE = 0.05; // JobGenius commission when offer has none recorded

/**
 * POST /api/admin/payroll/payslips/[id]/placement-commission
 * Adds (or refreshes) a commission earning line on a DRAFT payslip equal to the
 * worker's placement_commission_rate applied to the placement commission of
 * their assigned seekers' offers accepted within the pay period.
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

  const { data: payslip } = await supabaseAdmin
    .from("payslips")
    .select("id, status, worker_id, pay_period_id")
    .eq("id", id)
    .maybeSingle();
  if (!payslip) {
    return NextResponse.json({ error: "Payslip not found." }, { status: 404 });
  }
  if (payslip.status !== "draft") {
    return NextResponse.json(
      { error: "Commission can only be added while the payslip is in draft." },
      { status: 400 }
    );
  }

  const { data: worker } = await supabaseAdmin
    .from("payroll_workers")
    .select("account_manager_id, placement_commission_rate")
    .eq("id", payslip.worker_id)
    .maybeSingle();

  const rate = Number(worker?.placement_commission_rate) || 0;
  if (!worker?.account_manager_id) {
    return NextResponse.json({
      added: false,
      amount: 0,
      count: 0,
      reason: "Worker is not linked to an account manager.",
    });
  }
  if (rate <= 0) {
    return NextResponse.json({
      added: false,
      amount: 0,
      count: 0,
      reason: "No placement commission rate configured for this worker.",
    });
  }

  const { data: period } = await supabaseAdmin
    .from("pay_periods")
    .select("period_start, period_end")
    .eq("id", payslip.pay_period_id)
    .maybeSingle();
  if (!period) {
    return NextResponse.json({ error: "Pay period not found." }, { status: 404 });
  }

  // Assigned seekers for this AM (fetch IDs first; never use a builder in .in()).
  const { data: assignments } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("job_seeker_id")
    .eq("account_manager_id", worker.account_manager_id);

  const seekerIds = (assignments ?? [])
    .map((a) => a.job_seeker_id as string)
    .filter(Boolean);

  if (seekerIds.length === 0) {
    return NextResponse.json({ added: false, amount: 0, count: 0, reason: "No assigned seekers." });
  }

  const { data: offers } = await supabaseAdmin
    .from("job_offers")
    .select("base_salary, commission_amount, offer_accepted_at, status")
    .in("job_seeker_id", seekerIds)
    .in("status", ["confirmed", "accepted"])
    .gte("offer_accepted_at", period.period_start)
    .lte("offer_accepted_at", period.period_end);

  const placements = offers ?? [];
  const commissionBase = placements.reduce((sum, o) => {
    const recorded = Number(o.commission_amount) || 0;
    const fallback = (Number(o.base_salary) || 0) * STANDARD_PLACEMENT_RATE;
    return sum + (recorded > 0 ? recorded : fallback);
  }, 0);

  const amount = roundCurrency(commissionBase * rate);

  // Replace any prior auto-generated placement-commission line.
  await supabaseAdmin
    .from("payslip_line_items")
    .delete()
    .eq("payslip_id", id)
    .eq("category", "commission")
    .ilike("label", "Placement commission%");

  if (amount > 0) {
    await supabaseAdmin.from("payslip_line_items").insert({
      payslip_id: id,
      kind: "earning",
      category: "commission",
      label: `Placement commission (${placements.length} placement${placements.length === 1 ? "" : "s"})`,
      amount,
    });
  }

  // Recompute totals from current line items.
  const { data: lineItems } = await supabaseAdmin
    .from("payslip_line_items")
    .select("kind, amount")
    .eq("payslip_id", id);
  const totals = computePayslipTotals(
    (lineItems ?? []).map((l) => ({
      kind: l.kind as "earning" | "deduction",
      amount: Number(l.amount) || 0,
    }))
  );
  await supabaseAdmin
    .from("payslips")
    .update({
      gross_earnings: totals.gross,
      total_deductions: totals.deductions,
      net_pay: totals.net,
    })
    .eq("id", id);

  return NextResponse.json({
    added: amount > 0,
    amount,
    count: placements.length,
    totals,
  });
}
