import { NextResponse } from "next/server";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { GLOBAL_APPLY_KEY, atsPolicyKey } from "@/lib/apply/kill-switch";

// The switchboard shown in the admin UI. Missing rows read as enabled.
const KNOWN_ATS = [
  "LINKEDIN",
  "GREENHOUSE",
  "WORKDAY",
  "LEVER",
  "SMARTRECRUITERS",
  "INDEED",
  "GENERIC",
];

function knownKeys(): string[] {
  return [GLOBAL_APPLY_KEY, ...KNOWN_ATS.map((ats) => atsPolicyKey(ats))];
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am" || !isAdminRole(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: rows } = await supabaseAdmin
    .from("automation_policies")
    .select("key, enabled, note, updated_at");
  const byKey = new Map((rows ?? []).map((r) => [r.key as string, r]));

  const policies = knownKeys().map((key) => {
    const row = byKey.get(key);
    return {
      key,
      enabled: row ? Boolean(row.enabled) : true,
      note: (row?.note as string | null) ?? null,
      updated_at: (row?.updated_at as string | null) ?? null,
    };
  });

  return NextResponse.json({ policies });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am" || !isAdminRole(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { key?: string; enabled?: boolean; note?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const key = (payload.key ?? "").trim();
  if (!knownKeys().includes(key)) {
    return NextResponse.json({ error: "Unknown policy key." }, { status: 400 });
  }
  if (typeof payload.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean." }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("automation_policies").upsert(
    {
      key,
      enabled: payload.enabled,
      note: (payload.note ?? "").trim().slice(0, 500) || null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  if (error) {
    return NextResponse.json({ error: "Failed to save policy." }, { status: 500 });
  }

  // Audit trail: halts and re-enables are consequential enough to alert on.
  if (!payload.enabled) {
    await supabaseAdmin.from("ops_alerts").insert({
      severity: "MEDIUM",
      type: "AUTOMATION_HALTED",
      message: `Automation switch ${key} was DISABLED by an admin.`,
      meta: { key, note: payload.note ?? null, updated_by: user.id },
      created_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ success: true });
}
