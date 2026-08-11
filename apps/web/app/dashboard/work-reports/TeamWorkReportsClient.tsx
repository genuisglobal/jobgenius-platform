"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { TeamWorkReportSummary } from "@/lib/work-reports-server";
import {
  deriveWorkReportReviewState,
  labelizeWorkReportReviewState,
} from "@/lib/work-reports";

function roleLabel(role: string | null | undefined) {
  const normalized = String(role ?? "").toLowerCase().trim();
  if (normalized === "superadmin") return "Super Admin";
  if (normalized === "admin") return "Admin";
  if (normalized === "ops_manager") return "Operations Manager";
  if (normalized === "accountant") return "Accountant";
  return "Account Manager";
}

function reviewStateClasses(state: ReturnType<typeof deriveWorkReportReviewState>) {
  if (state === "submitted") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  if (state === "locked") {
    return "bg-gray-100 text-gray-700 border-gray-200";
  }
  if (state === "draft") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  return "bg-red-50 text-red-700 border-red-200";
}

function summaryCard(label: string, value: number, sub: string, accent: string) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{label}</p>
      <p className={`mt-3 text-3xl font-bold ${accent}`}>{value}</p>
      <p className="mt-1 text-xs text-gray-500">{sub}</p>
    </div>
  );
}

function formatReportDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return parsed.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function historyLabel(item: {
  hasReport: boolean;
  status: "draft" | "submitted" | "locked" | null;
  manualTotal: number;
}) {
  if (item.hasReport) {
    return labelizeWorkReportReviewState(
      deriveWorkReportReviewState({
        hasReport: true,
        status: item.status,
      })
    );
  }
  return item.manualTotal > 0 ? `${item.manualTotal} manual logged` : "Activity only";
}

export default function TeamWorkReportsClient({
  summary,
  canReview,
}: {
  summary: TeamWorkReportSummary;
  canReview: boolean;
}) {
  const router = useRouter();
  const [busyReportId, setBusyReportId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const refresh = () => router.refresh();
    const interval = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [router]);

  async function updateStatus(reportId: string, status: "locked" | "submitted") {
    setBusyReportId(reportId);
    setError("");

    try {
      const response = await fetch(`/api/people/work-reports/${reportId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to update report status.");
      }
      router.refresh();
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Failed to update report status."
      );
    } finally {
      setBusyReportId(null);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-8 gap-4">
        {summaryCard(
          "Applications",
          summary.totals.applications.total,
          `Auto ${summary.totals.applications.system} · Manual ${summary.totals.applications.manual}`,
          "text-violet-700"
        )}
        {summaryCard(
          "Follow-Ups",
          summary.totals.followUps.total,
          `System ${summary.totals.followUps.system} · Manual ${summary.totals.followUps.manual}`,
          "text-violet-700"
        )}
        {summaryCard(
          "Interviews",
          summary.totals.interviews.total,
          `System ${summary.totals.interviews.system} · Manual ${summary.totals.interviews.manual}`,
          "text-emerald-700"
        )}
        {summaryCard(
          "Offers",
          summary.totals.offers.total,
          `System ${summary.totals.offers.system} · Manual ${summary.totals.offers.manual}`,
          "text-amber-700"
        )}
        {summaryCard(
          "Missing",
          summary.missingCount,
          "No report for selected day",
          "text-red-700"
        )}
        {summaryCard("Drafts", summary.draftCount, "Saved but not submitted", "text-amber-700")}
        {summaryCard("Submitted", summary.submittedCount, "Ready for manager review", "text-emerald-700")}
        {summaryCard("Locked", summary.lockedCount, "Closed for the day", "text-gray-900")}
      </div>

      <div className="space-y-4">
        {summary.rows.map((row) => (
          <div
            key={row.accountManager.id}
            className={`bg-white rounded-xl border p-6 ${
              row.reviewState === "missing" ? "border-red-200" : "border-gray-200"
            }`}
          >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {row.accountManager.name}
                  </h2>
                  <span className="text-xs font-medium text-gray-500">
                    {roleLabel(row.accountManager.role)}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${reviewStateClasses(
                      row.reviewState
                    )}`}
                  >
                    {labelizeWorkReportReviewState(row.reviewState)}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1">{row.accountManager.email}</p>
                {row.reviewState === "missing" && row.recentHistory.length > 0 && (
                  <p className="mt-2 text-xs text-violet-700">
                    Latest activity on record: {formatReportDate(row.recentHistory[0].reportDate)} ·{" "}
                    {historyLabel(row.recentHistory[0])}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 min-w-0 xl:min-w-[520px]">
                <div className="rounded-lg bg-violet-50 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-600">
                    Applications
                  </p>
                  <p className="text-2xl font-bold text-violet-900 mt-1">
                    {row.metrics.applications.total}
                  </p>
                  <p className="text-xs text-violet-700 mt-1">
                    {row.metrics.applications.system} auto · {row.metrics.applications.manual} manual
                  </p>
                </div>
                <div className="rounded-lg bg-violet-50 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-600">
                    Follow-Ups
                  </p>
                  <p className="text-2xl font-bold text-violet-900 mt-1">
                    {row.metrics.followUps.total}
                  </p>
                  <p className="text-xs text-violet-700 mt-1">
                    {row.metrics.followUps.system} system · {row.metrics.followUps.manual} manual
                  </p>
                </div>
                <div className="rounded-lg bg-emerald-50 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600">
                    Interviews
                  </p>
                  <p className="text-2xl font-bold text-emerald-900 mt-1">
                    {row.metrics.interviews.total}
                  </p>
                  <p className="text-xs text-emerald-700 mt-1">
                    {row.metrics.interviews.system} system · {row.metrics.interviews.manual} manual
                  </p>
                </div>
                <div className="rounded-lg bg-amber-50 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-600">
                    Offers
                  </p>
                  <p className="text-2xl font-bold text-amber-900 mt-1">
                    {row.metrics.offers.total}
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    {row.metrics.offers.system} system · {row.metrics.offers.manual} manual
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                    Total Work
                  </p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {row.metrics.grandTotal}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {row.metrics.systemTotal} system · {row.metrics.manualTotal} manual
                  </p>
                </div>
              </div>
            </div>

            {canReview && row.report && (
              <div className="mt-4 flex items-center gap-3">
                {row.reviewState !== "locked" ? (
                  <button
                    type="button"
                    disabled={busyReportId === row.report.id}
                    onClick={() => void updateStatus(row.report!.id, "locked")}
                    className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                  >
                    {busyReportId === row.report.id ? "Updating..." : "Lock report"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyReportId === row.report.id}
                    onClick={() => void updateStatus(row.report!.id, "submitted")}
                    className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {busyReportId === row.report.id ? "Updating..." : "Reopen"}
                  </button>
                )}
              </div>
            )}

            {row.recentHistory.length > 0 && (
              <div className="mt-5 rounded-lg border border-violet-100 bg-violet-50/60 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700">
                  Recent history
                </p>
                <p className="mt-1 text-sm text-violet-900">
                  Past report days and manual-only activity days stay visible here even when the selected day has no report yet.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {row.recentHistory.map((report) => (
                    <Link
                      key={`${row.accountManager.id}-${report.reportDate}`}
                      href={`/dashboard/work-reports?date=${report.reportDate}`}
                      className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-medium text-violet-800 hover:border-violet-300 hover:bg-violet-100/60"
                    >
                      <span>{formatReportDate(report.reportDate)}</span>
                      <span className="text-violet-500">·</span>
                      <span>{historyLabel(report)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-5">
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                  Summary
                </p>
                <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">
                  {row.report?.summaryComment || "No summary submitted yet."}
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                  Blockers
                </p>
                <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">
                  {row.report?.blockersComment || "No blockers reported."}
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                  Next Focus
                </p>
                <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">
                  {row.report?.focusNextComment || "No next-step note yet."}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
