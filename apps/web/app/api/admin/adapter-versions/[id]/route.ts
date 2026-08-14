import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/audit";

/**
 * PATCH /api/admin/adapter-versions/[id]
 * Body: { action: 'promote' | 'archive' | 'rollback' }
 *
 * promote: set this row to 'active'; archives any prior active row for the
 *          same ats_type in the same transaction (well, two updates).
 * archive: set this row to 'archived'.
 * rollback: set this row to 'rolled_back' AND promote the prior active
 *           version back to 'active' if it's still 'archived'.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  let body: { action?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";
  if (!["promote", "archive", "rollback"].includes(action)) {
    return NextResponse.json({ error: "action must be promote, archive, or rollback." }, { status: 400 });
  }

  const { data: target } = await supabaseAdmin
    .from("adapter_versions")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }

  const nowIso = new Date().toISOString();

  if (action === "promote") {
    // Archive the currently-active row for this ats_type (if any).
    await supabaseAdmin
      .from("adapter_versions")
      .update({ status: "archived", archived_at: nowIso })
      .eq("ats_type", target.ats_type)
      .eq("status", "active");

    const { data, error } = await supabaseAdmin
      .from("adapter_versions")
      .update({
        status: "active",
        promoted_by: auth.user.id,
        promoted_at: nowIso,
      })
      .eq("id", params.id)
      .select()
      .single();
    if (error) {
      return NextResponse.json(
        { error: `Promote failed (${error.message}).` },
        { status: 500 }
      );
    }
    await logAdminAction({
      adminId: auth.user.id,
      adminEmail: auth.user.email,
      adminRole: auth.user.role,
      action: "account.update",
      targetType: "adapter_version",
      targetId: params.id,
      details: { action: "promote", ats_type: target.ats_type, version: target.version },
    });
    return NextResponse.json({ version: data });
  }

  if (action === "archive") {
    const { data, error } = await supabaseAdmin
      .from("adapter_versions")
      .update({ status: "archived", archived_at: nowIso })
      .eq("id", params.id)
      .select()
      .single();
    if (error) {
      return NextResponse.json(
        { error: `Archive failed (${error.message}).` },
        { status: 500 }
      );
    }
    await logAdminAction({
      adminId: auth.user.id,
      adminEmail: auth.user.email,
      adminRole: auth.user.role,
      action: "account.update",
      targetType: "adapter_version",
      targetId: params.id,
      details: { action: "archive", ats_type: target.ats_type, version: target.version },
    });
    return NextResponse.json({ version: data });
  }

  // rollback: this row -> rolled_back; restore previous active.
  await supabaseAdmin
    .from("adapter_versions")
    .update({ status: "rolled_back" })
    .eq("id", params.id);

  // Find the most recently archived row for this ats_type (the previous active).
  const { data: previous } = await supabaseAdmin
    .from("adapter_versions")
    .select("id, version")
    .eq("ats_type", target.ats_type)
    .eq("status", "archived")
    .order("archived_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previous) {
    await supabaseAdmin
      .from("adapter_versions")
      .update({ status: "active", promoted_by: auth.user.id, promoted_at: nowIso })
      .eq("id", previous.id);
  }

  await logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "account.update",
    targetType: "adapter_version",
    targetId: params.id,
    details: {
      action: "rollback",
      ats_type: target.ats_type,
      restored_version_id: previous?.id ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    rolled_back: params.id,
    restored_id: previous?.id ?? null,
  });
}
