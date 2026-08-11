import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getDailyWorkReportBundle,
  listMyWorkReportHistory,
} from "@/lib/work-reports-server";
import { normalizeWorkReportDate } from "@/lib/work-reports";
import MyWorkReportClient from "./MyWorkReportClient";

type PageProps = {
  searchParams?: {
    date?: string;
  };
};

export default async function MyWorkReportPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    redirect("/login");
  }

  const reportDate = normalizeWorkReportDate(searchParams?.date);
  const [bundle, history] = await Promise.all([
    getDailyWorkReportBundle(user.id, reportDate),
    listMyWorkReportHistory(user.id, normalizeWorkReportDate()),
  ]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Work Report</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track what the platform handled automatically, add any missing manual work, and
            leave a clear execution note for the team.
          </p>
        </div>

        <form className="flex items-center gap-2" method="GET">
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

      <MyWorkReportClient
        initialBundle={bundle}
        history={history.filter((item) => item.reportDate !== reportDate)}
      />
    </div>
  );
}
