import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";

interface RouteParams {
  params: { id: string };
}

// PATCH /api/admin/referrals/[id]
// Set reward_amount, mark_paid, reward_notes
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin(req);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = params;
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { reward_amount, mark_paid, reward_notes } = body;

  // Verify referral exists
  const { data: existing } = await supabaseAdmin
    .from("referrals")
    .select("id, status, reward_paid_at")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Referral not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  if (reward_amount !== undefined) {
    updates.reward_amount = reward_amount === null ? null : Number(reward_amount);
  }

  if (reward_notes !== undefined) {
    updates.reward_notes = reward_notes || null;
  }

  if (mark_paid && !existing.reward_paid_at) {
    updates.reward_paid_at = new Date().toISOString();
    updates.status = "rewarded";
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const { data: updated, error } = await supabaseAdmin
    .from("referrals")
    .update(updates)
    .eq("id", id)
    .select("id, status, reward_amount, reward_paid_at, reward_notes")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update referral" }, { status: 500 });
  }

  return NextResponse.json({ referral: updated });
}
