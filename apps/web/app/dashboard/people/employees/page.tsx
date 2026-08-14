import { supabaseAdmin } from "@/lib/auth";
import { listCareerLadderLevels, listPeopleEmployees } from "@/lib/people-server";
import EmployeesClient, {
  type AccountManagerOption,
  type PeopleEmployeeWorkerOption,
} from "./EmployeesClient";

export const dynamic = "force-dynamic";

export default async function PeopleEmployeesPage() {
  const [employees, levels, workersRes, accountManagersRes] = await Promise.all([
    listPeopleEmployees(),
    listCareerLadderLevels(),
    supabaseAdmin
      .from("payroll_workers")
      .select("id, full_name, email, job_title, department, status, start_date, account_manager_id")
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("account_managers")
      .select("id, name, email, role")
      .order("name", { ascending: true }),
  ]);

  const assignedWorkerIds = new Set(employees.map((employee) => employee.worker_id));
  const availableWorkers = ((workersRes.data ?? []) as PeopleEmployeeWorkerOption[]).filter(
    (worker) => !assignedWorkerIds.has(worker.id)
  );

  return (
    <EmployeesClient
      initialEmployees={employees}
      availableWorkers={availableWorkers}
      accountManagers={(accountManagersRes.data ?? []) as AccountManagerOption[]}
      careerLevels={levels}
    />
  );
}
