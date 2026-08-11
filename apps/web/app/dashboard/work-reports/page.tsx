import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";
import { listTeamWorkReportRows } from "@/lib/work-reports-server";
import { normalizeWorkReportDate } from "@/lib/work-reports";
import TeamWorkReportsClient from "./TeamWorkReportsClient";

type PageProps = {
  searchParams?: {
    date?: string;
  };
};

export default async function TeamWorkReportsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    redirect("/login");
  }

  const reportDate = normalizeWorkReportDate(searchParams?.date);
  const summary = await listTeamWorkReportRows(reportDate);
  const canReview = isPeopleManagerRole(user.role);

  const today = normalizeWorkReportDate();
  const yesterday = normalizeWorkReportDate(
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Work Reports</h1>
          <p className="text-sm text-gray-500 mt-1">
            Daily execution visibility across account managers and internal staff.
          </p>
          {canReview && (
            <p className="text-xs text-violet-700 mt-2">
              You can lock reviewed reports and reopen them when corrections are needed.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/dashboard/work-reports?date=${today}`}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${
              reportDate === today
                ? "bg-violet-600 text-white"
                : "border border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            Today
          </Link>
          <Link
            href={`/dashboard/work-reports?date=${yesterday}`}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${
              reportDate === yesterday
                ? "bg-violet-600 text-white"
                : "border border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            Yesterday
          </Link>
          <Link
            href={`/dashboard/work-reports/me?date=${reportDate}`}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            My report
          </Link>
          <form method="GET" className="flex items-center gap-2">
            <input
              type="date"
              name="date"
              defaultValue={reportDate}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              View day
            </button>
          </form>
        </div>
      </div>

      <TeamWorkReportsClient summary={summary} canReview={canReview} />
    </div>
  );
}

