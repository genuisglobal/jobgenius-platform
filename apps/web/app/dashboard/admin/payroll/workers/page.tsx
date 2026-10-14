import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import type { PayrollWorker } from "@/lib/payroll";
import WorkersClient, { type AccountManagerOption } from "./WorkersClient";

export default async function PayrollWorkersPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [{ data: workers }, { data: ams }] = await Promise.all([
    supabaseAdmin
      .from("payroll_workers")
      .select("*")
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("account_managers")
      .select("id, name, email, role")
      .order("name", { ascending: true }),
  ]);

  return (
    <WorkersClient
      initialWorkers={(workers ?? []) as PayrollWorker[]}
      accountManagers={(ams ?? []) as AccountManagerOption[]}
    />
  );
}
