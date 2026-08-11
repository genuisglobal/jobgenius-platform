import { getCurrentUser } from "@/lib/auth";
import { listManagedAccounts } from "@/lib/admin-account-management";
import AccountsClient from "./AccountsClient";

export default async function AccountsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const currentUserRole = user.role ?? "am";

  const accounts = await listManagedAccounts();

  const pendingAccounts = accounts.filter(
    (account) => account.userType === "am" && account.status === "pending"
  );

  return (
    <AccountsClient
      accounts={accounts}
      pendingCount={pendingAccounts.length}
      isSuperAdmin={currentUserRole === "superadmin"}
      currentUserId={user.id}
      activeAdminCount={
        accounts.filter(
          (account) =>
            account.userType === "am" &&
            account.authId &&
            (account.role === "admin" || account.role === "superadmin")
        ).length
      }
    />
  );
}
