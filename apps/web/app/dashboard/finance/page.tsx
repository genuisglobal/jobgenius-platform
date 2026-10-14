import Link from "next/link";
import { formatCurrency } from "@/lib/payroll";
import {
  getSocialFundSummary,
  listAcceptedOfferRecords,
  listEmployeeBonusRecords,
} from "@/lib/people-server";

export const dynamic = "force-dynamic";

function isSameMonth(value: string | null, monthStart: string): boolean {
  return Boolean(value && value.startsWith(monthStart));
}

export default async function FinanceOverviewPage() {
  const [offers, bonuses, socialFund] = await Promise.all([
    listAcceptedOfferRecords(),
    listEmployeeBonusRecords(),
    getSocialFundSummary(),
  ]);

  const monthStart = new Date().toISOString().slice(0, 7);
  const verifiedOffers = offers.filter((offer) => offer.verification_status === "verified");
  const pendingBonusApprovals = bonuses.filter(
    (bonus) =>
      bonus.approval_status === "pending_verification" ||
      bonus.approval_status === "eligible"
  );
  const bonusesPayableThisMonth = bonuses.filter(
    (bonus) =>
      isSameMonth(bonus.payment_month, monthStart) &&
      bonus.payment_status !== "paid" &&
      bonus.payment_status !== "cancelled"
  );
  const pendingExpenses = socialFund.expenses.filter(
    (expense) => expense.status === "proposed" || expense.status === "approved"
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finance Overview</h1>
          <p className="text-sm text-gray-500 mt-1">
            Accepted offers, employee bonuses, and social fund controls.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/finance/bonuses"
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
          >
            Manage bonuses
          </Link>
          <Link
            href="/dashboard/finance/social-fund"
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Open social fund
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Verified offers",
            value: verifiedOffers.length,
            tone: "text-emerald-700",
          },
          {
            label: "Bonus approvals due",
            value: pendingBonusApprovals.length,
            tone: "text-amber-700",
          },
          {
            label: "Bonuses payable this month",
            value: bonusesPayableThisMonth.length,
            tone: "text-violet-700",
          },
          {
            label: "Social fund balance",
            value: formatCurrency(socialFund.totals.balance, "XAF"),
            tone: "text-violet-700",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl border border-gray-200 p-5"
          >
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {stat.label}
            </p>
            <p className={`text-2xl font-bold mt-2 ${stat.tone}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Recent accepted offers</h2>
              <p className="text-xs text-gray-500 mt-1">
                Verified offers drive both staff bonuses and social fund contributions.
              </p>
            </div>
            <Link
              href="/dashboard/finance/bonuses"
              className="text-sm text-violet-600 hover:text-violet-700"
            >
              View all
            </Link>
          </div>
          {offers.length === 0 ? (
            <div className="px-5 py-10 text-sm text-gray-400 text-center">
              No accepted offers have been recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {offers.slice(0, 6).map((offer) => (
                <div key={offer.id} className="px-5 py-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-gray-900">{offer.offer_title}</p>
                    <p className="text-sm text-gray-500">
                      {offer.company_name} /{" "}
                      {offer.employee?.worker?.full_name || "Unassigned employee"}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Start month {offer.start_month || offer.client_start_date || "pending"}
                    </p>
                  </div>
                  <span
                    className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                      offer.verification_status === "verified"
                        ? "bg-emerald-100 text-emerald-700"
                        : offer.verification_status === "rejected"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {offer.verification_status.replace(/_/g, " ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Social fund snapshot</h2>
              <p className="text-xs text-gray-500 mt-1">
                Transparent balance, reserved approvals, and approved team spending.
              </p>
            </div>
            <Link
              href="/dashboard/finance/social-fund"
              className="text-sm text-violet-600 hover:text-violet-700"
            >
              Manage fund
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-4 p-5 border-b border-gray-100">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Contributed
              </p>
              <p className="text-lg font-bold text-emerald-700 mt-2">
                {formatCurrency(socialFund.totals.contributed, "XAF")}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Paid out
              </p>
              <p className="text-lg font-bold text-gray-900 mt-2">
                {formatCurrency(socialFund.totals.spent, "XAF")}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Reserved
              </p>
              <p className="text-lg font-bold text-amber-700 mt-2">
                {formatCurrency(socialFund.totals.approvedReserved, "XAF")}
              </p>
            </div>
          </div>
          {pendingExpenses.length === 0 ? (
            <div className="px-5 py-10 text-sm text-gray-400 text-center">
              No pending social fund approvals right now.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {pendingExpenses.slice(0, 5).map((expense) => (
                <div key={expense.id} className="px-5 py-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-gray-900">{expense.expense_title}</p>
                    <p className="text-sm text-gray-500">
                      {formatCurrency(expense.amount, "XAF")} /{" "}
                      {expense.requested_by_employee?.worker?.full_name || "Unknown requester"}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {expense.purpose || "No purpose supplied"}
                    </p>
                  </div>
                  <span
                    className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                      expense.status === "approved"
                        ? "bg-violet-100 text-violet-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {expense.status.replace(/_/g, " ")}
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
