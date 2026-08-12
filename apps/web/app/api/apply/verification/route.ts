import { NextResponse } from "next/server";
import { requireOpsAuth } from "@/lib/ops-auth";
import { requireAuth } from "@/lib/auth/middleware";
import { supabaseServer } from "@/lib/supabase/server";
import { GmailClient } from "@/lib/gmail/client";

/**
 * POST /api/apply/verification
 * Called by the runner when it encounters an email verification/OTP during an application.
 * Searches the seeker's connected Gmail for recent verification emails and extracts codes.
 *
 * Body: { job_seeker_id: string, minutes_ago?: number }
 * Returns: { codes: string[], emails: [...] } or { codes: [] } if none found
 */
export async function POST(request: Request) {
  const opsAuth = requireOpsAuth(request.headers, request.url);
  if (!opsAuth.ok) {
    const auth = await requireAuth(request);
    if (!auth.authenticated || auth.user.userType !== "am") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: { job_seeker_id?: string; minutes_ago?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const seekerId = body.job_seeker_id;
  if (!seekerId) {
    return NextResponse.json(
      { error: "Missing job_seeker_id" },
      { status: 400 }
    );
  }

  // Find the seeker's active Gmail connection
  const { data: connection } = await supabaseServer
    .from("seeker_email_connections")
    .select("id")
    .eq("job_seeker_id", seekerId)
    .eq("provider", "gmail")
    .eq("is_active", true)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({
      codes: [],
      error: "No active Gmail connection for this seeker",
    });
  }

  try {
    const client = new GmailClient(connection.id);
    const minutesAgo = body.minutes_ago ?? 10;
    const verificationEmails = await client.findVerificationEmails(minutesAgo);

    // Collect all unique codes across all emails
    const allCodes: string[] = [];
    for (const email of verificationEmails) {
      for (const code of email.codes) {
        if (!allCodes.includes(code)) {
          allCodes.push(code);
        }
      }
    }

    return NextResponse.json({
      codes: allCodes,
      emails: verificationEmails.map((e) => ({
        id: e.id,
        from: e.from,
        subject: e.subject,
        codes: e.codes,
        receivedAt: e.receivedAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("Verification code fetch error:", err);

    // Update connection with error
    const { error: connUpdateError } = await supabaseServer
      .from("seeker_email_connections")
      .update({
        last_error:
          err instanceof Error ? err.message : "Failed to fetch verification",
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    if (connUpdateError) {
      console.error("[apply:verification] failed to update connection error:", connUpdateError);
    }

    return NextResponse.json({
      codes: [],
      error: "Failed to search Gmail for verification codes",
    });
  }
}


