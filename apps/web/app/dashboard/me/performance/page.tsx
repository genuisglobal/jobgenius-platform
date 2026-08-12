import { getCurrentUser } from "@/lib/auth";
import {
  getEmployeeByAccountManagerId,
  listLeadershipEligibilityRecords,
  listMonthlyScorecards,
} from "@/lib/people-server";
import PerformanceReviewsClient from "./PerformanceReviewsClient";

export const dynamic = "force-dynamic";

export default async function EmployeePerformancePage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const employee = await getEmployeeByAccountManagerId(user.id);

  if (!employee) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">My Scorecards</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">
            Your employee profile is not active yet. Contact an operations manager or
            admin for access.
          </p>
        </div>
      </div>
    );
  }

  const [scorecards, leadershipRecords] = await Promise.all([
    listMonthlyScorecards(employee.id),
    listLeadershipEligibilityRecords(employee.id),
  ]);

  const visibleScorecards = scorecards.filter(
    (scorecard) =>
      scorecard.status === "finalized" || scorecard.status === "acknowledged"
  );

  return (
    <PerformanceReviewsClient
      employeeName={employee.worker?.full_name || employee.role_title || "Employee"}
      leadershipStatus={employee.leadership_status}
      scorecards={visibleScorecards}
      leadershipRecords={leadershipRecords}
    />
  );
}
