"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { normalizeAMRole } from "@/lib/auth/roles";

type ManagedUserType = "am" | "job_seeker";

interface ManagedAccount {
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

function formatRoleLabel(role: string | null | undefined) {
  const normalized = normalizeAMRole(role);
  if (normalized === "superadmin") return "Super Admin";
  if (normalized === "admin") return "Admin";
  if (normalized === "ops_manager") return "Operations Manager";
  if (normalized === "accountant") return "Accountant";
  return "Account Manager";
}

function formatUserTypeLabel(userType: ManagedUserType) {
  return userType === "am" ? "Account Manager" : "Job Seeker";
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString();
}

export default function AccountsClient({
  accounts,
  pendingCount,
  isSuperAdmin,
  currentUserId,
  activeAdminCount,
}: {
  accounts: ManagedAccount[];
  pendingCount: number;
  isSuperAdmin: boolean;
  currentUserId: string;
  activeAdminCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showCreate = searchParams.get("action") === "create";

  const [isCreating, setIsCreating] = useState(showCreate);
  const [filter, setFilter] = useState<
    "all" | "pending" | "job_seekers" | "account_managers" | "admins"
  >("all");
  const [search, setSearch] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    role: "am",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  const pendingAccounts = useMemo(
    () => accounts.filter((account) => account.userType === "am" && account.status === "pending"),
    [accounts]
  );

  const adminAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.userType === "am" &&
          (normalizeAMRole(account.role) === "admin" ||
            normalizeAMRole(account.role) === "superadmin")
      ),
    [accounts]
  );

  const filtered = useMemo(() => {
    return accounts.filter((account) => {
      if (filter === "pending" && !(account.userType === "am" && account.status === "pending")) {
        return false;
      }
      if (filter === "job_seekers" && account.userType !== "job_seeker") return false;
      if (filter === "account_managers" && account.userType !== "am") return false;
      if (
        filter === "admins" &&
        !(
          account.userType === "am" &&
          (normalizeAMRole(account.role) === "admin" ||
            normalizeAMRole(account.role) === "superadmin")
        )
      ) {
        return false;
      }
      if (!search) return true;

      const q = search.toLowerCase();
      return (
        (account.name || "").toLowerCase().includes(q) ||
        account.email.toLowerCase().includes(q)
      );
    });
  }, [accounts, filter, search]);

  const createAccount = async () => {
    if (!form.email || !form.password) {
      setMessage({ type: "error", text: "Email and password are required." });
      return;
    }
    if (form.password.length < 8) {
      setMessage({ type: "error", text: "Password must be at least 8 characters." });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to create account." });
        return;
      }

      setMessage({ type: "success", text: "Account created successfully." });
      setForm({ email: "", password: "", name: "", role: "am" });
      setIsCreating(false);
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setSaving(false);
    }
  };

  const approveAccount = async (accountId: string) => {
    setProcessing(`approve:${accountId}`);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/accounts/${accountId}/approve`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to approve account." });
        return;
      }

      setMessage({ type: "success", text: "Account approved." });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setProcessing(null);
    }
  };

  const rejectAccount = async (accountId: string) => {
    setProcessing(`reject:${accountId}`);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/accounts/${accountId}/reject`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to reject account." });
        return;
      }

      setMessage({ type: "success", text: "Account rejected." });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setProcessing(null);
    }
  };

  const updateRole = async (account: ManagedAccount, newRole: string) => {
    if (account.id === currentUserId) {
      setMessage({ type: "error", text: "You cannot change your own role." });
      return;
    }

    setProcessing(`role:${account.id}`);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: "am",
          role: newRole,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to update role." });
        return;
      }

      setMessage({ type: "success", text: "Role updated." });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setProcessing(null);
    }
  };

  const convertAccount = async (account: ManagedAccount, desiredUserType: ManagedUserType) => {
    const prompt =
      desiredUserType === "am"
        ? "Convert this job seeker login into an account manager login? The job seeker profile will be archived from active seeker workflows."
        : "Convert this account manager login into a job seeker login? Unassign their seekers first.";

    if (!window.confirm(prompt)) return;

    setProcessing(`convert:${account.id}`);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: account.userType,
          desiredUserType,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to convert account." });
        return;
      }

      setMessage({
        type: "success",
        text:
          desiredUserType === "am"
            ? "Job seeker converted to account manager."
            : "Account manager converted to job seeker.",
      });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setProcessing(null);
    }
  };

  const deleteAccount = async (account: ManagedAccount) => {
    const prompt =
      account.userType === "job_seeker"
        ? "Delete this job seeker's login access? Their historical JobGenius record will be archived."
        : "Delete this account manager's login access? Their historical JobGenius record will be archived.";

    if (!window.confirm(prompt)) return;

    setProcessing(`delete:${account.id}`);
    setMessage(null);

    try {
      const res = await fetch(
        `/api/admin/accounts/${account.id}?sourceType=${account.userType}`,
        { method: "DELETE" }
      );

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to delete account." });
        return;
      }

      setMessage({
        type: "success",
        text:
          account.userType === "job_seeker"
            ? "Job seeker login deleted and archived."
            : "Staff login deleted and archived.",
      });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setProcessing(null);
    }
  };

  const canManageSuperAdminTarget = (account: ManagedAccount) =>
    account.userType === "am" && normalizeAMRole(account.role) === "superadmin";

  const canDelete = (account: ManagedAccount) => {
    if (account.userType === "am" && account.id === currentUserId) return false;
    if (canManageSuperAdminTarget(account) && !isSuperAdmin) return false;
    if (
      account.userType === "am" &&
      (normalizeAMRole(account.role) === "admin" ||
        normalizeAMRole(account.role) === "superadmin") &&
      activeAdminCount <= 1
    ) {
      return false;
    }
    return true;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Accounts</h1>
          <p className="text-gray-600">
            {accounts.length} active login-linked users across seekers and account managers
          </p>
        </div>
        <button
          onClick={() => setIsCreating((value) => !value)}
          className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
        >
          {isCreating ? "Cancel" : "Create Staff Account"}
        </button>
      </div>

      {message && (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {pendingCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="font-semibold text-amber-800">
              {pendingCount} Pending Staff Approval{pendingCount !== 1 ? "s" : ""}
            </h2>
          </div>
          <div className="space-y-2">
            {pendingAccounts.map((account) => (
              <div
                key={account.id}
                className="flex flex-col gap-3 rounded-lg border border-amber-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-gray-900">{account.name || "Unnamed"}</p>
                  <p className="text-sm text-gray-500">{account.email}</p>
                  <p className="text-xs text-gray-400">
                    Signed up {formatDate(account.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => approveAccount(account.id)}
                    disabled={processing === `approve:${account.id}`}
                    className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {processing === `approve:${account.id}` ? "Approving..." : "Approve"}
                  </button>
                  <button
                    onClick={() => rejectAccount(account.id)}
                    disabled={processing === `reject:${account.id}`}
                    className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {processing === `reject:${account.id}` ? "Rejecting..." : "Reject"}
                  </button>
                  <button
                    onClick={() => deleteAccount(account)}
                    disabled={processing === `delete:${account.id}` || !canDelete(account)}
                    className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-black disabled:opacity-50 transition-colors"
                  >
                    {processing === `delete:${account.id}` ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isCreating && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Create New Staff Account</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
              <input
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                placeholder="Min 8 characters"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={form.role}
                onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                <option value="am">Account Manager</option>
                <option value="ops_manager">Operations Manager</option>
                <option value="accountant">Accountant</option>
                <option value="admin">Admin</option>
                {isSuperAdmin && <option value="superadmin">Super Admin</option>}
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Admin-created internal staff accounts are approved immediately.
          </p>
          <button
            onClick={createAccount}
            disabled={saving}
            className="mt-4 px-6 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Creating..." : "Create Account"}
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email..."
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-2 text-sm rounded-lg ${
                filter === "all" ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              All ({accounts.length})
            </button>
            {pendingCount > 0 && (
              <button
                onClick={() => setFilter("pending")}
                className={`px-3 py-2 text-sm rounded-lg ${
                  filter === "pending"
                    ? "bg-amber-600 text-white"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                Pending ({pendingCount})
              </button>
            )}
            <button
              onClick={() => setFilter("account_managers")}
              className={`px-3 py-2 text-sm rounded-lg ${
                filter === "account_managers"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              AMs ({accounts.filter((account) => account.userType === "am").length})
            </button>
            <button
              onClick={() => setFilter("job_seekers")}
              className={`px-3 py-2 text-sm rounded-lg ${
                filter === "job_seekers"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              Job Seekers ({accounts.filter((account) => account.userType === "job_seeker").length})
            </button>
            <button
              onClick={() => setFilter("admins")}
              className={`px-3 py-2 text-sm rounded-lg ${
                filter === "admins"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              Admins ({adminAccounts.length})
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase hidden md:table-cell">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase hidden lg:table-cell">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase hidden xl:table-cell">
                  Coverage
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase hidden xl:table-cell">
                  Last Login
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No accounts found
                  </td>
                </tr>
              ) : (
                filtered.map((account) => {
                  const normalizedRole = normalizeAMRole(account.role);
                  const roleActionDisabled =
                    processing === `role:${account.id}` ||
                    account.id === currentUserId ||
                    (normalizedRole === "superadmin" && !isSuperAdmin);

                  const convertActionDisabled =
                    processing === `convert:${account.id}` ||
                    (account.userType === "am" &&
                      (account.assignmentCount > 0 ||
                        account.id === currentUserId ||
                        (normalizedRole === "superadmin" && !isSuperAdmin))) ||
                    (account.userType === "job_seeker" && !account.authId);

                  const deleteActionDisabled =
                    processing === `delete:${account.id}` || !canDelete(account);

                  return (
                    <tr
                      key={`${account.userType}:${account.id}`}
                      className={account.status === "pending" ? "bg-amber-50" : "hover:bg-gray-50"}
                    >
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900">
                            {account.name || "Unnamed"}
                          </p>
                          {account.id === currentUserId && (
                            <span className="px-1.5 py-0.5 text-xs bg-gray-200 text-gray-600 rounded">
                              You
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{account.email}</p>
                        <div className="mt-2 flex flex-wrap gap-2 md:hidden">
                          <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                            {formatUserTypeLabel(account.userType)}
                          </span>
                          <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                            {account.status || "active"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top hidden md:table-cell">
                        <div className="space-y-2">
                          <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                            {formatUserTypeLabel(account.userType)}
                          </span>
                          {account.userType === "am" && (
                            <div>
                              <span
                                className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                                  normalizedRole === "superadmin"
                                    ? "bg-purple-100 text-purple-800"
                                    : normalizedRole === "admin"
                                    ? "bg-violet-100 text-violet-800"
                                    : normalizedRole === "ops_manager"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : normalizedRole === "accountant"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {formatRoleLabel(account.role)}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top hidden lg:table-cell">
                        <span
                          className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                            account.status === "approved" || account.status === "active"
                              ? "bg-green-100 text-green-800"
                              : account.status === "pending"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {account.status || "active"}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top hidden xl:table-cell text-sm text-gray-600">
                        {account.userType === "am" ? (
                          <div className="space-y-1">
                            <p>
                              <span className="font-medium text-gray-900">
                                {account.assignmentCount}
                              </span>{" "}
                              assigned seekers
                            </p>
                            <p className="text-xs text-gray-500">
                              {account.amCode ? `AM Code: ${account.amCode}` : "No AM code"}
                            </p>
                          </div>
                        ) : account.assignedAccountManager ? (
                          <div className="space-y-1">
                            <p className="font-medium text-gray-900">
                              {account.assignedAccountManager.name || "Unnamed AM"}
                            </p>
                            <p className="text-xs text-gray-500">
                              {account.assignedAccountManager.email}
                            </p>
                          </div>
                        ) : (
                          <span className="text-gray-400">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top hidden xl:table-cell text-sm text-gray-600">
                        {formatDate(account.lastLoginAt)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-col gap-2 items-stretch sm:items-end">
                          {account.userType === "am" && account.status === "pending" ? (
                            <div className="flex flex-wrap gap-2 justify-end">
                              <button
                                onClick={() => approveAccount(account.id)}
                                disabled={processing === `approve:${account.id}`}
                                className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                              >
                                {processing === `approve:${account.id}` ? "Approving..." : "Approve"}
                              </button>
                              <button
                                onClick={() => rejectAccount(account.id)}
                                disabled={processing === `reject:${account.id}`}
                                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                              >
                                {processing === `reject:${account.id}` ? "Rejecting..." : "Reject"}
                              </button>
                              <button
                                onClick={() => deleteAccount(account)}
                                disabled={processing === `delete:${account.id}` || !canDelete(account)}
                                className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded hover:bg-black disabled:opacity-50"
                              >
                                {processing === `delete:${account.id}` ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          ) : (
                            <>
                              {account.userType === "am" && (
                                <select
                                  value={normalizedRole}
                                  onChange={(event) => updateRole(account, event.target.value)}
                                  disabled={roleActionDisabled}
                                  className="text-sm border rounded px-2 py-1 disabled:bg-gray-100 disabled:text-gray-400"
                                >
                                  <option value="am">Account Manager</option>
                                  <option value="ops_manager">Operations Manager</option>
                                  <option value="accountant">Accountant</option>
                                  <option value="admin">Admin</option>
                                  {isSuperAdmin && <option value="superadmin">Super Admin</option>}
                                </select>
                              )}

                              <div className="flex flex-wrap gap-2 justify-end">
                                <button
                                  onClick={() =>
                                    convertAccount(
                                      account,
                                      account.userType === "am" ? "job_seeker" : "am"
                                    )
                                  }
                                  disabled={convertActionDisabled}
                                  className="px-3 py-1.5 text-xs bg-violet-600 text-white rounded hover:bg-violet-700 disabled:opacity-50"
                                >
                                  {processing === `convert:${account.id}`
                                    ? "Converting..."
                                    : account.userType === "am"
                                    ? "Make Job Seeker"
                                    : "Make AM"}
                                </button>
                                <button
                                  onClick={() => deleteAccount(account)}
                                  disabled={deleteActionDisabled}
                                  className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                                >
                                  {processing === `delete:${account.id}` ? "Deleting..." : "Delete"}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
        AM to job seeker conversion is blocked while the AM still owns assigned seekers. Job seeker
        to AM conversion archives the old seeker login path and removes the seeker from active
        assignment workflows.
      </div>
    </div>
  );
}
