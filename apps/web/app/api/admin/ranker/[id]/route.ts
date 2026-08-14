import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { invalidateActiveModelCache } from "@/lib/learned-ranker";
import { logAdminAction } from "@/lib/audit";

/**
 * PATCH /api/admin/ranker/[id]
 * Body: { action: 'promote' | 'archive' | 'rollback' }
 *
 * promote: this row -> 'active'; previous active for the same family -> 'archived'.
 * archive: this row -> 'archived'.
 * rollback: this row -> 'rolled_back'; previous archived row -> 'active'.
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
    return NextResponse.json(
      { error: "action must be promote, archive, or rollback." },
      { status: 400 }
    );
  }

  const { data: target } = await supabaseAdmin
    .from("ranker_models")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "Model not found." }, { status: 404 });
  }

  const nowIso = new Date().toISOString();

  if (action === "promote") {
    await supabaseAdmin
      .from("ranker_models")
      .update({ status: "archived", archived_at: nowIso })
      .eq("family", target.family)
      .eq("status", "active");

    const { data, error } = await supabaseAdmin
      .from("ranker_models")
      .update({ status: "active", promoted_by: auth.user.id, promoted_at: nowIso })
      .eq("id", params.id)
      .select()
      .single();
    if (error) {
      return NextResponse.json(
        { error: `Promote failed (${error.message}).` },
        { status: 500 }
      );
    }
    invalidateActiveModelCache();
    await logAdminAction({
      adminId: auth.user.id,
      adminEmail: auth.user.email,
      adminRole: auth.user.role,
      action: "account.update",
      targetType: "ranker_model",
      targetId: params.id,
      details: { action: "promote", family: target.family, version: target.version },
    });
    return NextResponse.json({ model: data });
  }

  if (action === "archive") {
    const { data, error } = await supabaseAdmin
      .from("ranker_models")
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
    invalidateActiveModelCache();
    await logAdminAction({
      adminId: auth.user.id,
      adminEmail: auth.user.email,
      adminRole: auth.user.role,
      action: "account.update",
      targetType: "ranker_model",
      targetId: params.id,
      details: { action: "archive", family: target.family, version: target.version },
    });
    return NextResponse.json({ model: data });
  }

  // rollback
  await supabaseAdmin
    .from("ranker_models")
    .update({ status: "rolled_back" })
    .eq("id", params.id);
  const { data: previous } = await supabaseAdmin
    .from("ranker_models")
    .select("id, version")
    .eq("family", target.family)
    .eq("status", "archived")
    .order("archived_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previous) {
    await supabaseAdmin
      .from("ranker_models")
      .update({
        status: "active",
        promoted_by: auth.user.id,
        promoted_at: nowIso,
      })
      .eq("id", previous.id);
  }
  invalidateActiveModelCache();
  await logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "account.update",
    targetType: "ranker_model",
    targetId: params.id,
    details: {
      action: "rollback",
      family: target.family,
      restored_id: previous?.id ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    rolled_back: params.id,
    restored_id: previous?.id ?? null,
  });
}
