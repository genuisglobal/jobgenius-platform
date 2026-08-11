"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  DailyWorkReportBundle,
  MyWorkReportHistoryRecord,
} from "@/lib/work-reports-server";
import {
  labelizeManualWorkActivityType,
  labelizeWorkReportStatus,
  MANUAL_WORK_ACTIVITY_TYPES,
  ManualWorkActivityType,
} from "@/lib/work-reports";

function statusClasses(status: string | null | undefined) {
  if (status === "submitted") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  if (status === "locked") {
    return "bg-gray-100 text-gray-700 border-gray-200";
  }
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function metricCard(
  label: string,
  total: number,
  system: number,
  manual: number,
  accent: string
) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
        {label}
      </p>
      <p className={`mt-3 text-3xl font-bold ${accent}`}>{total}</p>
      <p className="mt-1 text-xs text-gray-500">
        System {system} · Manual {manual}
      </p>
    </div>
  );
}

function formatReportDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function MyWorkReportClient({
  initialBundle,
  history,
}: {
  initialBundle: DailyWorkReportBundle;
  history: MyWorkReportHistoryRecord[];
}) {
  const [bundle, setBundle] = useState(initialBundle);
  const [summaryComment, setSummaryComment] = useState(
    initialBundle.report?.summaryComment ?? ""
  );
  const [blockersComment, setBlockersComment] = useState(
    initialBundle.report?.blockersComment ?? ""
  );
  const [focusNextComment, setFocusNextComment] = useState(
    initialBundle.report?.focusNextComment ?? ""
  );
  const [activityType, setActivityType] = useState<ManualWorkActivityType>("application_manual");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const locked = bundle.report?.status === "locked";

  function syncBundle(nextBundle: DailyWorkReportBundle, nextSuccess: string) {
    setBundle(nextBundle);
    setSummaryComment(nextBundle.report?.summaryComment ?? "");
    setBlockersComment(nextBundle.report?.blockersComment ?? "");
    setFocusNextComment(nextBundle.report?.focusNextComment ?? "");
    setError("");
    setSuccess(nextSuccess);
  }

  async function saveReport(submit: boolean) {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/am/work-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportDate: bundle.reportDate,
          summaryComment,
          blockersComment,
          focusNextComment,
          submit,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save report.");
      }
      syncBundle(payload as DailyWorkReportBundle, submit ? "Report submitted." : "Draft saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save report.");
    } finally {
      setSaving(false);
    }
  }

  async function addManualActivity() {
    const numericQuantity = Number(quantity);
    if (!Number.isInteger(numericQuantity) || numericQuantity <= 0) {
      setError("Quantity must be a positive whole number.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/am/work-reports/manual-activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportDate: bundle.reportDate,
          activityType,
          quantity: numericQuantity,
          note,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to add manual activity.");
      }
      syncBundle(payload as DailyWorkReportBundle, "Manual activity logged.");
      setQuantity("1");
      setNote("");
    } catch (activityError) {
      setError(
        activityError instanceof Error
          ? activityError.message
          : "Failed to add manual activity."
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeManualActivity(activityId: string) {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/am/work-reports/manual-activities/${activityId}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to remove manual activity.");
      }
      syncBundle(payload as DailyWorkReportBundle, "Manual activity removed.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to remove manual activity."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {metricCard(
          "Applications",
          bundle.metrics.applications.total,
          bundle.metrics.applications.system,
          bundle.metrics.applications.manual,
          "text-violet-700"
        )}
        {metricCard(
          "Follow-Ups",
          bundle.metrics.followUps.total,
          bundle.metrics.followUps.system,
          bundle.metrics.followUps.manual,
          "text-violet-700"
        )}
        {metricCard(
          "Interviews",
          bundle.metrics.interviews.total,
          bundle.metrics.interviews.system,
          bundle.metrics.interviews.manual,
          "text-emerald-700"
        )}
        {metricCard(
          "Offers",
          bundle.metrics.offers.total,
          bundle.metrics.offers.system,
          bundle.metrics.offers.manual,
          "text-amber-700"
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Quick daily report</h2>
              <p className="text-sm text-gray-500 mt-1">
                Add a summary and save. System and manual counts are included automatically.
              </p>
            </div>
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(
                bundle.report?.status
              )}`}
            >
              {labelizeWorkReportStatus(bundle.report?.status ?? "draft")}
            </span>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {success}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-2">
                What did you work on?
              </label>
              <textarea
                value={summaryComment}
                onChange={(event) => setSummaryComment(event.target.value)}
                rows={4}
                disabled={locked || saving}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:bg-gray-50"
                placeholder="What moved today? Mention key seeker progress, outreach wins, or application volume."
              />
            </div>

            <details className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <summary className="cursor-pointer text-sm font-medium text-gray-700">
                Add blockers or next focus (optional)
              </summary>
              <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-2">
                Blockers
              </label>
              <textarea
                value={blockersComment}
                onChange={(event) => setBlockersComment(event.target.value)}
                rows={3}
                disabled={locked || saving}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:bg-gray-50"
                placeholder="What needs support, approval, or escalation?"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-800 mb-2">
                Next focus
              </label>
              <textarea
                value={focusNextComment}
                onChange={(event) => setFocusNextComment(event.target.value)}
                rows={3}
                disabled={locked || saving}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:bg-gray-50"
                placeholder="What are you prioritizing next?"
              />
            </div>
              </div>
            </details>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={locked || saving}
              onClick={() => void saveReport(true)}
              className="px-4 py-2 rounded-lg bg-violet-600 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save report"}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Manual activity log</h2>
              <p className="text-sm text-gray-500 mt-1">
                Add counts the platform could not infer on its own.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-2">Activity type</label>
                <select
                  value={activityType}
                  onChange={(event) => setActivityType(event.target.value as ManualWorkActivityType)}
                  disabled={locked || saving}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:bg-gray-50"
                >
                  {MANUAL_WORK_ACTIVITY_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {labelizeManualWorkActivityType(type)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-800 mb-2">Quantity</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  disabled={locked || saving}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:bg-gray-50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-800 mb-2">
                  Note
                </label>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  disabled={locked || saving}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:bg-gray-50"
                  placeholder="Optional context for the manual count."
                />
              </div>

              <button
                type="button"
                disabled={locked || saving}
                onClick={() => void addManualActivity()}
                className="w-full px-4 py-2 rounded-lg bg-violet-600 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add manual activity
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Manual entries</h2>
                <p className="text-sm text-gray-500 mt-1">
                  These entries feed the totals shown to the team.
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Manual total</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{bundle.metrics.manualTotal}</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {bundle.manualActivities.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500 text-center">
                  No manual entries yet for this day.
                </div>
              ) : (
                bundle.manualActivities.map((activity) => (
                  <div
                    key={activity.id}
                    className="rounded-lg border border-gray-200 px-4 py-3 flex items-start justify-between gap-4"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {labelizeManualWorkActivityType(activity.activityType)} · {activity.quantity}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(activity.createdAt).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                      {activity.note && (
                        <p className="text-sm text-gray-600 mt-2 whitespace-pre-line">
                          {activity.note}
                        </p>
                      )}
                    </div>
                    {!locked && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void removeManualActivity(activity.id)}
                        className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900">Past reports</h2>
        <p className="mt-1 text-sm text-gray-500">
          Your submitted, draft, and manual-only report days are kept here.
        </p>

        <div className="mt-4 space-y-3">
          {history.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
              No past reports yet.
            </div>
          ) : (
            history.map((item) => (
              <Link
                key={item.reportDate}
                href={`/dashboard/work-reports/me?date=${item.reportDate}`}
                className="block rounded-lg border border-gray-200 px-4 py-4 hover:border-violet-300 hover:bg-violet-50/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{formatReportDate(item.reportDate)}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-gray-600">
                      {item.report?.summaryComment ||
                        (item.manualTotal > 0
                          ? `${item.manualTotal} manual activities logged.`
                          : "No summary entered.")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.manualTotal > 0 && (
                      <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">
                        {item.manualTotal} manual
                      </span>
                    )}
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(
                        item.report?.status
                      )}`}
                    >
                      {item.report
                        ? labelizeWorkReportStatus(item.report.status)
                        : "Activity only"}
                    </span>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
