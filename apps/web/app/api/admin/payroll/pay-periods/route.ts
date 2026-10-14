import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await supabaseAdmin
    .from("pay_periods")
    .select("*")
    .order("period_start", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load pay periods." }, { status: 500 });
  }

  return NextResponse.json({ payPeriods: data ?? [] });
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

  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) {
    return NextResponse.json({ error: "Label is required." }, { status: 400 });
  }
  if (!body.period_start || !body.period_end) {
    return NextResponse.json(
      { error: "Period start and end are required." },
      { status: 400 }
    );
  }
  if (new Date(body.period_end) < new Date(body.period_start)) {
    return NextResponse.json(
      { error: "Period end must be on or after period start." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("pay_periods")
    .insert({
      label,
      period_start: body.period_start,
      period_end: body.period_end,
      pay_date: body.pay_date || null,
      status: "draft",
      created_by: auth.user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create pay period." }, { status: 500 });
  }

  return NextResponse.json({ payPeriod: data }, { status: 201 });
}
