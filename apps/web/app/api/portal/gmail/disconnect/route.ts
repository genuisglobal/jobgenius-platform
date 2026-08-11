import { NextResponse } from "next/server";
import { requireJobSeeker } from "@/lib/auth/middleware";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * POST /api/portal/gmail/disconnect
 * Disconnects the seeker's Gmail account (soft-delete: sets is_active=false).
 */
export async function POST(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const seekerId = auth.user.id;

  const { error } = await supabaseServer
    .from("seeker_email_connections")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("job_seeker_id", seekerId)
    .eq("provider", "gmail");

  if (error) {
    return NextResponse.json(
      { error: "Failed to disconnect Gmail" },
      { status: 500 }
    );
  }

  // Clear gmail_address on the seeker profile
  const { error: clearGmailError } = await supabaseServer
    .from("job_seekers")
    .update({ gmail_address: null })
    .eq("id", seekerId);

  if (clearGmailError) {
    console.error("[portal:gmail] failed to clear gmail_address:", clearGmailError);
  }

  return NextResponse.json({ success: true });
}
