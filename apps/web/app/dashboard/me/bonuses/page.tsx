import { getCurrentUser } from "@/lib/auth";
import { formatCurrency } from "@/lib/payroll";
import {
  getEmployeeByAccountManagerId,
  listAcceptedOfferRecords,
  listEmployeeBonusRecords,
} from "@/lib/people-server";
import { labelizePeopleValue } from "@/lib/people";

export const dynamic = "force-dynamic";

export default async function EmployeeBonusesPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const employee = await getEmployeeByAccountManagerId(user.id);

  if (!employee) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">My Bonuses</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">
            Your employee profile is not active yet. Contact an operations manager or
            admin for access.
          </p>
        </div>
      </div>
    );
  }

  const [offers, bonuses] = await Promise.all([
    listAcceptedOfferRecords(employee.id),
    listEmployeeBonusRecords(employee.id),
  ]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Bonuses</h1>
        <p className="text-sm text-gray-500 mt-1">
          Track verified offers, bonus approval, and payment timing.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Verified offers
          </p>
          <p className="text-2xl font-bold text-emerald-700 mt-2">
            {offers.filter((offer) => offer.verification_status === "verified").length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Pending approval
          </p>
          <p className="text-2xl font-bold text-amber-700 mt-2">
            {
              bonuses.filter(
                (bonus) =>
                  bonus.approval_status === "pending_verification" ||
                  bonus.approval_status === "eligible"
              ).length
            }
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Paid bonuses
          </p>
          <p className="text-2xl font-bold text-violet-700 mt-2">
            {bonuses.filter((bonus) => bonus.payment_status === "paid").length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Total earned
          </p>
          <p className="text-2xl font-bold text-violet-700 mt-2">
            {formatCurrency(
              bonuses
                .filter((bonus) => bonus.payment_status === "paid")
                .reduce((sum, bonus) => sum + (Number(bonus.bonus_amount) || 0), 0),
              "XAF"
            )}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Bonus records</h2>
          <p className="text-xs text-gray-500 mt-1">
            30,000 FCFA becomes payable in the month the verified client start date arrives.
          </p>
        </div>
        {bonuses.length === 0 ? (
          <div className="px-5 py-10 text-sm text-gray-400 text-center">
            No bonus records have been created yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {bonuses.map((bonus) => (
              <div key={bonus.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-gray-900">
                      {bonus.accepted_offer?.offer_title || "Accepted offer"}
                    </p>
                    <p className="text-sm text-gray-500">
                      {bonus.accepted_offer?.company_name || "Unknown company"}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Approval {labelizePeopleValue(bonus.approval_status)} / Payment{" "}
                      {labelizePeopleValue(bonus.payment_status)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">
                      {formatCurrency(bonus.bonus_amount, "XAF")}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Pay month {bonus.payment_month || "pending"}
                    </p>
                  </div>
                </div>
                {bonus.notes && <p className="mt-2 text-sm text-gray-600">{bonus.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
