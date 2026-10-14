import { getCurrentUser } from "@/lib/auth";
import {
  getEmployeeByAccountManagerId,
  getProbationSummaryForEmployee,
} from "@/lib/people-server";
import { getProbationCheckpointLabel, labelizePeopleValue } from "@/lib/people";

export const dynamic = "force-dynamic";

function formatDate(value: string | null): string {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString();
}

export default async function EmployeeProbationPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const employee = await getEmployeeByAccountManagerId(user.id);

  if (!employee) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">My Probation</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">
            Your employee profile is not active yet. Contact an operations manager or
            admin for access.
          </p>
        </div>
      </div>
    );
  }

  const summary = await getProbationSummaryForEmployee(employee.id);
  const reviews = (summary?.reviews ?? []).filter((review) => review.status !== "draft");
  const reviewByMonth = new Map(reviews.map((review) => [review.review_month_index, review]));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Probation</h1>
        <p className="text-sm text-gray-500 mt-1">
          Follow your probation checkpoints, accepted-offer contribution, and contract
          decision path.
        </p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Employment status
          </p>
          <p className="text-lg font-bold text-gray-900 mt-2">
            {labelizePeopleValue(employee.employment_status)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Verified offers
          </p>
          <p className="text-3xl font-bold text-violet-700 mt-2">
            {summary?.verifiedAcceptedOffersCount ?? 0}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Months completed
          </p>
          <p className="text-3xl font-bold text-violet-700 mt-2">
            {summary?.monthsCompleted ?? 0}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Early permanent
          </p>
          <p className="text-lg font-bold text-emerald-700 mt-2">
            {summary?.earlyPermanentEligible ? "Eligible" : "Not yet"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Start date</p>
            <p className="mt-1 font-semibold text-gray-900">
              {formatDate(employee.start_date)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Probation window
            </p>
            <p className="mt-1 font-semibold text-gray-900">
              {formatDate(employee.probation_start_date)} to{" "}
              {formatDate(employee.probation_end_date)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Latest decision</p>
            <p className="mt-1 font-semibold text-gray-900">
              {labelizePeopleValue(summary?.latestDecision || "pending")}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Latest scorecard average</p>
            <p className="mt-1 font-semibold text-gray-900">
              {summary?.latestScorecardAverage !== null &&
              summary?.latestScorecardAverage !== undefined
                ? `${summary.latestScorecardAverage}%`
                : "n/a"}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="font-semibold text-gray-900">Checkpoint timeline</h2>
            <p className="text-xs text-gray-500 mt-1">
              Six structured reviews guide tentative offers toward permanent contracts.
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {[1, 2, 3, 4, 5, 6].map((monthIndex) => {
              const review = reviewByMonth.get(monthIndex) ?? null;
              const due =
                summary?.dueCheckpoint === monthIndex ||
                monthIndex <= (summary?.monthsCompleted ?? 0);
              return (
                <div key={monthIndex} className="px-5 py-4 space-y-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {getProbationCheckpointLabel(monthIndex)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {review
                          ? `Reviewed on ${formatDate(review.review_date)}`
                          : due
                          ? "Checkpoint is in active review range."
                          : "Not due yet."}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          review
                            ? "bg-violet-100 text-violet-700"
                            : due
                            ? "bg-amber-100 text-amber-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {review
                          ? labelizePeopleValue(review.status)
                          : due
                          ? "Pending review"
                          : "Not due"}
                      </span>
                      {review && (
                        <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                          {labelizePeopleValue(review.final_decision)}
                        </span>
                      )}
                    </div>
                  </div>

                  {review && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-sm">
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-500">
                          Accepted offers
                        </p>
                        <p className="mt-1 font-semibold text-gray-900">
                          {review.successful_accepted_offers_count}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-500">
                          Monthly average
                        </p>
                        <p className="mt-1 font-semibold text-gray-900">
                          {review.monthly_average_score !== null
                            ? `${review.monthly_average_score}%`
                            : "n/a"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-500">
                          Early permanent
                        </p>
                        <p className="mt-1 font-semibold text-gray-900">
                          {review.early_permanent_eligible ? "Yes" : "No"}
                        </p>
                      </div>
                    </div>
                  )}

                  {review?.manager_notes && (
                    <p className="text-sm text-gray-600">{review.manager_notes}</p>
                  )}
                  {review?.warnings_summary && (
                    <p className="text-sm text-amber-700">{review.warnings_summary}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
