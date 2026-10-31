import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import {
  computePayslipTotals,
  canTransitionPayslip,
  validPayAmount,
  PAY_COMPONENT_KINDS,
  PAY_COMPONENT_CATEGORIES,
  type PayComponentKind,
  type PayComponentCategory,
} from "@/lib/payroll";
import { queuePayslipNotice } from "@/lib/payslip-notices";

const PAYSLIP_STATUSES = ["draft", "issued", "paid"] as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  const { data: payslip, error } = await supabaseAdmin
    .from("payslips")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !payslip) {
    return NextResponse.json({ error: "Payslip not found." }, { status: 404 });
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
      .select("id, full_name, email, job_title, currency, payout_details")
      .eq("id", payslip.worker_id)
      .maybeSingle(),
    supabaseAdmin
      .from("pay_periods")
      .select("id, label, period_start, period_end, pay_date")
      .eq("id", payslip.pay_period_id)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    payslip,
    lineItems: lineItems ?? [],
    worker,
    period,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data: payslip } = await supabaseAdmin
    .from("payslips")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (!payslip) {
    return NextResponse.json({ error: "Payslip not found." }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  // Replace line items (only while draft) and recompute totals.
  if (Array.isArray(body.lineItems)) {
    if (payslip.status !== "draft") {
      return NextResponse.json(
        { error: "Line items can only be edited while the payslip is in draft." },
        { status: 400 }
      );
    }

    const cleaned = [];
    for (const raw of body.lineItems) {
      const kind: PayComponentKind = PAY_COMPONENT_KINDS.includes(raw?.kind)
        ? raw.kind
        : "earning";
      const category: PayComponentCategory = PAY_COMPONENT_CATEGORIES.includes(
        raw?.category
      )
        ? raw.category
        : "other";
      const label = typeof raw?.label === "string" ? raw.label.trim() : "";
      const amount = Number(raw?.amount);
      if (!label || raw?.amount === "" || raw?.amount === null || !validPayAmount(amount)) {
        return NextResponse.json({ error: "Each line item needs a label and a non-negative amount with at most two decimal places." }, { status: 400 });
      }
      cleaned.push({
        payslip_id: id,
        kind,
        category,
        label,
        amount,
      });
    }

    const totals = computePayslipTotals(cleaned);

    await supabaseAdmin.from("payslip_line_items").delete().eq("payslip_id", id);
    if (cleaned.length > 0) {
      await supabaseAdmin.from("payslip_line_items").insert(cleaned);
    }

    updates.gross_earnings = totals.gross;
    updates.total_deductions = totals.deductions;
    updates.net_pay = totals.net;
  }

  if (body.status !== undefined) {
    if (!PAYSLIP_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    if (!canTransitionPayslip(payslip.status, body.status)) {
      return NextResponse.json({ error: "Payslips must move from draft to issued to paid." }, { status: 400 });
    }
    updates.status = body.status;
    // Only stamp timestamps on an actual transition, not on re-saves.
    if (body.status === "issued" && payslip.status !== "issued") {
      updates.issued_at = new Date().toISOString();
    }
    if (body.status === "paid" && payslip.status !== "paid") {
      updates.paid_at = new Date().toISOString();
    }
  }

  if (body.payment_method !== undefined) {
    updates.payment_method =
      typeof body.payment_method === "string" ? body.payment_method.trim() || null : null;
  }
  if (body.payment_reference !== undefined) {
    updates.payment_reference =
      typeof body.payment_reference === "string" ? body.payment_reference.trim() || null : null;
  }
  if (body.notes !== undefined) {
    updates.notes = typeof body.notes === "string" ? body.notes : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("payslips")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update payslip." }, { status: 500 });
  }

  // Queue email before returning so the serverless request cannot end first.
  let notificationQueued: boolean | null = null;
  if (body.status === "issued" && payslip.status !== "issued") {
    notificationQueued = await queuePayslipNotice(id, "issued");
  }
  if (body.status === "paid" && payslip.status !== "paid") {
    notificationQueued = await queuePayslipNotice(id, "paid");
  }

  return NextResponse.json({ payslip: data, notificationQueued });
}
