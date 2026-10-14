import { getCurrentUser } from "@/lib/auth";
import { formatCurrency } from "@/lib/payroll";
import {
  getEmployeeByAccountManagerId,
  getSocialFundSummary,
  getSocialLeadEligibilityForEmployee,
  listSocialLeadCandidates,
  listSocialLeadElections,
  listSocialLeadTerms,
  listSocialLeadVotes,
} from "@/lib/people-server";
import { labelizePeopleValue } from "@/lib/people";
import EmployeeSocialClient from "./EmployeeSocialClient";

export const dynamic = "force-dynamic";

export default async function EmployeeSocialFundPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const employee = await getEmployeeByAccountManagerId(user.id);

  if (!employee) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Social Fund</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">
            Your employee profile is not active yet. Contact an operations manager or
            admin for access.
          </p>
        </div>
      </div>
    );
  }

  const [summary, elections, candidates, terms, votes, eligibility] = await Promise.all([
    getSocialFundSummary(),
    listSocialLeadElections(),
    listSocialLeadCandidates(),
    listSocialLeadTerms(),
    listSocialLeadVotes(),
    getSocialLeadEligibilityForEmployee(employee.id),
  ]);
  const ownContributions = summary.contributions.filter(
    (contribution) => contribution.employee_id === employee.id
  );
  const publicExpenses = summary.expenses.filter((expense) =>
    ["approved", "paid"].includes(expense.status)
  );
  const visibleEvents = summary.events.filter((event) => event.status !== "completed");

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Social Fund</h1>
        <p className="text-sm text-gray-500 mt-1">
          Team welfare balance, approved spending, and upcoming social activities.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Fund balance
          </p>
          <p className="text-2xl font-bold text-violet-700 mt-2">
            {formatCurrency(summary.totals.balance, "XAF")}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Total contributed
          </p>
          <p className="text-2xl font-bold text-emerald-700 mt-2">
            {formatCurrency(summary.totals.contributed, "XAF")}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Your verified contributions
          </p>
          <p className="text-2xl font-bold text-violet-700 mt-2">
            {ownContributions.length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Upcoming events
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {visibleEvents.length}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Approved expenses</h2>
            <p className="text-xs text-gray-500 mt-1">
              Only approved and paid expenses are visible here.
            </p>
          </div>
          {publicExpenses.length === 0 ? (
            <div className="px-5 py-10 text-sm text-gray-400 text-center">
              No approved expenses have been published yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {publicExpenses.slice(0, 8).map((expense) => (
                <div key={expense.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-gray-900">{expense.expense_title}</p>
                      <p className="text-sm text-gray-500">
                        {expense.purpose || "No purpose supplied"}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {expense.requested_by_employee?.worker?.full_name || "Unknown requester"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">
                        {formatCurrency(expense.amount, "XAF")}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {labelizePeopleValue(expense.status)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Upcoming social events</h2>
            <p className="text-xs text-gray-500 mt-1">
              Management-approved activities and who is coordinating them.
            </p>
          </div>
          {visibleEvents.length === 0 ? (
            <div className="px-5 py-10 text-sm text-gray-400 text-center">
              No social events are scheduled yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {visibleEvents.slice(0, 8).map((event) => (
                <div key={event.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-gray-900">{event.title}</p>
                      <p className="text-sm text-gray-500">
                        {event.description || "No description"}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {event.coordinator?.worker?.full_name || "Coordinator pending"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">
                        {event.event_date || "Date pending"}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {labelizePeopleValue(event.status)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <EmployeeSocialClient
        currentEmployeeId={employee.id}
        elections={elections}
        candidates={candidates}
        terms={terms}
        votes={votes}
        eligibility={
          eligibility
            ? {
                tenureMonths: eligibility.tenureMonths,
                averageScore: eligibility.averageScore,
                completedTerms: eligibility.completedTerms,
                eligible: eligibility.eligible,
                reasons: eligibility.reasons,
              }
            : null
        }
      />
    </div>
  );
}
