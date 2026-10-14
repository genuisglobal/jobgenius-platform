import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * GET /api/auth/oauth/google/start?userType=job_seeker
 *
 * Kicks off the Google OAuth flow via Supabase. The returned URL points
 * at Google's consent screen; on completion Google redirects back to the
 * Supabase callback, which then redirects to /api/auth/oauth/google/callback.
 *
 * Setup required (one-time):
 * 1. In Supabase Dashboard → Authentication → Providers, enable Google
 *    and add the OAuth client ID + secret from Google Cloud Console.
 * 2. In Google Cloud Console, add this URL to authorized redirects:
 *      https://<your-supabase-project>.supabase.co/auth/v1/callback
 * 3. Set NEXT_PUBLIC_APP_URL in env so the post-auth redirect works.
 */
export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const userType = url.searchParams.get("userType") === "am" ? "am" : "job_seeker";
  const offerCode = url.searchParams.get("offerCode")?.trim().toUpperCase() || null;

  const origin = process.env.NEXT_PUBLIC_APP_URL || `${url.protocol}//${url.host}`;
  const redirectParams = new URLSearchParams({ userType });
  if (offerCode) {
    redirectParams.set("offerCode", offerCode);
  }
  const redirectTo = `${origin}/api/auth/oauth/google/callback?${redirectParams.toString()}`;

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error || !data?.url) {
    console.error("Google OAuth start failed:", error);
    return NextResponse.redirect(
      `${origin}/signup?error=${encodeURIComponent("Could not start Google sign-in.")}`
    );
  }

  return NextResponse.redirect(data.url);
}
