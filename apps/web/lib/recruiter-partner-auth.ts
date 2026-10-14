import crypto from "crypto";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/auth";

export const RECRUITER_PARTNER_SESSION_COOKIE = "jg_partner_session";

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

type RecruiterWorkspaceSession = {
  sessionId: string;
  recruiterId: string;
  expiresAt: string;
};

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createRecruiterWorkspaceMagicLink({
  recruiterId,
  roleRequestId,
  sentToEmail,
  createdBy,
  origin,
}: {
  recruiterId: string;
  roleRequestId?: string | null;
  sentToEmail?: string | null;
  createdBy?: string | null;
  origin: string;
}) {
  const rawToken = crypto.randomBytes(24).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("recruiter_magic_links")
    .insert({
      recruiter_id: recruiterId,
      role_request_id: roleRequestId ?? null,
      token_hash: tokenHash,
      sent_to_email: sentToEmail ?? null,
      expires_at: expiresAt,
      created_by: createdBy ?? null,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw error ?? new Error("Failed to create recruiter magic link.");
  }

  return {
    magicLinkId: data.id as string,
    url: `${origin}/hire/partner/access/${rawToken}`,
    expiresAt,
  };
}

export async function consumeRecruiterWorkspaceMagicLink(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const nowIso = new Date().toISOString();

  const { data: magicLink } = await supabaseAdmin
    .from("recruiter_magic_links")
    .select("id, recruiter_id, role_request_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!magicLink?.id) {
    return { state: "invalid" as const };
  }

  if (magicLink.used_at) {
    return { state: "used" as const };
  }

  if (new Date(magicLink.expires_at).getTime() <= Date.now()) {
    return { state: "expired" as const };
  }

  const { data: updatedLink } = await supabaseAdmin
    .from("recruiter_magic_links")
    .update({ used_at: nowIso })
    .eq("id", magicLink.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();

  if (!updatedLink?.id) {
    return { state: "used" as const };
  }

  const sessionToken = crypto.randomBytes(32).toString("hex");
  const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: sessionRow, error: sessionError } = await supabaseAdmin
    .from("recruiter_partner_sessions")
    .insert({
      recruiter_id: magicLink.recruiter_id,
      magic_link_id: magicLink.id,
      token_hash: hashToken(sessionToken),
      expires_at: sessionExpiresAt,
    })
    .select("id")
    .single();

  if (sessionError || !sessionRow?.id) {
    throw sessionError ?? new Error("Failed to create recruiter workspace session.");
  }

  return {
    state: "ready" as const,
    recruiterId: magicLink.recruiter_id as string,
    sessionToken,
    sessionExpiresAt,
    magicLinkId: magicLink.id as string,
  };
}

export async function setRecruiterPartnerSessionCookie({
  rawToken,
  expiresAt,
}: {
  rawToken: string;
  expiresAt: string;
}) {
  const cookieStore = cookies();
  const maxAgeSeconds = Math.max(
    60,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
  );

  cookieStore.set(RECRUITER_PARTNER_SESSION_COOKIE, rawToken, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: maxAgeSeconds,
  });
}

export async function clearRecruiterPartnerSessionCookie() {
  const cookieStore = cookies();
  cookieStore.delete(RECRUITER_PARTNER_SESSION_COOKIE);
}

async function getRecruiterWorkspaceSessionByRawToken(
  rawToken: string
): Promise<RecruiterWorkspaceSession | null> {
  const { data: session } = await supabaseAdmin
    .from("recruiter_partner_sessions")
    .select("id, recruiter_id, expires_at")
    .eq("token_hash", hashToken(rawToken))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!session?.id || !session.recruiter_id) {
    return null;
  }

  supabaseAdmin
    .from("recruiter_partner_sessions")
    .update({ last_active_at: new Date().toISOString() })
    .eq("id", session.id)
    .then(() => {});

  return {
    sessionId: session.id as string,
    recruiterId: session.recruiter_id as string,
    expiresAt: session.expires_at as string,
  };
}

export async function getCurrentRecruiterPartnerSession() {
  const cookieStore = cookies();
  const rawToken = cookieStore.get(RECRUITER_PARTNER_SESSION_COOKIE)?.value;

  if (!rawToken) {
    return null;
  }

  return getRecruiterWorkspaceSessionByRawToken(rawToken);
}

export async function requireRecruiterPartnerSession() {
  const session = await getCurrentRecruiterPartnerSession();
  if (!session) {
    return {
      authenticated: false as const,
      error: "Recruiter partner session required.",
      status: 401,
    };
  }

  return {
    authenticated: true as const,
    recruiterId: session.recruiterId,
    sessionId: session.sessionId,
    expiresAt: session.expiresAt,
  };
}
