import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import {
  EMPLOYMENT_TYPES,
  WORKER_STATUSES,
  PAY_FREQUENCIES,
} from "@/lib/payroll";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  const { data: worker, error } = await supabaseAdmin
    .from("payroll_workers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !worker) {
    return NextResponse.json({ error: "Worker not found." }, { status: 404 });
  }

  const [{ data: components }, { data: contracts }] = await Promise.all([
    supabaseAdmin
      .from("worker_pay_components")
      .select("*")
      .eq("worker_id", id)
      .order("kind", { ascending: true })
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("employment_contracts")
      .select(
        "id, worker_id, contract_type, title, base_salary, commission_terms, effective_date, end_date, status, signed_at, pdf_storage_path, created_at, updated_at"
      )
      .eq("worker_id", id)
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    worker,
    components: components ?? [],
    contracts: contracts ?? [],
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

  const updates: Record<string, unknown> = {};
  if (typeof body.full_name === "string") {
    const trimmed = body.full_name.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "Full name cannot be empty." }, { status: 400 });
    }
    updates.full_name = trimmed;
  }
  if (body.account_manager_id !== undefined) updates.account_manager_id = body.account_manager_id || null;
  if (body.email !== undefined) updates.email = typeof body.email === "string" ? body.email.trim() || null : null;
  if (body.job_title !== undefined) updates.job_title = typeof body.job_title === "string" ? body.job_title.trim() || null : null;
  if (body.department !== undefined) updates.department = typeof body.department === "string" ? body.department.trim() || null : null;
  if (body.employment_type !== undefined && EMPLOYMENT_TYPES.includes(body.employment_type)) updates.employment_type = body.employment_type;
  if (body.status !== undefined && WORKER_STATUSES.includes(body.status)) updates.status = body.status;
  if (body.pay_frequency !== undefined && PAY_FREQUENCIES.includes(body.pay_frequency)) updates.pay_frequency = body.pay_frequency;
  if (body.start_date !== undefined) updates.start_date = body.start_date || null;
  if (body.end_date !== undefined) updates.end_date = body.end_date || null;
  if (body.base_salary !== undefined) updates.base_salary = Number(body.base_salary) || 0;
  if (body.placement_commission_rate !== undefined) updates.placement_commission_rate = Math.max(0, Number(body.placement_commission_rate) || 0);
  if (body.currency !== undefined && typeof body.currency === "string" && body.currency.trim()) updates.currency = body.currency.trim();
  if (body.payout_details !== undefined) updates.payout_details = typeof body.payout_details === "string" ? body.payout_details : null;
  if (body.notes !== undefined) updates.notes = typeof body.notes === "string" ? body.notes : null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("payroll_workers")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update worker." }, { status: 500 });
  }

  return NextResponse.json({ worker: data });
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
    .from("payroll_workers")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Failed to delete worker." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
