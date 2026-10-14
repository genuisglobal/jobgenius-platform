import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { AM_ROLE_VALUES } from "@/lib/auth/roles";

/**
 * POST /api/admin/accounts
 * Create a new internal staff account
 */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { email, password, name, role } = body;

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = [...AM_ROLE_VALUES];
    const targetRole = role || "am";
    if (!validRoles.some((validRole) => validRole === targetRole)) {
      return NextResponse.json(
        { error: "Invalid role." },
        { status: 400 }
      );
    }

    // Only superadmins can create superadmins
    if (targetRole === "superadmin" && auth.user.role !== "superadmin") {
      return NextResponse.json(
        { error: "Only super admins can create super admin accounts." },
        { status: 403 }
      );
    }

    // Reuse an archived staff profile when the email already exists without a linked auth user.
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("account_managers")
      .select("id, auth_id")
      .eq("email", email)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { error: existingError.message },
        { status: 500 }
      );
    }

    if (existing?.auth_id) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    // Create Supabase auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        user_type: "am",
        name,
      },
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message || "Failed to create auth user." },
        { status: 500 }
      );
    }

    // Create or reactivate the account manager record (auto-approved when created by admin)
    const amMutation = existing
      ? supabaseAdmin
          .from("account_managers")
          .update({
            name: name || null,
            auth_id: authData.user.id,
            role: targetRole,
            status: "approved",
          })
          .eq("id", existing.id)
      : supabaseAdmin
          .from("account_managers")
          .insert({
            email,
            name: name || null,
            auth_id: authData.user.id,
            role: targetRole,
            status: "approved", // Auto-approve accounts created by admins
          });

    const { data: am, error: amError } = await amMutation
      .select()
      .single();

    if (amError || !am) {
      // Rollback auth user if AM creation fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: amError?.message || "Failed to create account manager." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: am.id,
      email: am.email,
      name: am.name,
      role: am.role,
    });
  } catch (error) {
    console.error("Error creating account:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/accounts
 * List all account managers
 */
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "25", 10) || 25));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data: accountManagers, error, count } = await supabaseAdmin
      .from("account_managers")
      .select("id, email, name, role, created_at, last_login_at", { count: "exact" })
      .order("name", { ascending: true })
      .range(from, to);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: accountManagers ?? [],
      pagination: {
        page,
        pageSize,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      },
    });
  } catch (error) {
    console.error("Error listing accounts:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
