import { NextResponse } from "next/server";
import { getAccountManagerFromRequest } from "@/lib/am-access";
import { supabaseAdmin } from "@/lib/auth";

/**
 * GET /api/apply/adapter-config?ats=GREENHOUSE
 * Runner pulls the currently-active adapter version for an ATS.
 * Returns { version: null, config: null } when nothing has been
 * promoted — the runner uses its compiled-in defaults in that case.
 *
 * Auth: bearer runner token (same as the rest of /api/apply/*).
 */
export async function GET(request: Request) {
  const auth = await getAccountManagerFromRequest(request.headers);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const url = new URL(request.url);
  const atsType = url.searchParams.get("ats");
  if (!atsType) {
    return NextResponse.json({ error: "ats is required." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("adapter_versions")
    .select("id, ats_type, version, config, notes, promoted_at")
    .eq("ats_type", atsType.toUpperCase())
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({
      ats_type: atsType.toUpperCase(),
      version: null,
      config: null,
    });
  }

  return NextResponse.json({
    ats_type: data.ats_type,
    version: data.version,
    config: data.config,
    notes: data.notes,
    promoted_at: data.promoted_at,
  });
}
