import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole, isPeopleManagerRole, normalizeAMRole } from "@/lib/auth/roles";
import { listClientDeliverySnapshots } from "@/lib/client-delivery-server";
import DeliveryClient from "./DeliveryClient";

export const dynamic = "force-dynamic";

type AccountManagerDirectoryRow = {
  id: string;
  name: string | null;
  email: string;
};

export default async function DeliveryBoardPage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    redirect("/login");
  }

  const normalizedRole = normalizeAMRole(user.role);
  if (normalizedRole === "accountant") {
    redirect("/dashboard/finance");
  }

  const board = await listClientDeliverySnapshots({
    accountManagerId: user.id,
    role: normalizedRole,
  });

  const accountManagerIds = Array.from(
    new Set(board.rows.map((row) => row.accountManagerId).filter((value): value is string => Boolean(value)))
  );

  let accountManagers: AccountManagerDirectoryRow[] = [];
  if (accountManagerIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("account_managers")
      .select("id, name, email")
      .in("id", accountManagerIds)
      .order("name", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    accountManagers = (data as AccountManagerDirectoryRow[] | null) ?? [];
  }

  const canViewAllCases =
    isPeopleManagerRole(normalizedRole) || isAdminRole(normalizedRole);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Client Delivery</h1>
          <p className="text-sm text-gray-500 mt-1">
            Operational board for active managed seekers, next actions, blockers, and stale delivery risk.
          </p>
          <p className="text-xs text-violet-700 mt-2">
            Delivery status is system-derived. Only risk, blockers, and next actions should need manual upkeep.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/today"
            className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
          >
            Open Today
          </Link>
          <Link
            href="/dashboard/seekers"
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            My seekers
          </Link>
        </div>
      </div>

      <DeliveryClient
        initialRows={board.rows}
        accountManagers={accountManagers}
        canViewAllCases={canViewAllCases}
      />
    </div>
  );
}
