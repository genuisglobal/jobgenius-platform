import { getCurrentUser } from "@/lib/auth";
import {
  getEmployeeByAccountManagerId,
  getEmployeeOnboardingForm,
  listActivePolicyDocuments,
  listPeopleEmployees,
  listPolicyAcknowledgementsForEmployee,
} from "@/lib/people-server";
import EmployeeOnboardingClient from "./EmployeeOnboardingClient";

export default async function EmployeeOnboardingPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const employee = await getEmployeeByAccountManagerId(user.id);

  if (!employee) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Employee Onboarding</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">
            Your employee profile is not active yet. Contact an operations manager or
            admin for access.
          </p>
        </div>
      </div>
    );
  }

  const [form, policies, acknowledgements, supervisors] = await Promise.all([
    getEmployeeOnboardingForm(employee.id),
    listActivePolicyDocuments(),
    listPolicyAcknowledgementsForEmployee(employee.id),
    listPeopleEmployees(),
  ]);

  return (
    <EmployeeOnboardingClient
      employee={employee}
      initialForm={form}
      policies={policies}
      initialAcknowledgedPolicyIds={acknowledgements.map((ack) => ack.policy_document_id)}
      supervisors={supervisors
        .filter((row) => row.id !== employee.id)
        .map((row) => ({
          id: row.id,
          label: row.worker?.full_name || row.role_title || row.id,
        }))}
    />
  );
}
