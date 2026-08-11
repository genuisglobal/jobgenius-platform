import { AM_ROLE_VALUES, normalizeAMRole } from "@/lib/auth/roles";
import { supabaseAdmin } from "@/lib/auth";
import { isMissingAuthUserError } from "@/lib/auth/admin-errors";

export type ManagedUserType = "am" | "job_seeker";

export interface ManagedAccount {
  id: string;
  authId: string | null;
  email: string;
  name: string | null;
  userType: ManagedUserType;
  role: string | null;
  status: string | null;
  amCode: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  assignmentCount: number;
  assignedAccountManager: {
    id: string;
    name: string | null;
    email: string;
  } | null;
}

export class AdminAccountManagementError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Actor = {
  id: string;
  role?: string;
};

type AccountManagerRow = {
  id: string;
  auth_id: string | null;
  email: string;
  name: string | null;
  role: string | null;
  status: string | null;
  am_code: string | null;
  created_at: string;
  last_login_at: string | null;
};

type JobSeekerRow = {
  id: string;
  auth_id: string | null;
  email: string;
  full_name: string | null;
  status: string | null;
  created_at: string;
  last_login_at: string | null;
};

function isSuperAdmin(role: string | null | undefined) {
  return normalizeAMRole(role) === "superadmin";
}

function isAdmin(role: string | null | undefined) {
  const normalized = normalizeAMRole(role);
  return normalized === "admin" || normalized === "superadmin";
}

async function deleteAuthUserIfPresent(authId: string) {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(authId);

  // The application row can outlive its Supabase Auth user. Deleting such an
  // account should still archive the application row and remove portal access.
  if (error && !isMissingAuthUserError(error)) {
    throw new AdminAccountManagementError(500, error.message);
  }
}

async function countActiveAdminAccounts() {
  const { count, error } = await supabaseAdmin
    .from("account_managers")
    .select("id", { count: "exact", head: true })
    .not("auth_id", "is", null)
    .in("role", ["admin", "superadmin"]);

  if (error) {
    throw new AdminAccountManagementError(500, error.message);
  }

  return count ?? 0;
}

async function getAccountManagerById(id: string) {
  const { data, error } = await supabaseAdmin
    .from("account_managers")
    .select("id, auth_id, email, name, role, status, am_code, created_at, last_login_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new AdminAccountManagementError(500, error.message);
  }

  return (data as AccountManagerRow | null) ?? null;
}

async function getJobSeekerById(id: string) {
  const { data, error } = await supabaseAdmin
    .from("job_seekers")
    .select("id, auth_id, email, full_name, status, created_at, last_login_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new AdminAccountManagementError(500, error.message);
  }

  return (data as JobSeekerRow | null) ?? null;
}

async function getAccountManagerByEmail(email: string) {
  const { data, error } = await supabaseAdmin
    .from("account_managers")
    .select("id, auth_id, email, name, role, status, am_code, created_at, last_login_at")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    throw new AdminAccountManagementError(500, error.message);
  }

  return (data as AccountManagerRow | null) ?? null;
}

async function getJobSeekerByEmail(email: string) {
  const { data, error } = await supabaseAdmin
    .from("job_seekers")
    .select("id, auth_id, email, full_name, status, created_at, last_login_at")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    throw new AdminAccountManagementError(500, error.message);
  }

  return (data as JobSeekerRow | null) ?? null;
}

async function getAccountManagerAssignmentCount(accountManagerId: string) {
  const { count, error } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("id", { count: "exact", head: true })
    .eq("account_manager_id", accountManagerId);

  if (error) {
    throw new AdminAccountManagementError(500, error.message);
  }

  return count ?? 0;
}

async function ensureAuthMetadata(authId: string, userType: ManagedUserType, name: string | null) {
  const authLookup = await supabaseAdmin.auth.admin.getUserById(authId);
  if (authLookup.error || !authLookup.data.user) {
    throw new AdminAccountManagementError(
      500,
      authLookup.error?.message || "Failed to load auth user."
    );
  }

  const existingMetadata =
    authLookup.data.user.user_metadata &&
    typeof authLookup.data.user.user_metadata === "object"
      ? authLookup.data.user.user_metadata
      : {};

  const { error } = await supabaseAdmin.auth.admin.updateUserById(authId, {
    user_metadata: {
      ...existingMetadata,
      user_type: userType,
      ...(name ? { name } : {}),
    },
  });

  if (error) {
    throw new AdminAccountManagementError(500, error.message);
  }
}

async function ensureCanManageTarget(actor: Actor, targetRole: string | null | undefined) {
  if (isSuperAdmin(targetRole) && !isSuperAdmin(actor.role)) {
    throw new AdminAccountManagementError(
      403,
      "Only super admins can modify super admin accounts."
    );
  }
}

async function ensureNotLastAdmin(currentRole: string | null | undefined, nextRole: string | null | undefined) {
  if (!isAdmin(currentRole) || isAdmin(nextRole)) {
    return;
  }

  const activeAdminCount = await countActiveAdminAccounts();
  if (activeAdminCount <= 1) {
    throw new AdminAccountManagementError(
      409,
      "You cannot remove the last admin account."
    );
  }
}

export async function listManagedAccounts(): Promise<ManagedAccount[]> {
  const [
    { data: accountManagers, error: amError },
    { data: jobSeekers, error: jsError },
    { data: assignments, error: assignmentError },
  ] = await Promise.all([
    supabaseAdmin
      .from("account_managers")
      .select("id, auth_id, email, name, role, status, am_code, created_at, last_login_at")
      .not("auth_id", "is", null),
    supabaseAdmin
      .from("job_seekers")
      .select("id, auth_id, email, full_name, status, created_at, last_login_at")
      .not("auth_id", "is", null),
    supabaseAdmin
      .from("job_seeker_assignments")
      .select("job_seeker_id, account_manager_id, account_managers ( id, name, email )"),
  ]);

  if (amError) {
    throw new AdminAccountManagementError(500, amError.message);
  }
  if (jsError) {
    throw new AdminAccountManagementError(500, jsError.message);
  }
  if (assignmentError) {
    throw new AdminAccountManagementError(500, assignmentError.message);
  }

  const assignmentCountMap = new Map<string, number>();
  const assignedAccountManagerMap = new Map<
    string,
    { id: string; name: string | null; email: string }
  >();

  for (const assignment of assignments || []) {
    assignmentCountMap.set(
      assignment.account_manager_id,
      (assignmentCountMap.get(assignment.account_manager_id) || 0) + 1
    );

    const assignedAMRaw = assignment.account_managers as
      | { id: string; name: string | null; email: string }
      | { id: string; name: string | null; email: string }[]
      | null;
    const assignedAM = Array.isArray(assignedAMRaw)
      ? assignedAMRaw[0] ?? null
      : assignedAMRaw;

    if (assignedAM) {
      assignedAccountManagerMap.set(assignment.job_seeker_id, assignedAM);
    }
  }

  const amAccounts: ManagedAccount[] = ((accountManagers as AccountManagerRow[] | null) || []).map((am) => ({
    id: am.id,
    authId: am.auth_id,
    email: am.email,
    name: am.name,
    userType: "am",
    role: am.role,
    status: am.status,
    amCode: am.am_code,
    createdAt: am.created_at,
    lastLoginAt: am.last_login_at,
    assignmentCount: assignmentCountMap.get(am.id) || 0,
    assignedAccountManager: null,
  }));

  const seekerAccounts: ManagedAccount[] = ((jobSeekers as JobSeekerRow[] | null) || []).map((js) => ({
    id: js.id,
    authId: js.auth_id,
    email: js.email,
    name: js.full_name,
    userType: "job_seeker",
    role: null,
    status: js.status,
    amCode: null,
    createdAt: js.created_at,
    lastLoginAt: js.last_login_at,
    assignmentCount: 0,
    assignedAccountManager: assignedAccountManagerMap.get(js.id) || null,
  }));

  return [...amAccounts, ...seekerAccounts].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function updateAccountManagerRole(params: {
  actor: Actor;
  accountManagerId: string;
  role?: string;
  name?: string | null;
}) {
  const { actor, accountManagerId, role, name } = params;

  const target = await getAccountManagerById(accountManagerId);
  if (!target) {
    throw new AdminAccountManagementError(404, "Account not found.");
  }

  await ensureCanManageTarget(actor, target.role);

  if (accountManagerId === actor.id && role && normalizeAMRole(role) !== normalizeAMRole(target.role)) {
    throw new AdminAccountManagementError(400, "You cannot change your own role.");
  }

  const updates: Record<string, unknown> = {};

  if (role !== undefined) {
    const validRoles = [...AM_ROLE_VALUES];
    if (!validRoles.some((validRole) => validRole === role)) {
      throw new AdminAccountManagementError(400, "Invalid role.");
    }
    if (role === "superadmin" && !isSuperAdmin(actor.role)) {
      throw new AdminAccountManagementError(
        403,
        "Only super admins can assign super admin role."
      );
    }

    await ensureNotLastAdmin(target.role, role);
    updates.role = role;
  }

  if (name !== undefined) {
    updates.name = name || null;
  }

  if (Object.keys(updates).length === 0) {
    throw new AdminAccountManagementError(400, "No updates provided.");
  }

  const { data, error } = await supabaseAdmin
    .from("account_managers")
    .update(updates)
    .eq("id", accountManagerId)
    .select("id, auth_id, email, name, role, status, am_code, created_at, last_login_at")
    .single();

  if (error || !data) {
    throw new AdminAccountManagementError(500, error?.message || "Failed to update account.");
  }

  return data as AccountManagerRow;
}

export async function convertManagedAccountUserType(params: {
  actor: Actor;
  sourceType: ManagedUserType;
  accountId: string;
  desiredUserType: ManagedUserType;
}) {
  const { actor, sourceType, accountId, desiredUserType } = params;

  if (sourceType === desiredUserType) {
    throw new AdminAccountManagementError(400, "Source and target user type are the same.");
  }

  if (sourceType === "job_seeker") {
    const source = await getJobSeekerById(accountId);
    if (!source) {
      throw new AdminAccountManagementError(404, "Job seeker account not found.");
    }
    if (!source.auth_id) {
      throw new AdminAccountManagementError(409, "This job seeker is not linked to an active login.");
    }

    const existingTarget = await getAccountManagerByEmail(source.email);
    let targetId = existingTarget?.id ?? null;
    let targetName = existingTarget?.name ?? source.full_name ?? null;

    if (existingTarget) {
      if (existingTarget.auth_id && existingTarget.auth_id !== source.auth_id) {
        throw new AdminAccountManagementError(
          409,
          "An account manager with this email is already linked to another login."
        );
      }

      const { data, error } = await supabaseAdmin
        .from("account_managers")
        .update({
          auth_id: source.auth_id,
          name: targetName,
          role: "am",
          status: "approved",
        })
        .eq("id", existingTarget.id)
        .select("id, name")
        .single();

      if (error || !data) {
        throw new AdminAccountManagementError(
          500,
          error?.message || "Failed to activate target account manager record."
        );
      }

      targetId = data.id;
      targetName = data.name ?? targetName;
    } else {
      const { data, error } = await supabaseAdmin
        .from("account_managers")
        .insert({
          email: source.email,
          name: targetName,
          auth_id: source.auth_id,
          role: "am",
          status: "approved",
        })
        .select("id, name")
        .single();

      if (error || !data) {
        throw new AdminAccountManagementError(
          500,
          error?.message || "Failed to create account manager record."
        );
      }

      targetId = data.id;
      targetName = data.name ?? targetName;
    }

    const { error: unassignError } = await supabaseAdmin
      .from("job_seeker_assignments")
      .delete()
      .eq("job_seeker_id", source.id);

    if (unassignError) {
      throw new AdminAccountManagementError(500, unassignError.message);
    }

    const { error: sourceUpdateError } = await supabaseAdmin
      .from("job_seekers")
      .update({
        auth_id: null,
        status: "inactive",
      })
      .eq("id", source.id);

    if (sourceUpdateError) {
      throw new AdminAccountManagementError(500, sourceUpdateError.message);
    }

    await ensureAuthMetadata(source.auth_id, "am", targetName);

    return {
      sourceType,
      desiredUserType,
      sourceId: source.id,
      targetId,
      email: source.email,
      name: targetName,
    };
  }

  const source = await getAccountManagerById(accountId);
  if (!source) {
    throw new AdminAccountManagementError(404, "Account manager account not found.");
  }
  if (!source.auth_id) {
    throw new AdminAccountManagementError(409, "This account manager is not linked to an active login.");
  }
  if (source.id === actor.id) {
    throw new AdminAccountManagementError(400, "You cannot convert your own account.");
  }

  await ensureCanManageTarget(actor, source.role);
  await ensureNotLastAdmin(source.role, null);

  const assignmentCount = await getAccountManagerAssignmentCount(source.id);
  if (assignmentCount > 0) {
    throw new AdminAccountManagementError(
      409,
      "Unassign this account manager's job seekers before converting the account."
    );
  }

  const existingTarget = await getJobSeekerByEmail(source.email);
  let targetId = existingTarget?.id ?? null;
  let targetName = existingTarget?.full_name ?? source.name ?? null;

  if (existingTarget) {
    if (existingTarget.auth_id && existingTarget.auth_id !== source.auth_id) {
      throw new AdminAccountManagementError(
        409,
        "A job seeker with this email is already linked to another login."
      );
    }

    const { data, error } = await supabaseAdmin
      .from("job_seekers")
      .update({
        auth_id: source.auth_id,
        full_name: targetName,
        status: "active",
      })
      .eq("id", existingTarget.id)
      .select("id, full_name")
      .single();

    if (error || !data) {
      throw new AdminAccountManagementError(
        500,
        error?.message || "Failed to activate target job seeker record."
      );
    }

    targetId = data.id;
    targetName = data.full_name ?? targetName;
  } else {
    const { data, error } = await supabaseAdmin
      .from("job_seekers")
      .insert({
        email: source.email,
        full_name: targetName,
        auth_id: source.auth_id,
        status: "active",
      })
      .select("id, full_name")
      .single();

    if (error || !data) {
      throw new AdminAccountManagementError(
        500,
        error?.message || "Failed to create job seeker record."
      );
    }

    targetId = data.id;
    targetName = data.full_name ?? targetName;
  }

  const { error: sourceUpdateError } = await supabaseAdmin
    .from("account_managers")
    .update({
      auth_id: null,
      status: "converted",
    })
    .eq("id", source.id);

  if (sourceUpdateError) {
    throw new AdminAccountManagementError(500, sourceUpdateError.message);
  }

  await ensureAuthMetadata(source.auth_id, "job_seeker", targetName);

  return {
    sourceType,
    desiredUserType,
    sourceId: source.id,
    targetId,
    email: source.email,
    name: targetName,
  };
}

export async function deleteManagedAccount(params: {
  actor: Actor;
  sourceType: ManagedUserType;
  accountId: string;
}) {
  const { actor, sourceType, accountId } = params;

  if (sourceType === "job_seeker") {
    const source = await getJobSeekerById(accountId);
    if (!source) {
      throw new AdminAccountManagementError(404, "Job seeker account not found.");
    }

    if (source.auth_id) {
      await deleteAuthUserIfPresent(source.auth_id);
    }

    // Preserve historical seeker data and workflow references while removing portal access.
    const { error } = await supabaseAdmin
      .from("job_seekers")
      .update({
        auth_id: null,
        status: "inactive",
        last_login_at: null,
      })
      .eq("id", source.id);

    if (error) {
      throw new AdminAccountManagementError(500, error.message);
    }

    return { sourceType, id: source.id, email: source.email, name: source.full_name };
  }

  const source = await getAccountManagerById(accountId);
  if (!source) {
    throw new AdminAccountManagementError(404, "Account manager account not found.");
  }
  if (source.id === actor.id) {
    throw new AdminAccountManagementError(400, "You cannot delete your own account.");
  }

  await ensureCanManageTarget(actor, source.role);
  await ensureNotLastAdmin(source.role, null);

  const assignmentCount = await getAccountManagerAssignmentCount(source.id);
  if (assignmentCount > 0) {
    throw new AdminAccountManagementError(
      409,
      "Unassign this account manager's job seekers before deleting the account."
    );
  }

  if (source.auth_id) {
    await deleteAuthUserIfPresent(source.auth_id);
  }

  // Preserve historical AM ownership and audit references while removing dashboard access.
  const { error } = await supabaseAdmin
    .from("account_managers")
    .update({
      auth_id: null,
      status: "deleted",
      last_login_at: null,
    })
    .eq("id", source.id);

  if (error) {
    throw new AdminAccountManagementError(500, error.message);
  }

  return { sourceType, id: source.id, email: source.email, name: source.name };
}
