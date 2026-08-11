export const AM_ROLE_VALUES = [
  "am",
  "ops_manager",
  "accountant",
  "admin",
  "superadmin",
] as const;

export type AMRole = (typeof AM_ROLE_VALUES)[number];

export function normalizeAMRole(role: string | null | undefined): string {
  const compact = String(role ?? "")
    .toLowerCase()
    .replace(/[\s_-]/g, "");

  if (compact === "superadmin") return "superadmin";
  if (compact === "admin") return "admin";
  if (compact === "opsmanager" || compact === "operationsmanager") {
    return "ops_manager";
  }
  if (compact === "accountant" || compact === "financeaccountant") {
    return "accountant";
  }
  if (compact === "am" || compact === "accountmanager") return "am";

  return String(role ?? "am").toLowerCase().trim();
}

export function isAdminRole(role: string | null | undefined): boolean {
  const normalized = normalizeAMRole(role);
  return normalized === "admin" || normalized === "superadmin";
}

export function isPeopleManagerRole(role: string | null | undefined): boolean {
  const normalized = normalizeAMRole(role);
  return (
    normalized === "ops_manager" ||
    normalized === "admin" ||
    normalized === "superadmin"
  );
}

export function isFinanceRole(role: string | null | undefined): boolean {
  const normalized = normalizeAMRole(role);
  return (
    normalized === "accountant" ||
    normalized === "admin" ||
    normalized === "superadmin"
  );
}

export function isPrivilegedStaffRole(role: string | null | undefined): boolean {
  const normalized = normalizeAMRole(role);
  return (
    normalized === "ops_manager" ||
    normalized === "accountant" ||
    normalized === "admin" ||
    normalized === "superadmin"
  );
}
