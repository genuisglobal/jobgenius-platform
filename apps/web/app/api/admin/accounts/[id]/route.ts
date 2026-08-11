import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/audit";
import {
  AdminAccountManagementError,
  convertManagedAccountUserType,
  deleteManagedAccount,
  type ManagedUserType,
  updateAccountManagerRole,
} from "@/lib/admin-account-management";

function parseSourceType(value: string | null): ManagedUserType {
  return value === "job_seeker" ? "job_seeker" : "am";
}

function handleError(error: unknown) {
  if (error instanceof AdminAccountManagementError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error("Admin account route error:", error);
  return NextResponse.json({ error: "Internal server error." }, { status: 500 });
}

/**
 * PATCH /api/admin/accounts/[id]
 * Update an account manager role/name or convert account type.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const sourceType = parseSourceType(
      typeof body.sourceType === "string" ? body.sourceType : null
    );
    const desiredUserType =
      body.desiredUserType === "am" || body.desiredUserType === "job_seeker"
        ? (body.desiredUserType as ManagedUserType)
        : undefined;

    if (desiredUserType && desiredUserType !== sourceType) {
      const result = await convertManagedAccountUserType({
        actor: { id: auth.user.id, role: auth.user.role },
        sourceType,
        accountId: id,
        desiredUserType,
      });

      logAdminAction({
        adminId: auth.user.id,
        adminEmail: auth.user.email,
        action: "account.convert",
        targetType: sourceType,
        targetId: id,
        details: {
          source_type: sourceType,
          desired_user_type: desiredUserType,
          target_id: result.targetId,
          email: result.email,
        },
      }).catch((e) => console.error("Audit log failed", e));

      return NextResponse.json({ ok: true, conversion: result });
    }

    if (sourceType !== "am") {
      return NextResponse.json(
        { error: "Job seeker accounts can only be converted or deleted from this screen." },
        { status: 400 }
      );
    }

    const updated = await updateAccountManagerRole({
      actor: { id: auth.user.id, role: auth.user.role },
      accountManagerId: id,
      role: typeof body.role === "string" ? body.role : undefined,
      name:
        body.name === undefined
          ? undefined
          : typeof body.name === "string"
          ? body.name
          : null,
    });

    logAdminAction({
      adminId: auth.user.id,
      adminEmail: auth.user.email,
      action: "account.update",
      targetType: "account_manager",
      targetId: id,
      details: {
        updates: {
          ...(body.role !== undefined ? { role: body.role } : {}),
          ...(body.name !== undefined ? { name: body.name } : {}),
        },
      },
    }).catch((e) => console.error("Audit log failed", e));

    return NextResponse.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      status: updated.status,
    });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * DELETE /api/admin/accounts/[id]?sourceType=am|job_seeker
 * Delete a linked user account and its auth login.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const sourceType = parseSourceType(searchParams.get("sourceType"));

  try {
    const deleted = await deleteManagedAccount({
      actor: { id: auth.user.id, role: auth.user.role },
      sourceType,
      accountId: id,
    });

    logAdminAction({
      adminId: auth.user.id,
      adminEmail: auth.user.email,
      action: "account.delete",
      targetType: sourceType,
      targetId: id,
      details: { email: deleted.email, name: deleted.name },
    }).catch((e) => console.error("Audit log failed", e));

    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * GET /api/admin/accounts/[id]?sourceType=am|job_seeker
 * Get a single managed account.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const sourceType = parseSourceType(searchParams.get("sourceType"));

  try {
    if (sourceType === "job_seeker") {
      const { data, error } = await supabaseAdmin
        .from("job_seekers")
        .select("id, email, full_name, status, created_at, last_login_at, auth_id")
        .eq("id", id)
        .maybeSingle();

      if (error || !data) {
        return NextResponse.json({ error: "Account not found." }, { status: 404 });
      }

      return NextResponse.json({
        id: data.id,
        email: data.email,
        name: data.full_name,
        status: data.status,
        userType: "job_seeker",
        createdAt: data.created_at,
        lastLoginAt: data.last_login_at,
        hasAuthLogin: Boolean(data.auth_id),
      });
    }

    const { data, error } = await supabaseAdmin
      .from("account_managers")
      .select("id, email, name, role, status, created_at, last_login_at, auth_id")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    return NextResponse.json({
      id: data.id,
      email: data.email,
      name: data.name,
      role: data.role,
      status: data.status,
      userType: "am",
      createdAt: data.created_at,
      lastLoginAt: data.last_login_at,
      hasAuthLogin: Boolean(data.auth_id),
    });
  } catch (error) {
    return handleError(error);
  }
}
