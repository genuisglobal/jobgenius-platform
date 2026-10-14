import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { requireExtensionAdmin } from "@/lib/extension-admin";
import { GLOBAL_APPLY_KEY, atsPolicyKey } from "@/lib/apply/kill-switch";
import { getAdapterHealthStats } from "@/lib/adapter-health";

/**
 * GET /api/extension/admin/overview
 *
 * Admin oversight for the extension: automation kill-switch states, 7-day
 * adapter health, and the pending QA-review count — so an admin can watch and
 * intervene from where the applying happens. Admin-only (extension session).
 * Also serves as the "is this AM an admin?" probe the popup uses to reveal the
 * Admin tab (403 when not).
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

export async function GET(request: Request) {
  const gate = await requireExtensionAdmin(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const [{ data: rows }, health, qa] = await Promise.all([
    supabaseAdmin
      .from("automation_policies")
      .select("key, enabled, note, updated_at"),
    getAdapterHealthStats(7).catch(() => []),
    supabaseAdmin
      .from("qa_reviews")
      .select("id", { count: "exact", head: true })
      .eq("status", "PENDING"),
  ]);

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

  return NextResponse.json({
    policies,
    adapter_health: health,
    qa_pending: qa.count ?? 0,
  });
}
