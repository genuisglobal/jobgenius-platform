import Link from "next/link";
import {
  calculateOnboardingCompletion,
  getNextCareerLevel,
  labelizePeopleValue,
} from "@/lib/people";
import {
  getEmployeeByAccountManagerId,
  getEmployeeOnboardingForm,
  listActivePolicyDocuments,
  listCareerLadderLevels,
  listPolicyAcknowledgementsForEmployee,
} from "@/lib/people-server";
import { getCurrentUser } from "@/lib/auth";

export default async function EmployeeWorkHubPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const employee = await getEmployeeByAccountManagerId(user.id);

  if (!employee) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Employee Hub</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">
            Your staff profile has not been activated yet. Contact an operations manager or
            admin if you should have employee access.
          </p>
        </div>
      </div>
    );
  }

  const [form, policies, acknowledgements, levels] = await Promise.all([
    getEmployeeOnboardingForm(employee.id),
    listActivePolicyDocuments(),
    listPolicyAcknowledgementsForEmployee(employee.id),
    listCareerLadderLevels(),
  ]);

  const nextLevel = getNextCareerLevel(levels, employee.current_level?.id);
  const onboardingCompletion = calculateOnboardingCompletion(
    form,
    acknowledgements.length,
    policies.length
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employee Hub</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track your onboarding, employment stage, and growth path inside JobGenuis.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/me/onboarding"
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
          >
            Complete onboarding
          </Link>
          <Link
            href="/dashboard/me/permissions"
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Manage permissions
          </Link>
          <Link
            href="/dashboard/me/career"
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            View career path
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Onboarding
          </p>
          <p className="text-3xl font-bold text-violet-700 mt-2">{onboardingCompletion}%</p>
          <p className="text-xs text-gray-400 mt-1">
            {labelizePeopleValue(employee.onboarding_status)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Employment
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {labelizePeopleValue(employee.employment_status)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {employee.role_title || employee.worker?.job_title || "Role pending"}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Current level
          </p>
          <p className="text-xl font-bold text-violet-700 mt-2">
            {employee.current_level?.title || "Not assigned"}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Leadership
          </p>
          <p className="text-xl font-bold text-emerald-700 mt-2">
            {labelizePeopleValue(employee.leadership_status)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900">Current role path</h2>
          <p className="text-sm text-gray-500 mt-1">
            Growth inside JobGenuis should be clear, measurable, and earned.
          </p>
          <div className="mt-4 space-y-4">
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Current level</p>
              <p className="font-semibold text-gray-900 mt-1">
                {employee.current_level?.title || "Not assigned"}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {employee.current_level?.summary || "No level summary available yet."}
              </p>
            </div>
            <div className="rounded-lg bg-violet-50 border border-violet-100 p-4">
              <p className="text-xs uppercase tracking-wide text-violet-600">Next possible level</p>
              <p className="font-semibold text-violet-900 mt-1">
                {nextLevel?.title || "You are at the highest configured level."}
              </p>
              <p className="text-sm text-violet-800 mt-1">
                {nextLevel?.summary ||
                  "Leadership and progression decisions continue through your review cycle."}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900">What JobGenuis tracks</h2>
          <ul className="mt-4 space-y-3 text-sm text-gray-600">
            <li>Your onboarding completion and policy acknowledgements.</li>
            <li>Your employment stage: tentative, probation, permanent, or terminated.</li>
            <li>Your permission allowance window, requests, and remaining approved days.</li>
            <li>Your current ladder level and the next level requirements.</li>
            <li>Your leadership eligibility status and internal growth readiness.</li>
            <li>Your later scorecards, probation checkpoints, and recognitions.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
