import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { requireExtensionAdmin } from "@/lib/extension-admin";
import { GLOBAL_APPLY_KEY, atsPolicyKey } from "@/lib/apply/kill-switch";

/**
 * POST /api/extension/admin/kill-switch
 *
 * Flip an automation kill-switch from the extension. Mirrors
 * /api/admin/automation-policies (missing row = enabled; disabling raises a
 * MEDIUM ops_alert) but authenticates via the extension admin gate.
 *
 * Body: { key, enabled, note? }
 */
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

export async function POST(request: Request) {
  const gate = await requireExtensionAdmin(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
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
      updated_by: gate.accountManagerId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  if (error) {
    return NextResponse.json({ error: "Failed to save policy." }, { status: 500 });
  }

  // Same audit trail as the dashboard switchboard: a halt is worth alerting on.
  if (!payload.enabled) {
    await supabaseAdmin.from("ops_alerts").insert({
      severity: "MEDIUM",
      type: "AUTOMATION_HALTED",
      message: `Automation switch ${key} was DISABLED by an admin (via extension).`,
      meta: { key, note: payload.note ?? null, updated_by: gate.accountManagerId },
      created_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ success: true });
}
