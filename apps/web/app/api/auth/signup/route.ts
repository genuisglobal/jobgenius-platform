import { cookies } from "next/headers";
import { signUp, signIn } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";
import type { UserType } from "@/lib/auth";
import { normalizeOfferCode } from "@/lib/offers";
import { enforceRateLimit } from "@/lib/rate-limit";

const ACCESS_TOKEN_COOKIE = "jg_access_token";
const REFRESH_TOKEN_COOKIE = "jg_refresh_token";
const USER_TYPE_COOKIE = "jg_user_type";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

type ResumePrefillPayload = {
  full_name?: string;
  phone?: string;
  location?: string;
  linkedin_url?: string;
  bio?: string;
  skills?: string[];
  work_history?: unknown[];
  education?: unknown[];
  raw_text?: string;
};

type JobSeekerProfilePrefill = {
  location?: string;
  phone?: string;
  bio?: string;
  linkedin_url?: string;
  address_line1?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  address_country?: string;
  target_titles?: string[];
  work_type?: string;
  work_type_preferences?: string[];
  employment_type_preferences?: string[];
  preferred_locations?: string[];
  preferred_industries?: string[];
  salary_min?: number;
  salary_max?: number;
  years_experience?: number;
  open_to_relocation?: boolean;
  available_for_travel?: boolean;
  authorized_to_work?: boolean;
  requires_visa_sponsorship?: boolean;
  citizenship_status?: string;
  non_compete_subject?: boolean;
};

type SignUpPayload = {
  email: string;
  password: string;
  name?: string;
  userType?: UserType;
  inviteToken?: string;
  referralCode?: string;
  offerCode?: string;
  resume?: ResumePrefillPayload;
  profile?: JobSeekerProfilePrefill;
};

function toText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return undefined;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function isLeadIntakeMissingError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const row = error as { code?: string; message?: string; details?: string };
  const code = String(row.code ?? "");
  const text = `${row.message ?? ""} ${row.details ?? ""}`.toLowerCase();
  return (
    code === "42P01" ||
    code === "42703" ||
    text.includes("lead_intake_submissions")
  );
}

/**
 * POST /api/auth/signup
 *
 * Creates a new user account.
 * By default creates account manager accounts.
 * Job seekers are typically pre-created by AMs and just need to set password.
 */
export async function POST(request: Request) {
  let payload: SignUpPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  const {
    email,
    password,
    name,
    userType = "am",
    inviteToken,
    referralCode,
    offerCode,
    resume,
    profile,
  } = payload;
  const normalizedOfferCode = normalizeOfferCode(offerCode ?? referralCode);

  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "unknown";

  const signupRateLimit = await enforceRateLimit({
    request,
    scope: "auth_signup",
    identifier: normalizedEmail,
    limit: 5,
    windowSeconds: 60,
    blockSeconds: 120,
  });

  if (!signupRateLimit.allowed) {
    return Response.json(
      { success: false, error: "Too many signup attempts. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, signupRateLimit.retryAfterSeconds)) },
      }
    );
  }

  if (!email || !password) {
    return Response.json(
      { success: false, error: "Email and password are required." },
      { status: 400 }
    );
  }

  // Validate password strength
  if (password.length < 8) {
    return Response.json(
      { success: false, error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return Response.json(
      { success: false, error: "Invalid email format." },
      { status: 400 }
    );
  }

  // Create the user
  const result = await signUp(email, password, userType, { name });

  if (!result.success) {
    return Response.json(
      { success: false, error: result.error ?? "Signup failed." },
      { status: 400 }
    );
  }

  // Auto-login after signup
  const loginResult = await signIn(email, password);

  if (loginResult.success && loginResult.session) {
    const cookieStore = cookies();

    cookieStore.set(ACCESS_TOKEN_COOKIE, loginResult.session.accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 60 * 60, // 1 hour
    });

    if (loginResult.session.refreshToken) {
      cookieStore.set(REFRESH_TOKEN_COOKIE, loginResult.session.refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
    }

    cookieStore.set(USER_TYPE_COOKIE, result.user!.userType, {
      ...COOKIE_OPTIONS,
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  // Apply parsed-resume prefill to the new job seeker (best-effort, non-fatal)
  if (result.user?.userType === "job_seeker" && (resume || profile)) {
    const updates: Record<string, unknown> = {};
    if (normalizedOfferCode) updates.offer_code = normalizedOfferCode;
    if (profile) {
      const profileUpdates: Record<string, unknown> = {
        location: toText(profile.location),
        phone: toText(profile.phone),
        bio: toText(profile.bio),
        linkedin_url: toText(profile.linkedin_url),
        address_line1: toText(profile.address_line1),
        address_city: toText(profile.address_city),
        address_state: toText(profile.address_state),
        address_zip: toText(profile.address_zip),
        address_country: toText(profile.address_country),
        target_titles: toStringArray(profile.target_titles),
        work_type: toText(profile.work_type),
        work_type_preferences: toStringArray(profile.work_type_preferences),
        employment_type_preferences: toStringArray(profile.employment_type_preferences),
        preferred_locations: toStringArray(profile.preferred_locations),
        preferred_industries: toStringArray(profile.preferred_industries),
        salary_min: toNumber(profile.salary_min),
        salary_max: toNumber(profile.salary_max),
        years_experience: toNumber(profile.years_experience),
        open_to_relocation: toBoolean(profile.open_to_relocation),
        available_for_travel: toBoolean(profile.available_for_travel),
        authorized_to_work: toBoolean(profile.authorized_to_work),
        requires_visa_sponsorship: toBoolean(profile.requires_visa_sponsorship),
        citizenship_status: toText(profile.citizenship_status),
        non_compete_subject: toBoolean(profile.non_compete_subject),
      };

      Object.entries(profileUpdates).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          updates[key] = value;
        }
      });
    }
    if (resume) {
      if (!updates.phone && resume.phone && typeof resume.phone === "string") {
        updates.phone = resume.phone;
      }
      if (!updates.linkedin_url && resume.linkedin_url && typeof resume.linkedin_url === "string") {
        updates.linkedin_url = resume.linkedin_url;
      }
      if (Array.isArray(resume.work_history) && resume.work_history.length > 0) {
        updates.work_history = resume.work_history;
      }
      if (Array.isArray(resume.education) && resume.education.length > 0) {
        updates.education = resume.education;
      }
      if (resume.raw_text && typeof resume.raw_text === "string") {
        updates.resume_text = resume.raw_text.slice(0, 50000);
      }
    }

    if (Object.keys(updates).length > 0) {
      const { error: prefillError } = await supabaseAdmin
        .from("job_seekers")
        .update(updates)
        .eq("id", result.user.id);

      if (prefillError) {
        console.error("Resume prefill on signup failed (non-fatal):", prefillError);
      }
    }
  } else if (result.user?.userType === "job_seeker" && normalizedOfferCode) {
    const { error: offerCodeError } = await supabaseAdmin
      .from("job_seekers")
      .update({ offer_code: normalizedOfferCode })
      .eq("id", result.user.id);

    if (offerCodeError) {
      console.error("Offer code save on signup failed (non-fatal):", offerCodeError);
    }
  }

  if (result.user?.userType === "job_seeker") {
    const nowIso = new Date().toISOString();
    try {
      const { data: existingLead, error: existingLeadError } = await supabaseAdmin
        .from("lead_intake_submissions")
        .select("id")
        .ilike("email", email.toLowerCase())
        .limit(1)
        .maybeSingle();

      if (existingLeadError && !isLeadIntakeMissingError(existingLeadError)) {
        console.error("Lead intake lookup failed:", existingLeadError);
      } else if (!existingLead?.id) {
        const { error: insertLeadError } = await supabaseAdmin
          .from("lead_intake_submissions")
          .insert({
            source: "signup",
            status: "new",
            full_name: name?.trim() || null,
            email: email.toLowerCase(),
            phone: null,
            consent_voice: false,
            consent_marketing: false,
            metadata: {
              source_route: "/api/auth/signup",
            },
            created_at: nowIso,
            updated_at: nowIso,
          });

        if (insertLeadError && !isLeadIntakeMissingError(insertLeadError)) {
          console.error("Lead intake insert failed:", insertLeadError);
        }
      }
    } catch (err) {
      if (!isLeadIntakeMissingError(err)) {
        console.error("Lead intake sync on signup failed:", err);
      }
    }
  }

  // Process referral (job_seeker signups only, non-fatal)
  if (result.user?.userType === "job_seeker" && normalizedOfferCode) {
    try {
      const { getReferrerByCode, createReferral } = await import("@/lib/referrals");
      const referrerId = await getReferrerByCode(normalizedOfferCode);
      const newSeekerId = result.user.id;
      if (referrerId && referrerId !== newSeekerId) {
        await createReferral(referrerId, newSeekerId);
      }
    } catch (err) {
      console.error("Referral processing error (non-fatal):", err);
    }
  }

  return Response.json({
    success: true,
    user: {
      id: result.user!.id,
      email: result.user!.email,
      name: result.user!.name,
      userType: result.user!.userType,
    },
  });
}
