import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import {
  PAY_COMPONENT_KINDS,
  PAY_COMPONENT_CATEGORIES,
  PAY_COMPONENT_AMOUNT_TYPES,
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
  const { data, error } = await supabaseAdmin
    .from("worker_pay_components")
    .select("*")
    .eq("worker_id", id)
    .order("kind", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to load components." }, { status: 500 });
  }

  return NextResponse.json({ components: data ?? [] });
}

export async function POST(
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

  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) {
    return NextResponse.json({ error: "Label is required." }, { status: 400 });
  }
  if (!PAY_COMPONENT_KINDS.includes(body.kind)) {
    return NextResponse.json({ error: "Invalid kind." }, { status: 400 });
  }
  if (!PAY_COMPONENT_CATEGORIES.includes(body.category)) {
    return NextResponse.json({ error: "Invalid category." }, { status: 400 });
  }
  const amountType = PAY_COMPONENT_AMOUNT_TYPES.includes(body.amount_type)
    ? body.amount_type
    : "fixed";

  const { data, error } = await supabaseAdmin
    .from("worker_pay_components")
    .insert({
      worker_id: id,
      kind: body.kind,
      category: body.category,
      label,
      amount_type: amountType,
      value: Number(body.value) || 0,
      active: body.active === undefined ? true : Boolean(body.active),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to add component." }, { status: 500 });
  }

  return NextResponse.json({ component: data }, { status: 201 });
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

  const componentId = typeof body.componentId === "string" ? body.componentId : "";
  if (!componentId) {
    return NextResponse.json({ error: "componentId is required." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.label !== undefined) {
    const trimmed = typeof body.label === "string" ? body.label.trim() : "";
    if (!trimmed) {
      return NextResponse.json({ error: "Label cannot be empty." }, { status: 400 });
    }
    updates.label = trimmed;
  }
  if (body.kind !== undefined && PAY_COMPONENT_KINDS.includes(body.kind)) updates.kind = body.kind;
  if (body.category !== undefined && PAY_COMPONENT_CATEGORIES.includes(body.category)) updates.category = body.category;
  if (body.amount_type !== undefined && PAY_COMPONENT_AMOUNT_TYPES.includes(body.amount_type)) updates.amount_type = body.amount_type;
  if (body.value !== undefined) updates.value = Number(body.value) || 0;
  if (body.active !== undefined) updates.active = Boolean(body.active);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("worker_pay_components")
    .update(updates)
    .eq("id", componentId)
    .eq("worker_id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update component." }, { status: 500 });
  }

  return NextResponse.json({ component: data });
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
  const { searchParams } = new URL(request.url);
  const componentId = searchParams.get("componentId");
  if (!componentId) {
    return NextResponse.json({ error: "componentId is required." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("worker_pay_components")
    .delete()
    .eq("id", componentId)
    .eq("worker_id", id);

  if (error) {
    return NextResponse.json({ error: "Failed to delete component." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
