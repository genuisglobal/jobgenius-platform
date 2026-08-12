import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";

const PERIOD_STATUSES = ["draft", "finalized", "paid"] as const;

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

  const updates: Record<string, unknown> = {};
  if (body.label !== undefined && typeof body.label === "string" && body.label.trim()) {
    updates.label = body.label.trim();
  }
  if (body.period_start !== undefined) updates.period_start = body.period_start;
  if (body.period_end !== undefined) updates.period_end = body.period_end;
  if (body.pay_date !== undefined) updates.pay_date = body.pay_date || null;
  if (body.status !== undefined) {
    if (!PERIOD_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    updates.status = body.status;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("pay_periods")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update pay period." }, { status: 500 });
  }

  // Finalizing a period issues all of its draft payslips.
  if (updates.status === "finalized") {
    await supabaseAdmin
      .from("payslips")
      .update({ status: "issued", issued_at: new Date().toISOString() })
      .eq("pay_period_id", id)
      .eq("status", "draft");
  }

  return NextResponse.json({ payPeriod: data });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  const { error } = await supabaseAdmin
    .from("pay_periods")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Failed to delete pay period." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
