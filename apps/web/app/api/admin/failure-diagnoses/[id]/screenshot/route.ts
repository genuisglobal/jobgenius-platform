import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";

/**
 * GET /api/admin/failure-diagnoses/[id]/screenshot
 * Returns a short-lived signed URL for the diagnosis's screenshot.
 * Used by the review page <img> tags so we don't have to make the bucket public.
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data: diagnosis } = await supabaseAdmin
    .from("failure_diagnoses")
    .select("screenshot_path")
    .eq("id", params.id)
    .maybeSingle();
  if (!diagnosis?.screenshot_path) {
    return NextResponse.json({ error: "No screenshot on file." }, { status: 404 });
  }

  const { data } = await supabaseAdmin.storage
    .from("runner-screenshots")
    .createSignedUrl(diagnosis.screenshot_path, 60 * 10);
  if (!data?.signedUrl) {
    return NextResponse.json({ error: "Failed to sign URL." }, { status: 500 });
  }

  return NextResponse.json({ signedUrl: data.signedUrl });
}
