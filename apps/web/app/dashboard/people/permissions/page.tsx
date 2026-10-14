import {
  listEmployeePermissionAllowanceSummaries,
  listEmployeePermissionPolicies,
  listEmployeePermissionRequests,
  listPeopleEmployees,
} from "@/lib/people-server";
import PermissionsClient from "./PermissionsClient";

export const dynamic = "force-dynamic";

export default async function PeoplePermissionsPage() {
  const [employees, summaries, policies, requests] = await Promise.all([
    listPeopleEmployees(),
    listEmployeePermissionAllowanceSummaries(),
    listEmployeePermissionPolicies(),
    listEmployeePermissionRequests(),
  ]);

  return (
    <PermissionsClient
      employees={employees}
      summaries={summaries}
      policies={policies}
      requests={requests}
    />
  );
}
