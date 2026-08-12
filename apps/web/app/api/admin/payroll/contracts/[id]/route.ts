import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import type { EmploymentContractStatus } from "@/lib/payroll";

const CONTRACT_STATUSES: EmploymentContractStatus[] = [
  "draft",
  "sent",
  "signed",
  "active",
  "terminated",
];

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

  if (body.status !== undefined) {
    if (!CONTRACT_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    updates.status = body.status;

    if (body.status === "signed") {
      const forwarded = request.headers.get("x-forwarded-for");
      const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
      updates.signed_at = new Date().toISOString();
      updates.signed_ip = ip;
    }
  }

  if (body.title !== undefined && typeof body.title === "string" && body.title.trim()) {
    updates.title = body.title.trim();
  }
  if (body.commission_terms !== undefined) {
    updates.commission_terms =
      typeof body.commission_terms === "string" ? body.commission_terms : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("employment_contracts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update contract." }, { status: 500 });
  }

  return NextResponse.json({ contract: data });
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
    .from("employment_contracts")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Failed to delete contract." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
