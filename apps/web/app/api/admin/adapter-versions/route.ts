import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/audit";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const url = new URL(request.url);
  const ats = url.searchParams.get("ats");

  let query = supabaseAdmin
    .from("adapter_versions")
    .select("*")
    .order("ats_type", { ascending: true })
    .order("version", { ascending: false });
  if (ats) query = query.eq("ats_type", ats.toUpperCase());

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ versions: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  let body: { ats_type?: unknown; config?: unknown; notes?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const atsType = typeof body.ats_type === "string" ? body.ats_type.trim().toUpperCase() : "";
  if (!atsType) {
    return NextResponse.json({ error: "ats_type is required." }, { status: 400 });
  }
  if (!body.config || typeof body.config !== "object" || Array.isArray(body.config)) {
    return NextResponse.json({ error: "config must be a JSON object." }, { status: 400 });
  }

  // Next version = max + 1 per ats_type.
  const { data: latest } = await supabaseAdmin
    .from("adapter_versions")
    .select("version")
    .eq("ats_type", atsType)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = ((latest?.version as number | undefined) ?? 0) + 1;

  const { data, error } = await supabaseAdmin
    .from("adapter_versions")
    .insert({
      ats_type: atsType,
      version: nextVersion,
      config: body.config,
      notes: typeof body.notes === "string" ? body.notes : null,
      status: "pending",
      created_by: auth.user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: `Failed to insert version (${error.message}).` },
      { status: 500 }
    );
  }

  await logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "account.update",
    targetType: "adapter_version",
    targetId: data.id,
    details: { ats_type: atsType, version: nextVersion, action: "create" },
  });

  return NextResponse.json({ version: data }, { status: 201 });
}
