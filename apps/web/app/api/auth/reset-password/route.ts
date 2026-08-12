import { initiatePasswordReset, updatePassword } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";

type ResetRequestPayload = {
  email: string;
};

type UpdatePasswordPayload = {
  accessToken: string;
  newPassword: string;
};

/**
 * POST /api/auth/reset-password
 *
 * Initiates password reset by sending an email.
 */
export async function POST(request: Request) {
  let payload: ResetRequestPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  const { email } = payload;

  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "unknown";

  const resetRateLimit = await enforceRateLimit({
    request,
    scope: "auth_reset_password",
    identifier: normalizedEmail,
    limit: 5,
    windowSeconds: 60,
    blockSeconds: 120,
  });

  if (!resetRateLimit.allowed) {
    return Response.json(
      { success: false, error: "Too many reset attempts. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, resetRateLimit.retryAfterSeconds)) },
      }
    );
  }

  if (!email) {
    return Response.json(
      { success: false, error: "Email is required." },
      { status: 400 }
    );
  }

  // Build the reset link target from the actual request origin so it works in
  // every environment (prod, preview, local) without relying on an env var.
  // NOTE: this URL must also be in the Supabase project's Redirect URLs
  // allow-list, otherwise Supabase ignores it and falls back to the Site URL.
  const origin =
    request.headers.get("origin") ||
    (() => {
      const host = request.headers.get("host");
      if (!host) return null;
      const proto = host.startsWith("localhost") ? "http" : "https";
      return `${proto}://${host}`;
    })();
  const redirectTo = origin ? `${origin}/reset-password` : undefined;

  const result = await initiatePasswordReset(email, redirectTo);

  if (!result.success) {
    // Don't reveal if email exists or not
    return Response.json({ success: true });
  }

  return Response.json({ success: true });
}

/**
 * PUT /api/auth/reset-password
 *
 * Updates password using the reset token.
 * The accessToken is provided after the user clicks the reset link.
 */
export async function PUT(request: Request) {
  const updateRateLimit = await enforceRateLimit({
    request,
    scope: "auth_update_password",
    identifier: "global",
    limit: 5,
    windowSeconds: 60,
    blockSeconds: 120,
  });

  if (!updateRateLimit.allowed) {
    return Response.json(
      { success: false, error: "Too many password update attempts. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, updateRateLimit.retryAfterSeconds)) },
      }
    );
  }

  let payload: UpdatePasswordPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  const { accessToken, newPassword } = payload;

  if (!accessToken || !newPassword) {
    return Response.json(
      { success: false, error: "Access token and new password are required." },
      { status: 400 }
    );
  }

  if (newPassword.length < 8) {
    return Response.json(
      { success: false, error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const result = await updatePassword(accessToken, newPassword);

  if (!result.success) {
    return Response.json(
      { success: false, error: result.error ?? "Failed to update password." },
      { status: 400 }
    );
  }

  return Response.json({ success: true });
}
