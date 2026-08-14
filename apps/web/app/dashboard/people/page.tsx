import Link from "next/link";
import {
  getPeopleOpsReminderSnapshot,
  listOnboardingQueue,
  listPeopleEmployees,
  listPeopleOverviewStats,
} from "@/lib/people-server";
import { labelizePeopleValue } from "@/lib/people";

export const dynamic = "force-dynamic";

export default async function PeopleOverviewPage() {
  const [stats, employees, onboardingQueue, reminderSnapshot] = await Promise.all([
    listPeopleOverviewStats(),
    listPeopleEmployees(),
    listOnboardingQueue(),
    getPeopleOpsReminderSnapshot(),
  ]);

  const recentEmployees = employees.slice(0, 5);
  const pendingOnboarding = onboardingQueue.filter((form) =>
    ["pending", "submitted", "needs_changes"].includes(form.status)
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">People Overview</h1>
          <p className="text-sm text-gray-500 mt-1">
            Employee onboarding, probation readiness, and internal growth visibility.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/people/employees"
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
          >
            Manage employees
          </Link>
          <Link
            href="/dashboard/people/permissions"
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Review permissions
          </Link>
          <Link
            href="/dashboard/people/discipline"
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Open discipline
          </Link>
          <Link
            href="/dashboard/people/onboarding"
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Review onboarding
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-8 gap-4">
        {[
          { label: "Employees", value: stats.employeeCount, tone: "text-gray-900" },
          {
            label: "Onboarding due",
            value: stats.pendingOnboardingCount,
            tone: "text-amber-700",
          },
          {
            label: "On probation",
            value: stats.probationCount,
            tone: "text-violet-700",
          },
          {
            label: "Permanent",
            value: stats.permanentCount,
            tone: "text-emerald-700",
          },
          {
            label: "Leadership ready",
            value: stats.leadershipReadyCount,
            tone: "text-violet-700",
          },
          {
            label: "Scorecards due",
            value: stats.dueScorecardCount,
            tone: "text-violet-700",
          },
          {
            label: "Probation due",
            value: stats.dueProbationCount,
            tone: "text-amber-700",
          },
          {
            label: "Disciplinary flags",
            value: stats.activeDisciplinaryCount,
            tone: "text-red-700",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl border border-gray-200 p-5"
          >
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {stat.label}
            </p>
            <p className={`text-3xl font-bold mt-2 ${stat.tone}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Review queue</h2>
              <p className="text-xs text-gray-500 mt-1">
                Monthly scorecards, probation checkpoints, and elections closing soon.
              </p>
            </div>
            <Link href="/dashboard/people/scorecards" className="text-sm text-violet-600 hover:text-violet-700">
              Open reviews
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            <div className="px-5 py-4">
              <p className="font-medium text-gray-900">
                {reminderSnapshot.dueScorecardEmployees.length} scorecard{reminderSnapshot.dueScorecardEmployees.length === 1 ? "" : "s"} due
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Current month {reminderSnapshot.currentReviewMonth}
              </p>
            </div>
            <div className="px-5 py-4">
              <p className="font-medium text-gray-900">
                {reminderSnapshot.dueProbationSummaries.length} probation checkpoint{reminderSnapshot.dueProbationSummaries.length === 1 ? "" : "s"} due
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Includes tentative and probation employees waiting for their next checkpoint.
              </p>
            </div>
            <div className="px-5 py-4">
              <p className="font-medium text-gray-900">
                {reminderSnapshot.electionsClosingSoon.length} election reminder{reminderSnapshot.electionsClosingSoon.length === 1 ? "" : "s"} active
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Nominations or voting closes within the next 48 hours.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Recent employees</h2>
              <p className="text-xs text-gray-500 mt-1">
                New or recently updated internal staff profiles.
              </p>
            </div>
            <Link href="/dashboard/people/employees" className="text-sm text-violet-600 hover:text-violet-700">
              View all
            </Link>
          </div>
          {recentEmployees.length === 0 ? (
            <div className="px-5 py-10 text-sm text-gray-400 text-center">
              No employee profiles created yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {recentEmployees.map((employee) => (
                <div
                  key={employee.id}
                  className="px-5 py-4 flex items-start justify-between gap-4"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {employee.worker?.full_name ?? "Unnamed employee"}
                    </p>
                    <p className="text-sm text-gray-500">
                      {employee.role_title || employee.worker?.job_title || "Role pending"}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {employee.current_level?.title || "Career level pending"} ·{" "}
                      {labelizePeopleValue(employee.employment_status)}
                    </p>
                  </div>
                  <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                    {labelizePeopleValue(employee.onboarding_status)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Onboarding queue</h2>
              <p className="text-xs text-gray-500 mt-1">
                Submitted and in-progress onboarding records that need follow-up.
              </p>
            </div>
            <Link href="/dashboard/people/onboarding" className="text-sm text-violet-600 hover:text-violet-700">
              Open queue
            </Link>
          </div>
          {pendingOnboarding.length === 0 ? (
            <div className="px-5 py-10 text-sm text-gray-400 text-center">
              No onboarding records are waiting right now.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {pendingOnboarding.slice(0, 6).map((form) => (
                <div
                  key={form.id}
                  className="px-5 py-4 flex items-start justify-between gap-4"
                >
                  <div>
                    <p className="font-medium text-gray-900">{form.full_name}</p>
                    <p className="text-sm text-gray-500">{form.email}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {form.role_title || form.employee?.role_title || "Role pending"}
                    </p>
                  </div>
                  <span
                    className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                      form.status === "submitted"
                        ? "bg-violet-100 text-violet-700"
                        : form.status === "needs_changes"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {labelizePeopleValue(form.status)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
