import { getCurrentUser } from "@/lib/auth";
import {
  getEmployeeByAccountManagerId,
  getEmployeePermissionAllowanceSummary,
  listEmployeePermissionRequests,
} from "@/lib/people-server";
import EmployeePermissionsClient from "./EmployeePermissionsClient";

export const dynamic = "force-dynamic";

export default async function EmployeePermissionsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const employee = await getEmployeeByAccountManagerId(user.id);

  if (!employee) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">My Permissions</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">
            Your staff profile has not been activated yet. Contact an operations manager or
            admin if you should have employee access.
          </p>
        </div>
      </div>
    );
  }

  const [summary, requests] = await Promise.all([
    getEmployeePermissionAllowanceSummary(employee.id),
    listEmployeePermissionRequests(employee.id),
  ]);

  return (
    <EmployeePermissionsClient
      employeeName={employee.worker?.full_name || employee.role_title || "Employee"}
      summary={summary}
      requests={requests}
    />
  );
}
