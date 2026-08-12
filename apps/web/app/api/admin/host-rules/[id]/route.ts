import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { invalidateHostRulesCache } from "@/lib/apply-host-rules";
import { logAdminAction } from "@/lib/audit";

const VALID_STATUSES = ["active", "inactive", "pending_review"] as const;

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (Array.isArray(body.hosts)) {
    const hosts = (body.hosts as unknown[])
      .filter((h): h is string => typeof h === "string" && h.trim().length > 0)
      .map((h) => h.trim().toLowerCase());
    if (hosts.length === 0) {
      return NextResponse.json({ error: "Hosts cannot be empty." }, { status: 400 });
    }
    updates.hosts = hosts;
  }
  if (Array.isArray(body.apply_entry_hints)) {
    updates.apply_entry_hints = (body.apply_entry_hints as unknown[]).filter(
      (h): h is string => typeof h === "string"
    );
  }
  if (Array.isArray(body.submit_hints)) {
    updates.submit_hints = (body.submit_hints as unknown[]).filter(
      (h): h is string => typeof h === "string"
    );
  }
  if (body.requires_apply_entry !== undefined) {
    updates.requires_apply_entry = Boolean(body.requires_apply_entry);
  }
  if (body.prefer_popup_handoff !== undefined) {
    updates.prefer_popup_handoff = Boolean(body.prefer_popup_handoff);
  }
  if (typeof body.status === "string" && (VALID_STATUSES as readonly string[]).includes(body.status)) {
    updates.status = body.status;
    if (body.status === "active" || body.status === "inactive") {
      updates.reviewer_id = auth.user.id;
      updates.decided_at = new Date().toISOString();
    }
  }
  if (body.priority !== undefined && Number.isFinite(Number(body.priority))) {
    updates.priority = Number(body.priority);
  }
  if (body.notes !== undefined) {
    updates.notes = typeof body.notes === "string" ? body.notes : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("host_automation_rules")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: `Failed to update rule (${error.message}).` },
      { status: 500 }
    );
  }

  invalidateHostRulesCache();
  await logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "account.update",
    targetType: "host_automation_rule",
    targetId: params.id,
    details: { updates: Object.keys(updates) },
  });

  return NextResponse.json({ rule: data });
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { error } = await supabaseAdmin
    .from("host_automation_rules")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: "Failed to delete rule." }, { status: 500 });
  }

  invalidateHostRulesCache();
  await logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "account.delete",
    targetType: "host_automation_rule",
    targetId: params.id,
  });

  return NextResponse.json({ ok: true });
}
