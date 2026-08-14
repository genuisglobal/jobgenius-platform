import { NextResponse } from "next/server";
import crypto from "crypto";
import { exchangeCode, getGoogleEmail } from "@/lib/gmail/oauth";
import { encrypt } from "@/lib/gmail/crypto";
import { supabaseServer } from "@/lib/supabase/server";

const MAX_STATE_AGE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * GET /api/portal/gmail/callback
 * Google OAuth redirect handler. Exchanges code for tokens and stores them.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.WEB_BASE_URL ?? "";
  const profileUrl = `${baseUrl}/portal/profile`;

  if (errorParam) {
    return NextResponse.redirect(
      `${profileUrl}?gmail=error&detail=${encodeURIComponent(errorParam)}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(`${profileUrl}?gmail=error&detail=missing_params`);
  }

  // Verify state token
  const secret = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    return NextResponse.redirect(`${profileUrl}?gmail=error&detail=not_configured`);
  }

  let seekerId: string;
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf-8");
    const parts = decoded.split(":");
    if (parts.length !== 3) throw new Error("Invalid state format");

    const [id, timestamp, hmac] = parts;
    const payload = `${id}:${timestamp}`;
    const expectedHmac = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    if (hmac !== expectedHmac) throw new Error("Invalid state signature");

    const age = Date.now() - parseInt(timestamp, 10);
    if (age > MAX_STATE_AGE_MS) throw new Error("State token expired");

    seekerId = id;
  } catch {
    return NextResponse.redirect(`${profileUrl}?gmail=error&detail=invalid_state`);
  }

  try {
    // Exchange authorization code for tokens
    const tokens = await exchangeCode(code);

    // Get the Gmail address
    const emailAddress = await getGoogleEmail(tokens.access_token);

    // Encrypt tokens before storing
    const accessTokenEnc = encrypt(tokens.access_token);
    const refreshTokenEnc = encrypt(tokens.refresh_token);
    const expiresAt = new Date(
      Date.now() + tokens.expires_in * 1000
    ).toISOString();
    const scopes = tokens.scope.split(" ");

    // Upsert the connection (one per seeker per provider)
    const { error: upsertError } = await supabaseServer
      .from("seeker_email_connections")
      .upsert(
        {
          job_seeker_id: seekerId,
          provider: "gmail",
          email_address: emailAddress,
          access_token_enc: accessTokenEnc,
          refresh_token_enc: refreshTokenEnc,
          token_expires_at: expiresAt,
          scopes,
          is_active: true,
          last_error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "job_seeker_id,provider" }
      );

    if (upsertError) {
      console.error("Gmail connection upsert failed:", upsertError);
      return NextResponse.redirect(
        `${profileUrl}?gmail=error&detail=db_error`
      );
    }

    // Update the seeker's gmail_address field
    const { error: gmailUpdateError } = await supabaseServer
      .from("job_seekers")
      .update({ gmail_address: emailAddress })
      .eq("id", seekerId);

    if (gmailUpdateError) {
      console.error("[portal:gmail] failed to update gmail_address:", gmailUpdateError);
    }

    return NextResponse.redirect(
      `${profileUrl}?gmail=connected&email=${encodeURIComponent(emailAddress)}`
    );
  } catch (err) {
    console.error("Gmail OAuth callback error:", err);
    return NextResponse.redirect(
      `${profileUrl}?gmail=error&detail=token_exchange`
    );
  }
}
