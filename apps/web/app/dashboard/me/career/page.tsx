import {
  getNextCareerLevel,
  isLeadershipCourseReady,
  labelizePeopleValue,
} from "@/lib/people";
import {
  getEmployeeByAccountManagerId,
  listLeaderOfMonthAwards,
  listCareerLadderLevels,
  listLeadershipCourseEnrollments,
  listLeadershipTrials,
} from "@/lib/people-server";
import { getCurrentUser } from "@/lib/auth";

export default async function EmployeeCareerPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const employee = await getEmployeeByAccountManagerId(user.id);

  if (!employee) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Career Path</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">
            Your employee profile is not active yet. Contact an operations manager or
            admin for access.
          </p>
        </div>
      </div>
    );
  }

  const [levels, courseEnrollments, trials, awards] = await Promise.all([
    listCareerLadderLevels(),
    listLeadershipCourseEnrollments(employee.id),
    listLeadershipTrials(employee.id),
    listLeaderOfMonthAwards(),
  ]);
  const nextLevel = getNextCareerLevel(levels, employee.current_level?.id);
  const latestEnrollment = courseEnrollments[0] ?? null;
  const latestTrial = trials[0] ?? null;
  const ownAwards = awards.filter((award) => award.employee_id === employee.id);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Career Path</h1>
        <p className="text-sm text-gray-500 mt-1">
          JobGenuis grows leaders from inside the company through performance, discipline,
          values, and accountable execution.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6">
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Current level
              </p>
              <p className="text-xl font-bold text-violet-700 mt-2">
                {employee.current_level?.title || "Not assigned"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Next possible level
              </p>
              <p className="text-lg font-semibold text-gray-900 mt-2">
                {nextLevel?.title || "Top configured level reached"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Leadership status
              </p>
              <p className="text-lg font-semibold text-emerald-700 mt-2">
                {labelizePeopleValue(employee.leadership_status)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {isLeadershipCourseReady(employee.leadership_status)
                  ? "You are inside the active leadership pipeline."
                  : "Leadership readiness will be flagged after sustained performance and clean conduct."}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Leadership course
              </p>
              <p className="text-lg font-semibold text-gray-900 mt-2">
                {latestEnrollment
                  ? labelizePeopleValue(latestEnrollment.status)
                  : "Not started"}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {latestEnrollment?.notes ||
                  "Management will move you into course when your performance and conduct qualify."}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Leadership trial
              </p>
              <p className="text-lg font-semibold text-gray-900 mt-2">
                {latestTrial
                  ? `${latestTrial.title} / ${labelizePeopleValue(latestTrial.status)}`
                  : "Not assigned"}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {latestTrial?.outcome_notes ||
                  "Trial assignments appear here once management opens a leadership test."}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Recognition
              </p>
              <p className="text-lg font-semibold text-gray-900 mt-2">
                {ownAwards.length > 0
                  ? `${ownAwards.length} Leader of the Month award${ownAwards.length === 1 ? "" : "s"}`
                  : "No awards yet"}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {levels.map((level) => {
            const isCurrent = employee.current_level?.id === level.id;
            const isNext = nextLevel?.id === level.id;
            return (
              <div
                key={level.id}
                className={`rounded-xl border p-5 ${
                  isCurrent
                    ? "bg-violet-50 border-violet-200"
                    : isNext
                    ? "bg-violet-50 border-violet-200"
                    : "bg-white border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-gray-900">{level.title}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      {level.summary || "No summary available."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isCurrent && (
                      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
                        Current
                      </span>
                    )}
                    {isNext && !isCurrent && (
                      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
                        Next
                      </span>
                    )}
                  </div>
                </div>

                {level.requirements.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Requirements
                    </p>
                    <ul className="space-y-2 text-sm text-gray-700">
                      {level.requirements.map((requirement) => (
                        <li key={requirement} className="flex items-start gap-2">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-gray-400" />
                          <span>{requirement}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="font-semibold text-gray-900">Leader of the Month board</h2>
              <p className="text-xs text-gray-500 mt-1">
                Recognition stays public. Detailed monthly scores stay private between staff and management.
              </p>
            </div>
            {awards.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-gray-400">
                No recognition awards have been published yet.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {awards.slice(0, 6).map((award) => (
                  <div key={award.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-gray-900">
                          {award.employee?.worker?.full_name ||
                            award.employee?.role_title ||
                            "Unknown employee"}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {award.award_month} / {award.award_title}
                        </p>
                      </div>
                      {award.employee_id === employee.id && (
                        <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                          You
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-gray-600">{award.reason}</p>
                    {award.award_description && (
                      <p className="mt-1 text-xs text-gray-500">{award.award_description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
