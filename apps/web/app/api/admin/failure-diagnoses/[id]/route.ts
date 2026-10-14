import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/audit";

const VALID_STATUSES = ["pending", "reviewed", "applied", "rejected", "expired"] as const;

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

  const { data, error } = await supabaseAdmin
    .from("failure_diagnoses")
    .update({
      status: body.status,
      reviewer_id: auth.user.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: `Failed to update diagnosis (${error.message}).` },
      { status: 500 }
    );
  }

  await logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "account.update",
    targetType: "failure_diagnosis",
    targetId: params.id,
    details: { status: body.status },
  });

  return NextResponse.json({ diagnosis: data });
}
