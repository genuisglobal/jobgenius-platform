import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import {
  EMPLOYMENT_TYPES,
  WORKER_STATUSES,
  PAY_FREQUENCIES,
  type EmploymentType,
  type WorkerStatus,
  type PayFrequency,
} from "@/lib/payroll";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const q = searchParams.get("q");

  let query = supabaseAdmin
    .from("payroll_workers")
    .select("*")
    .order("created_at", { ascending: false });

  if (status && WORKER_STATUSES.includes(status as WorkerStatus)) {
    query = query.eq("status", status);
  }
  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    query = query.or(`full_name.ilike.${term},email.ilike.${term}`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Failed to load workers." }, { status: 500 });
  }

  return NextResponse.json({ workers: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  if (!fullName) {
    return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  }

  const employmentType: EmploymentType = EMPLOYMENT_TYPES.includes(
    body.employment_type
  )
    ? body.employment_type
    : "full_time";
  const status: WorkerStatus = WORKER_STATUSES.includes(body.status)
    ? body.status
    : "active";
  const payFrequency: PayFrequency = PAY_FREQUENCIES.includes(body.pay_frequency)
    ? body.pay_frequency
    : "monthly";

  const insert = {
    account_manager_id: body.account_manager_id || null,
    full_name: fullName,
    email: typeof body.email === "string" ? body.email.trim() || null : null,
    job_title: typeof body.job_title === "string" ? body.job_title.trim() || null : null,
    department: typeof body.department === "string" ? body.department.trim() || null : null,
    employment_type: employmentType,
    status,
    start_date: body.start_date || null,
    end_date: body.end_date || null,
    base_salary: Number(body.base_salary) || 0,
    pay_frequency: payFrequency,
    currency: typeof body.currency === "string" && body.currency.trim() ? body.currency.trim() : "USD",
    placement_commission_rate: Math.max(0, Number(body.placement_commission_rate) || 0),
    payout_details: typeof body.payout_details === "string" ? body.payout_details : null,
    notes: typeof body.notes === "string" ? body.notes : null,
    created_by: auth.user.id,
  };

  const { data, error } = await supabaseAdmin
    .from("payroll_workers")
    .insert(insert)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create worker." }, { status: 500 });
  }

  return NextResponse.json({ worker: data }, { status: 201 });
}
