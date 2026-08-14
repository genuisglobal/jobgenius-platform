import { signUp, supabaseAdmin, requireAdmin } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/auth/admin/create
 *
 * Creates an admin account manager.
 *
 * Authentication: requires either
 *   - An existing admin/superadmin session (cookie or Bearer token)
 *   - The ADMIN_SECRET header matching the ADMIN_SECRET env var (for bootstrapping)
 */
export async function POST(request: Request) {
  const adminCreateRateLimit = await enforceRateLimit({
    request,
    scope: "auth_admin_create",
    identifier: "global",
    limit: 5,
    windowSeconds: 60,
    blockSeconds: 120,
  });

  if (!adminCreateRateLimit.allowed) {
    return Response.json(
      { success: false, error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, adminCreateRateLimit.retryAfterSeconds)) },
      }
    );
  }

  // Check authorization: admin session OR bootstrap secret
  const adminSecret = process.env.ADMIN_SECRET;
  const providedSecret = request.headers.get("x-admin-secret");

  let authorized = false;

  if (adminSecret && providedSecret === adminSecret) {
    // Bootstrap mode: authorized via secret
    authorized = true;
  } else {
    // Session mode: require admin role
    const auth = await requireAdmin(request);
    if (auth.authenticated) {
      authorized = true;
    }
  }

  if (!authorized) {
    return Response.json(
      { success: false, error: "Admin access required. Provide a valid admin session or x-admin-secret header." },
      { status: 403 }
    );
  }

  let payload: { email: string; password: string; name?: string; role?: string };

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  const { email, password, name, role = "admin" } = payload;

  if (!email || !password) {
    return Response.json(
      { success: false, error: "Email and password are required." },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return Response.json(
      { success: false, error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  if (!["admin", "superadmin"].includes(role)) {
    return Response.json(
      { success: false, error: "Role must be 'admin' or 'superadmin'." },
      { status: 400 }
    );
  }

  // Create the account manager via the standard signup flow
  const result = await signUp(email, password, "am", { name });

  if (!result.success || !result.user) {
    return Response.json(
      { success: false, error: result.error ?? "Failed to create admin account." },
      { status: 400 }
    );
  }

  // Upgrade the role from default 'am' to 'admin' or 'superadmin'
  const { error: roleError } = await supabaseAdmin
    .from("account_managers")
    .update({ role })
    .eq("id", result.user.id);

  if (roleError) {
    return Response.json(
      { success: false, error: `Account created but role upgrade failed: ${roleError.message}` },
      { status: 500 }
    );
  }

  return Response.json({
    success: true,
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      userType: "am",
      role,
    },
  });
}
