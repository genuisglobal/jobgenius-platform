import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await supabaseAdmin
    .from("payment_method_settings")
    .select("*")
    .order("method");

  if (error) {
    return NextResponse.json({ error: "Failed to load payment settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}

export async function PUT(request: Request) {
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
  const { method, displayName, details, isActive } = body as {
    method: string;
    displayName?: string;
    details?: string;
    isActive?: boolean;
  };

  const validMethods = ["bank", "cashapp", "zelle", "paypal"];
  if (!method || !validMethods.includes(method)) {
    return NextResponse.json({ error: "Invalid payment method." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (displayName !== undefined) updates.display_name = displayName;
  if (details !== undefined) updates.details = details;
  if (isActive !== undefined) updates.is_active = isActive;

  const { data, error } = await supabaseAdmin
    .from("payment_method_settings")
    .update(updates)
    .eq("method", method)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update payment settings." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, setting: data });
}
