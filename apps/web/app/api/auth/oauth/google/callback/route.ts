import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/auth";
import type { UserType } from "@/lib/auth";
import { normalizeOfferCode } from "@/lib/offers";
import { createReferral, getReferrerByCode } from "@/lib/referrals";

const ACCESS_TOKEN_COOKIE = "jg_access_token";
const REFRESH_TOKEN_COOKIE = "jg_refresh_token";
const USER_TYPE_COOKIE = "jg_user_type";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

/**
 * GET /api/auth/oauth/google/callback?code=...&userType=...
 *
 * Completes the OAuth flow: exchanges the code for a Supabase session,
 * links the auth user to a job_seekers / account_managers row (creating
 * one if needed), sets the jg_* cookies, and redirects to the right home.
 */
export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const url = new URL(request.url);
  const origin = process.env.NEXT_PUBLIC_APP_URL || `${url.protocol}//${url.host}`;
  const code = url.searchParams.get("code");
  const userType: UserType =
    url.searchParams.get("userType") === "am" ? "am" : "job_seeker";
  const normalizedOfferCode = normalizeOfferCode(url.searchParams.get("offerCode"));

  if (!code) {
    return NextResponse.redirect(
      `${origin}/signup?error=${encodeURIComponent("Google sign-in was cancelled.")}`
    );
  }

  // Exchange the OAuth code for a Supabase session
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: exchange, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError || !exchange.session || !exchange.user) {
    console.error("Google OAuth exchange failed:", exchangeError);
    return NextResponse.redirect(
      `${origin}/signup?error=${encodeURIComponent("Google sign-in failed. Please try again.")}`
    );
  }

  const authUser = exchange.user;
  const session = exchange.session;
  const email = authUser.email?.toLowerCase();
  if (!email) {
    return NextResponse.redirect(
      `${origin}/signup?error=${encodeURIComponent("Google account did not return an email.")}`
    );
  }

  const fullName =
    (authUser.user_metadata?.full_name as string | undefined) ||
    (authUser.user_metadata?.name as string | undefined) ||
    null;

  // Link or create the matching row in our app tables
  if (userType === "am") {
    const { data: existing } = await supabaseAdmin
      .from("account_managers")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      if (!existing.auth_id) {
        await supabaseAdmin
          .from("account_managers")
          .update({ auth_id: authUser.id, name: existing.name ?? fullName })
          .eq("id", existing.id);
      }
    } else {
      await supabaseAdmin.from("account_managers").insert({
        email,
        name: fullName,
        auth_id: authUser.id,
        role: "am",
      });
    }
  } else {
    const { data: existing } = await supabaseAdmin
      .from("job_seekers")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    let seekerId = existing?.id as string | undefined;

    if (existing) {
      const seekerUpdates: Record<string, unknown> = {};
      if (!existing.auth_id) {
        seekerUpdates.auth_id = authUser.id;
      }
      if (!existing.full_name && fullName) {
        seekerUpdates.full_name = fullName;
      }
      if (normalizedOfferCode) {
        seekerUpdates.offer_code = normalizedOfferCode;
      }
      if (Object.keys(seekerUpdates).length > 0) {
        await supabaseAdmin
          .from("job_seekers")
          .update(seekerUpdates)
          .eq("id", existing.id);
      }
    } else {
      const { data: insertedSeeker } = await supabaseAdmin
        .from("job_seekers")
        .insert({
          email,
          full_name: fullName,
          auth_id: authUser.id,
          status: "active",
          offer_code: normalizedOfferCode,
        })
        .select("id")
        .single();

      seekerId = insertedSeeker?.id;
    }

    if (seekerId && normalizedOfferCode) {
      const referrerId = await getReferrerByCode(normalizedOfferCode);
      if (referrerId && referrerId !== seekerId) {
        await createReferral(referrerId, seekerId);
      }
    }
  }

  // Set our app cookies
  const cookieStore = cookies();
  cookieStore.set(ACCESS_TOKEN_COOKIE, session.access_token, {
    ...COOKIE_OPTIONS,
    maxAge: 60 * 60,
  });
  if (session.refresh_token) {
    cookieStore.set(REFRESH_TOKEN_COOKIE, session.refresh_token, {
      ...COOKIE_OPTIONS,
      maxAge: 60 * 60 * 24 * 7,
    });
  }
  cookieStore.set(USER_TYPE_COOKIE, userType, {
    ...COOKIE_OPTIONS,
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 7,
  });

  const onboardingParams = new URLSearchParams();
  if (normalizedOfferCode) {
    onboardingParams.set("code", normalizedOfferCode);
  }
  const dest =
    userType === "job_seeker"
      ? `/portal/onboarding${onboardingParams.toString() ? `?${onboardingParams.toString()}` : ""}`
      : "/dashboard";
  return NextResponse.redirect(`${origin}${dest}`);
}
