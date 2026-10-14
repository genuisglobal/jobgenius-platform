import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { isValidTimeZone } from "@/lib/voice/calling-window";

const MAX_BACKGROUND_CHARS = 4000;

/**
 * PATCH /api/admin/leads/[id]
 * Founder/admin edits that steer Emi: background notes for the caller brief,
 * who handles the lead (Emi or the founder), and the lead's timezone.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
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

  const update: Record<string, unknown> = {};

  if ("agent_background" in body) {
    const value = body.agent_background;
    if (value !== null && typeof value !== "string") {
      return NextResponse.json({ error: "agent_background must be text." }, { status: 400 });
    }
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed.length > MAX_BACKGROUND_CHARS) {
      return NextResponse.json(
        { error: `Background is limited to ${MAX_BACKGROUND_CHARS} characters.` },
        { status: 400 }
      );
    }
    update.agent_background = trimmed || null;
  }

  if ("handled_by" in body) {
    if (body.handled_by !== "emi" && body.handled_by !== "founder") {
      return NextResponse.json({ error: "handled_by must be 'emi' or 'founder'." }, { status: 400 });
    }
    update.handled_by = body.handled_by;
  }

  if ("timezone" in body) {
    if (body.timezone !== null && !isValidTimeZone(body.timezone as string)) {
      return NextResponse.json({ error: "timezone must be an IANA zone like America/Chicago." }, { status: 400 });
    }
    update.timezone = body.timezone;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  update.updated_at = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("lead_intake_submissions")
    .update(update)
    .eq("id", params.id)
    .select("id, agent_background, handled_by, timezone")
    .maybeSingle();

  if (error) {
    console.error("Lead update failed:", error);
    return NextResponse.json({ error: "Failed to update the lead." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, lead: data });
}
