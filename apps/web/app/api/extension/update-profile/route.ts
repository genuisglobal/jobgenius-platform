import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { verifyExtensionSession } from "@/lib/extension-auth";

/**
 * POST /api/extension/update-profile
 *
 * Persists an AM's Mode 3 correction of an identity/profile field back to the
 * active seeker's job_seekers row, so the next autofill uses the right value.
 * Screening/demographic answers go through /learn-fields instead; this is only
 * for the seeker's own profile columns (allow-listed below).
 *
 * Body: { key: "email"|"phone"|"location"|"linkedin_url"|"portfolio_url"|
 *              "address_country"|"full_name", value: string, part?: "first"|"last" }
 */

const ALLOWED_COLUMNS = new Set([
  "email",
  "phone",
  "location",
  "linkedin_url",
  "portfolio_url",
  "address_country",
  "full_name",
]);

export async function POST(request: Request) {
  const session = await verifyExtensionSession(request);
  if (!session) {
    return NextResponse.json({ error: "Invalid or expired token." }, { status: 401 });
  }

  const jobSeekerId = session.active_job_seeker_id;
  if (!jobSeekerId) {
    return NextResponse.json({ error: "No active job seeker selected." }, { status: 400 });
  }

  const { data: assignment } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("id")
    .eq("account_manager_id", session.account_manager_id)
    .eq("job_seeker_id", jobSeekerId)
    .maybeSingle();

  if (!assignment) {
    return NextResponse.json({ error: "Not authorized for this job seeker." }, { status: 403 });
  }

  let body: { key?: string; value?: string; part?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const key = String(body.key ?? "").trim();
  const value = String(body.value ?? "").trim();
  if (!ALLOWED_COLUMNS.has(key)) {
    return NextResponse.json({ error: "Field is not updatable." }, { status: 400 });
  }
  if (!value) {
    return NextResponse.json({ error: "Value is required." }, { status: 400 });
  }

  let update: Record<string, string> = { [key]: value };

  // full_name has no separate first/last columns — merge the corrected part into
  // the existing name.
  if (key === "full_name" && (body.part === "first" || body.part === "last")) {
    const { data: seeker } = await supabaseAdmin
      .from("job_seekers")
      .select("full_name")
      .eq("id", jobSeekerId)
      .maybeSingle();
    const parts = String(seeker?.full_name ?? "").trim().split(/\s+/).filter(Boolean);
    if (body.part === "first") {
      const rest = parts.slice(1).join(" ");
      update = { full_name: rest ? `${value} ${rest}` : value };
    } else {
      const first = parts[0] ?? "";
      update = { full_name: first ? `${first} ${value}` : value };
    }
  }

  const { error } = await supabaseAdmin
    .from("job_seekers")
    .update(update)
    .eq("id", jobSeekerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, updated: Object.keys(update)[0] });
}
