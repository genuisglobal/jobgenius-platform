/**
 * Server-side Authentication Utilities
 *
 * Handles authentication using Supabase Auth.
 */

import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type {
  AuthUser,
  UserType,
  AuthResult,
  Session,
  AccountManager,
  JobSeeker,
} from "./types";
import { normalizeAMRole } from "./roles";

// Supabase clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getJwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(payload, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as { role?: string };
    return typeof parsed.role === "string" ? parsed.role : null;
  } catch {
    return null;
  }
}

const serviceKeyRole = getJwtRole(supabaseServiceKey);
const serviceKeyPrefix = supabaseServiceKey.slice(0, 6);
if (!serviceKeyRole) {
  console.warn("SUPABASE_SERVICE_ROLE_KEY missing role claim", { serviceKeyPrefix });
} else if (serviceKeyRole !== "service_role") {
  console.error("SUPABASE_SERVICE_ROLE_KEY is not service_role", {
    role: serviceKeyRole,
    serviceKeyPrefix,
  });
}

const adminHeaders = {
  Authorization: `Bearer ${supabaseServiceKey}`,
  apikey: supabaseServiceKey,
};

// Service client for admin operations
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  global: {
    headers: adminHeaders,
    fetch: (url: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers ?? {});
      if (!headers.has("Authorization")) {
        headers.set("Authorization", adminHeaders.Authorization);
      }
      if (!headers.has("apikey")) {
        headers.set("apikey", adminHeaders.apikey);
      }
      return fetch(url, { ...init, headers, cache: 'no-store' });
    },
  },
});

// Cookie names
const ACCESS_TOKEN_COOKIE = "jg_access_token";
const REFRESH_TOKEN_COOKIE = "jg_refresh_token";
const USER_TYPE_COOKIE = "jg_user_type";

/**
 * Create a Supabase client with the user's session
 */
export function createAuthClient() {
  const cookieStore = cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : undefined,
      fetch: (url: RequestInfo | URL, init?: RequestInit) => {
        return fetch(url, { ...init, cache: 'no-store' });
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Get the current user from the session cookie
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const userType = cookieStore.get(USER_TYPE_COOKIE)?.value as UserType | undefined;

  if (!accessToken) {
    return null;
  }

  try {
    // Verify the token with Supabase
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (error || !user) {
      return null;
    }

    // Look up the user in our tables
    const authUser = await getUserByAuthId(user.id, userType);
    return authUser;
  } catch {
    return null;
  }
}

/**
 * Get user by Supabase auth ID
 */
export async function getUserByAuthId(
  authId: string,
  preferredType?: UserType
): Promise<AuthUser | null> {
  // Try preferred type first if specified
  if (preferredType === "am") {
    const am = await getAccountManagerByAuthId(authId);
    if (am) {
      return {
        id: am.id,
        email: am.email,
        name: am.name ?? undefined,
        userType: "am",
        role: normalizeAMRole(am.role),
        status: am.status,
        amCode: am.am_code ?? undefined,
      };
    }
  }

  if (preferredType === "job_seeker") {
    const js = await getJobSeekerByAuthId(authId);
    if (js) {
      return {
        id: js.id,
        email: js.email,
        name: js.full_name ?? undefined,
        userType: "job_seeker",
      };
    }
  }

  // Try both if no preferred type or preferred type not found
  const am = await getAccountManagerByAuthId(authId);
  if (am) {
    return {
      id: am.id,
      email: am.email,
      name: am.name ?? undefined,
      userType: "am",
      role: normalizeAMRole(am.role),
      status: am.status,
      amCode: am.am_code ?? undefined,
    };
  }

  const js = await getJobSeekerByAuthId(authId);
  if (js) {
    return {
      id: js.id,
      email: js.email,
      name: js.full_name ?? undefined,
      userType: "job_seeker",
    };
  }

  return null;
}

/**
 * Get account manager by auth ID
 */
async function getAccountManagerByAuthId(
  authId: string
): Promise<AccountManager | null> {
  const { data, error } = await supabaseAdmin
    .from("account_managers")
    .select("*")
    .eq("auth_id", authId)
    .single();

  if (error || !data) return null;
  return data as AccountManager;
}

/**
 * Get job seeker by auth ID
 */
async function getJobSeekerByAuthId(
  authId: string
): Promise<JobSeeker | null> {
  const { data, error } = await supabaseAdmin
    .from("job_seekers")
    .select("*")
    .eq("auth_id", authId)
    .single();

  if (error || !data) return null;
  return data as JobSeeker;
}

/**
 * Get account manager by email
 */
export async function getAccountManagerByEmail(
  email: string
): Promise<AccountManager | null> {
  const { data, error } = await supabaseAdmin
    .from("account_managers")
    .select("*")
    .eq("email", email)
    .single();

  if (error || !data) return null;
  return data as AccountManager;
}

/**
 * Get job seeker by email
 */
export async function getJobSeekerByEmail(
  email: string
): Promise<JobSeeker | null> {
  const { data, error } = await supabaseAdmin
    .from("job_seekers")
    .select("*")
    .eq("email", email)
    .single();

  if (error || !data) return null;
  return data as JobSeeker;
}

/**
 * Sign up a new user
 */
export async function signUp(
  email: string,
  password: string,
  userType: UserType,
  metadata?: { name?: string }
): Promise<AuthResult> {
  if (serviceKeyRole !== "service_role") {
    return {
      success: false,
      error: "Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY must be service_role.",
    };
  }
  // Check if email already exists in the appropriate table
  if (userType === "am") {
    const existing = await getAccountManagerByEmail(email);
    if (existing?.auth_id) {
      return { success: false, error: "An account with this email already exists." };
    }
  } else {
    const existing = await getJobSeekerByEmail(email);
    if (existing?.auth_id) {
      return { success: false, error: "An account with this email already exists." };
    }
  }

  // Create Supabase auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // Auto-confirm for now
    user_metadata: {
      user_type: userType,
      name: metadata?.name,
    },
  });

  if (authError || !authData.user) {
    return { success: false, error: authError?.message ?? "Failed to create account." };
  }

  const rollbackAuthUser = async (reason: string, details?: unknown) => {
    console.error("Auth link failed", { reason, email, details });
    try {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    } catch (deleteError) {
      console.error("Failed to delete auth user after link failure", {
        userId: authData.user.id,
        deleteError,
      });
    }
  };

  // Link auth user to our table
  let user: AuthUser;

  if (userType === "am") {
    // Check if AM record exists (might be pre-created)
    const existing = await getAccountManagerByEmail(email);
    if (existing) {
      // Update existing record with auth_id
      const { data: updatedAm, error: linkError } = await supabaseAdmin
        .from("account_managers")
        .update({ auth_id: authData.user.id, name: metadata?.name ?? existing.name })
        .eq("id", existing.id)
        .select()
        .single();
      if (linkError || !updatedAm) {
        await rollbackAuthUser("account_managers update failed", linkError);
        return { success: false, error: `Failed to link account: ${linkError?.message ?? "No data returned"}` };
      }
      user = { id: updatedAm.id, email: updatedAm.email, name: updatedAm.name ?? undefined, userType: "am", role: updatedAm.role, status: updatedAm.status, amCode: updatedAm.am_code ?? undefined };
    } else {
      // Create new AM record (status defaults to 'pending', am_code auto-generated by trigger)
      const { data: insertedAm, error: linkError } = await supabaseAdmin
        .from("account_managers")
        .insert({
          email,
          name: metadata?.name,
          auth_id: authData.user.id,
          role: "am",
        })
        .select()
        .single();
      if (linkError || !insertedAm) {
        await rollbackAuthUser("account_managers insert failed", linkError);
        return { success: false, error: `Failed to link account: ${linkError?.message ?? "No data returned"}` };
      }
      user = { id: insertedAm.id, email: insertedAm.email, name: insertedAm.name ?? undefined, userType: "am", role: insertedAm.role, status: insertedAm.status, amCode: insertedAm.am_code ?? undefined };
    }
  } else {
    // Check if job seeker record exists (might be pre-created by AM)
    const existing = await getJobSeekerByEmail(email);
    if (existing) {
      // Update existing record with auth_id
      const { data: updatedJs, error: linkError } = await supabaseAdmin
        .from("job_seekers")
        .update({ auth_id: authData.user.id, full_name: metadata?.name ?? existing.full_name })
        .eq("id", existing.id)
        .select()
        .single();
      if (linkError || !updatedJs) {
        await rollbackAuthUser("job_seekers update failed", linkError);
        return { success: false, error: `Failed to link account: ${linkError?.message ?? "No data returned"}` };
      }
      user = { id: updatedJs.id, email: updatedJs.email, name: updatedJs.full_name ?? undefined, userType: "job_seeker" };
    } else {
      // Create new job seeker record
      const { data: insertedJs, error: linkError } = await supabaseAdmin
        .from("job_seekers")
        .insert({
          email,
          full_name: metadata?.name,
          auth_id: authData.user.id,
          status: "active",
        })
        .select()
        .single();
      if (linkError || !insertedJs) {
        await rollbackAuthUser("job_seekers insert failed", linkError);
        return { success: false, error: `Failed to link account: ${linkError?.message ?? "No data returned"}` };
      }
      user = { id: insertedJs.id, email: insertedJs.email, name: insertedJs.full_name ?? undefined, userType: "job_seeker" };
    }
  }

  // Fallback verification — should not be needed since we use .select() above,
  // but kept as a safety net
  if (!user) {
    const fallbackUser = await getUserByAuthId(authData.user.id, userType);
    if (!fallbackUser) {
      await rollbackAuthUser("getUserByAuthId returned null after link", { authId: authData.user.id, userType });
      return { success: false, error: "Failed to link account." };
    }
    user = fallbackUser;
  }

  return {
    success: true,
    user,
  };
}

/**
 * Sign in a user
 */
export async function signIn(
  email: string,
  password: string
): Promise<AuthResult> {
  // Sign in with Supabase
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user || !data.session) {
    return { success: false, error: error?.message ?? "Invalid credentials." };
  }

  // Get user from our tables
  const preferredType =
    data.user.user_metadata?.user_type === "am" ||
    data.user.user_metadata?.user_type === "job_seeker"
      ? (data.user.user_metadata.user_type as UserType)
      : undefined;

  let user = await getUserByAuthId(data.user.id, preferredType);
  if (!user) {
    user = await linkUserByEmail({
      authId: data.user.id,
      email: data.user.email ?? email,
      preferredType,
      name:
        typeof data.user.user_metadata?.name === "string"
          ? data.user.user_metadata.name
          : undefined,
    });
  }

  if (!user) {
    return { success: false, error: "User account not found." };
  }

  // Update last login
  if (user.userType === "am") {
    await supabaseAdmin
      .from("account_managers")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", user.id);
  } else {
    await supabaseAdmin
      .from("job_seekers")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", user.id);
  }

  const session: Session = {
    user,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? Date.now() / 1000 + 3600,
  };

  return { success: true, user, session };
}

async function linkUserByEmail({
  authId,
  email,
  preferredType,
  name,
}: {
  authId: string;
  email: string;
  preferredType?: UserType;
  name?: string;
}): Promise<AuthUser | null> {
  if (preferredType === "am") {
    return linkAccountManagerByEmail(authId, email, name);
  }
  if (preferredType === "job_seeker") {
    return linkJobSeekerByEmail(authId, email, name);
  }

  const am = await linkAccountManagerByEmail(authId, email, name);
  if (am) return am;
  return linkJobSeekerByEmail(authId, email, name);
}

async function linkAccountManagerByEmail(
  authId: string,
  email: string,
  name?: string
): Promise<AuthUser | null> {
  const { data: am, error } = await supabaseAdmin
    .from("account_managers")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (error || !am) return null;

  if (am.auth_id && am.auth_id !== authId) {
    console.error("Account manager already linked to another auth user", {
      email,
      authId,
      existingAuthId: am.auth_id,
    });
    return null;
  }

  if (!am.auth_id || (name && !am.name)) {
    const { data: updatedAm, error: updateError } = await supabaseAdmin
      .from("account_managers")
      .update({
        auth_id: am.auth_id ?? authId,
        name: am.name ?? name ?? null,
      })
      .eq("id", am.id)
      .select()
      .single();

    if (updateError || !updatedAm) {
      console.error("Failed to link account manager by email", {
        email,
        authId,
        updateError,
      });
      return null;
    }

    return {
      id: updatedAm.id,
      email: updatedAm.email,
      name: updatedAm.name ?? undefined,
      userType: "am",
      role: updatedAm.role,
      status: updatedAm.status,
      amCode: updatedAm.am_code ?? undefined,
    };
  }

  return {
    id: am.id,
    email: am.email,
    name: am.name ?? undefined,
    userType: "am",
    role: am.role,
    status: am.status,
    amCode: am.am_code ?? undefined,
  };
}

async function linkJobSeekerByEmail(
  authId: string,
  email: string,
  name?: string
): Promise<AuthUser | null> {
  const { data: js, error } = await supabaseAdmin
    .from("job_seekers")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (error || !js) return null;

  if (js.auth_id && js.auth_id !== authId) {
    console.error("Job seeker already linked to another auth user", {
      email,
      authId,
      existingAuthId: js.auth_id,
    });
    return null;
  }

  if (!js.auth_id || (name && !js.full_name)) {
    const { data: updatedJs, error: updateError } = await supabaseAdmin
      .from("job_seekers")
      .update({
        auth_id: js.auth_id ?? authId,
        full_name: js.full_name ?? name ?? null,
      })
      .eq("id", js.id)
      .select()
      .single();

    if (updateError || !updatedJs) {
      console.error("Failed to link job seeker by email", {
        email,
        authId,
        updateError,
      });
      return null;
    }

    return {
      id: updatedJs.id,
      email: updatedJs.email,
      name: updatedJs.full_name ?? undefined,
      userType: "job_seeker",
    };
  }

  return {
    id: js.id,
    email: js.email,
    name: js.full_name ?? undefined,
    userType: "job_seeker",
  };
}

/**
 * Sign out a user
 */
export async function signOut(accessToken: string): Promise<void> {
  await supabaseAdmin.auth.admin.signOut(accessToken);
}

/**
 * Refresh a session
 */
export async function refreshSession(refreshToken: string): Promise<AuthResult> {
  const { data, error } = await supabaseAdmin.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.user || !data.session) {
    return { success: false, error: "Session expired. Please log in again." };
  }

  const user = await getUserByAuthId(data.user.id);
  if (!user) {
    return { success: false, error: "User not found." };
  }

  const session: Session = {
    user,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? Date.now() / 1000 + 3600,
  };

  return { success: true, user, session };
}

/**
 * Initiate password reset
 */
export async function initiatePasswordReset(
  email: string,
  redirectTo?: string
): Promise<{ success: boolean; error?: string }> {
  // Prefer an explicit per-request origin (passed by the API route); fall back
  // to NEXT_PUBLIC_APP_URL, then the production URL. The path must match the
  // actual route — `/reset-password`, not `/auth/reset-password`.
  const fallbackBase =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://job-genius.com";
  const target = redirectTo ?? `${fallbackBase}/reset-password`;
  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
    redirectTo: target,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Update password with reset token
 */
export async function updatePassword(
  accessToken: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  // Create a client with the access token
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Check if a user has access to a job seeker
 */
export async function hasJobSeekerAccess(
  userId: string,
  userType: UserType,
  jobSeekerId: string
): Promise<boolean> {
  // Job seekers can only access themselves
  if (userType === "job_seeker") {
    return userId === jobSeekerId;
  }

  // Admins and super admins can access all job seekers
  const { data: am } = await supabaseAdmin
    .from("account_managers")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (am?.role === "admin" || am?.role === "superadmin") {
    return true;
  }

  // Account managers can access their assigned job seekers
  const { data, error } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("id")
    .eq("account_manager_id", userId)
    .eq("job_seeker_id", jobSeekerId)
    .maybeSingle();

  return !error && data !== null;
}

/**
 * Get all job seekers assigned to an account manager
 */
export async function getAssignedJobSeekers(accountManagerId: string): Promise<JobSeeker[]> {
  const { data, error } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("job_seekers(*)")
    .eq("account_manager_id", accountManagerId);

  if (error || !data) return [];

  return data
    .map((row) => row.job_seekers as unknown as JobSeeker | null)
    .filter((js): js is JobSeeker => js !== null);
}
