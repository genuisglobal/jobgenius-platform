import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { invalidateHostRulesCache } from "@/lib/apply-host-rules";
import { logAdminAction } from "@/lib/audit";

const VALID_STATUSES = ["active", "inactive", "pending_review"] as const;

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await supabaseAdmin
    .from("host_automation_rules")
    .select("*")
    .order("status", { ascending: true })
    .order("rule_id", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to load rules." }, { status: 500 });
  }

  return NextResponse.json({ rules: data ?? [] });
}

export async function POST(request: Request) {
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

  const ruleId = typeof body.rule_id === "string" ? body.rule_id.trim().toUpperCase() : "";
  if (!ruleId || !/^[A-Z0-9_]+$/.test(ruleId)) {
    return NextResponse.json(
      { error: "rule_id is required (A-Z, 0-9, _ only)." },
      { status: 400 }
    );
  }

  const hosts = Array.isArray(body.hosts)
    ? body.hosts.filter((h): h is string => typeof h === "string" && h.trim().length > 0).map((h) => h.trim().toLowerCase())
    : [];
  if (hosts.length === 0) {
    return NextResponse.json({ error: "At least one host is required." }, { status: 400 });
  }

  const insert = {
    rule_id: ruleId,
    hosts,
    apply_entry_hints: Array.isArray(body.apply_entry_hints)
      ? (body.apply_entry_hints as unknown[]).filter((h): h is string => typeof h === "string")
      : [],
    submit_hints: Array.isArray(body.submit_hints)
      ? (body.submit_hints as unknown[]).filter((h): h is string => typeof h === "string")
      : [],
    requires_apply_entry: Boolean(body.requires_apply_entry),
    prefer_popup_handoff: Boolean(body.prefer_popup_handoff),
    status:
      typeof body.status === "string" &&
      (VALID_STATUSES as readonly string[]).includes(body.status)
        ? body.status
        : "active",
    priority: Number.isFinite(Number(body.priority)) ? Number(body.priority) : 0,
    notes: typeof body.notes === "string" ? body.notes : null,
    created_by: auth.user.id,
  };

  const { data, error } = await supabaseAdmin
    .from("host_automation_rules")
    .insert(insert)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: `Failed to create rule (${error.message}).` },
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
    targetId: data.id,
    details: { rule_id: ruleId, hosts },
  });

  return NextResponse.json({ rule: data }, { status: 201 });
}
