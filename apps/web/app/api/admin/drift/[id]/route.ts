import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/audit";

const VALID_STATUSES = ["open", "acknowledged", "resolved", "auto_closed"] as const;

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { status?: unknown; notes?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.status !== "string" || !(VALID_STATUSES as readonly string[]).includes(body.status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const updates: Record<string, unknown> = { status: body.status };
  if (body.status === "acknowledged") {
    updates.acknowledged_by = auth.user.id;
    updates.acknowledged_at = new Date().toISOString();
  }
  if (body.status === "resolved" || body.status === "auto_closed") {
    updates.resolved_by = auth.user.id;
    updates.resolved_at = new Date().toISOString();
    if (typeof body.notes === "string") {
      updates.resolution_notes = body.notes;
    }
  }

  const { data, error } = await supabaseAdmin
    .from("drift_incidents")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();
  if (error) {
    return NextResponse.json(
      { error: `Failed to update incident (${error.message}).` },
      { status: 500 }
    );
  }

  await logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "account.update",
    targetType: "drift_incident",
    targetId: params.id,
    details: { status: body.status },
  });

  return NextResponse.json({ incident: data });
}
