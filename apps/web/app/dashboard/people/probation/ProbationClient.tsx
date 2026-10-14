"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getProbationCheckpointLabel,
  labelizePeopleValue,
  type ProbationDecisionStatus,
  type ProbationReviewStatus,
} from "@/lib/people";

interface ProbationReview {
  id: string;
  review_month_index: number;
  checkpoint_label: string;
  review_date: string | null;
  status: string;
  successful_accepted_offers_count: number;
  monthly_average_score: number | null;
  manager_notes: string | null;
  warnings_summary: string | null;
  early_permanent_eligible: boolean;
  final_decision: string;
}

interface ProbationSummary {
  employee: {
    id: string;
    role_title: string | null;
    start_date: string | null;
    probation_start_date: string | null;
    probation_end_date: string | null;
    employment_status: string;
    leadership_status: string;
    worker: {
      full_name: string;
      email: string | null;
      job_title: string | null;
    } | null;
    current_level: {
      title: string;
    } | null;
  };
  reviews: ProbationReview[];
  verifiedAcceptedOffersCount: number;
  latestScorecardAverage: number | null;
  monthsCompleted: number;
  dueCheckpoint: number | null;
  earlyPermanentEligible: boolean;
  latestDecision: string | null;
}

function formatDate(value: string | null): string {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString();
}

function getEmployeeLabel(summary: ProbationSummary): string {
  return (
    summary.employee.worker?.full_name ||
    summary.employee.role_title ||
    summary.employee.worker?.job_title ||
    summary.employee.id
  );
}

function getDefaultReviewMonthIndex(summary: ProbationSummary | null): number {
  if (!summary) return 1;
  return summary.dueCheckpoint || Math.min(Math.max(summary.monthsCompleted, 1), 6);
}

function getDecisionTone(decision: string | null): string {
  switch (decision) {
    case "permanent_approved":
      return "bg-emerald-100 text-emerald-700";
    case "probation_failed":
      return "bg-red-100 text-red-700";
    case "management_review":
    case "role_change_recommended":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

export default function ProbationClient({
  initialSummaries,
}: {
  initialSummaries: ProbationSummary[];
}) {
  const router = useRouter();
  const [summaries, setSummaries] = useState(initialSummaries);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(
    initialSummaries[0]?.employee.id ?? ""
  );
  const [selectedReviewMonthIndex, setSelectedReviewMonthIndex] = useState(1);
  const [reviewDate, setReviewDate] = useState("");
  const [reviewStatus, setReviewStatus] = useState<ProbationReviewStatus>("draft");
  const [finalDecision, setFinalDecision] =
    useState<ProbationDecisionStatus>("pending");
  const [successfulAcceptedOffersCount, setSuccessfulAcceptedOffersCount] = useState("0");
  const [monthlyAverageScore, setMonthlyAverageScore] = useState("");
  const [managerNotes, setManagerNotes] = useState("");
  const [warningsSummary, setWarningsSummary] = useState("");
  const [earlyPermanentEligible, setEarlyPermanentEligible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  useEffect(() => {
    setSummaries(initialSummaries);
  }, [initialSummaries]);

  useEffect(() => {
    if (!initialSummaries.length) {
      setSelectedEmployeeId("");
      return;
    }
    const exists = initialSummaries.some(
      (summary) => summary.employee.id === selectedEmployeeId
    );
    if (!exists) {
      setSelectedEmployeeId(initialSummaries[0]?.employee.id ?? "");
    }
  }, [initialSummaries, selectedEmployeeId]);

  const selectedSummary = useMemo(
    () =>
      summaries.find((summary) => summary.employee.id === selectedEmployeeId) ?? null,
    [selectedEmployeeId, summaries]
  );

  useEffect(() => {
    setSelectedReviewMonthIndex(getDefaultReviewMonthIndex(selectedSummary));
  }, [selectedSummary]);

  const selectedReview = useMemo(
    () =>
      selectedSummary?.reviews.find(
        (review) => review.review_month_index === selectedReviewMonthIndex
      ) ?? null,
    [selectedReviewMonthIndex, selectedSummary]
  );

  useEffect(() => {
    if (!selectedSummary) {
      setReviewDate("");
      setReviewStatus("draft");
      setFinalDecision("pending");
      setSuccessfulAcceptedOffersCount("0");
      setMonthlyAverageScore("");
      setManagerNotes("");
      setWarningsSummary("");
      setEarlyPermanentEligible(false);
      return;
    }

    if (selectedReview) {
      setReviewDate(selectedReview.review_date || "");
      setReviewStatus(selectedReview.status as ProbationReviewStatus);
      setFinalDecision(selectedReview.final_decision as ProbationDecisionStatus);
      setSuccessfulAcceptedOffersCount(
        String(selectedReview.successful_accepted_offers_count || 0)
      );
      setMonthlyAverageScore(
        selectedReview.monthly_average_score !== null
          ? String(selectedReview.monthly_average_score)
          : ""
      );
      setManagerNotes(selectedReview.manager_notes || "");
      setWarningsSummary(selectedReview.warnings_summary || "");
      setEarlyPermanentEligible(selectedReview.early_permanent_eligible);
      return;
    }

    setReviewDate("");
    setReviewStatus("draft");
    setFinalDecision("pending");
    setSuccessfulAcceptedOffersCount(String(selectedSummary.verifiedAcceptedOffersCount || 0));
    setMonthlyAverageScore(
      selectedSummary.latestScorecardAverage !== null
        ? String(selectedSummary.latestScorecardAverage)
        : ""
    );
    setManagerNotes("");
    setWarningsSummary("");
    setEarlyPermanentEligible(selectedSummary.earlyPermanentEligible);
  }, [selectedReview, selectedSummary]);

  const probationCount = summaries.filter((summary) =>
    ["tentative", "probation"].includes(summary.employee.employment_status)
  ).length;
  const dueCheckpointCount = summaries.filter(
    (summary) => summary.dueCheckpoint !== null
  ).length;
  const earlyEligibleCount = summaries.filter(
    (summary) => summary.earlyPermanentEligible
  ).length;
  const permanentApprovedCount = summaries.filter(
    (summary) => summary.latestDecision === "permanent_approved"
  ).length;

  async function saveReview() {
    if (!selectedSummary) {
      setMessage({ type: "error", text: "Select an employee first." });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/people/probation/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: selectedSummary.employee.id,
          review_month_index: selectedReviewMonthIndex,
          review_date: reviewDate || null,
          status: reviewStatus,
          final_decision: finalDecision,
          successful_accepted_offers_count: Number(successfulAcceptedOffersCount || 0),
          monthly_average_score:
            monthlyAverageScore === "" ? null : Number(monthlyAverageScore),
          manager_notes: managerNotes || null,
          warnings_summary: warningsSummary || null,
          early_permanent_eligible: earlyPermanentEligible,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to save review." });
        return;
      }
      setMessage({ type: "success", text: "Probation review updated." });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Probation Management</h1>
        <p className="text-sm text-gray-500 mt-1">
          Track checkpoint reviews, early permanent eligibility, conduct, and final
          employment decisions.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Tentative or probation
          </p>
          <p className="text-3xl font-bold text-violet-700 mt-2">{probationCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Checkpoints due
          </p>
          <p className="text-3xl font-bold text-amber-700 mt-2">{dueCheckpointCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Early permanent
          </p>
          <p className="text-3xl font-bold text-emerald-700 mt-2">
            {earlyEligibleCount}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Permanent approved
          </p>
          <p className="text-3xl font-bold text-violet-700 mt-2">
            {permanentApprovedCount}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="font-semibold text-gray-900">Employee probation list</h2>
            <p className="text-xs text-gray-500 mt-1">
              Select an employee to review or update checkpoint decisions.
            </p>
          </div>
          {summaries.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-400">
              No employee probation records yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {summaries.map((summary) => {
                const active = summary.employee.id === selectedEmployeeId;
                return (
                  <button
                    key={summary.employee.id}
                    onClick={() => setSelectedEmployeeId(summary.employee.id)}
                    className={`w-full px-5 py-4 text-left transition-colors ${
                      active ? "bg-violet-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-gray-900">
                          {getEmployeeLabel(summary)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {summary.employee.role_title ||
                            summary.employee.worker?.job_title ||
                            "Role pending"}
                        </p>
                      </div>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          summary.dueCheckpoint !== null
                            ? "bg-amber-100 text-amber-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {summary.dueCheckpoint !== null
                          ? `Due M${summary.dueCheckpoint}`
                          : "Up to date"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-gray-400">
                      {labelizePeopleValue(summary.employee.employment_status)} /{" "}
                      {summary.verifiedAcceptedOffersCount} verified offers /{" "}
                      {summary.monthsCompleted} months completed
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {!selectedSummary ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 px-6 py-12 text-center text-sm text-gray-400">
              Select an employee to manage probation checkpoints.
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-900">
                      {getEmployeeLabel(selectedSummary)}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                      {selectedSummary.employee.role_title ||
                        selectedSummary.employee.worker?.job_title ||
                        "Role pending"}{" "}
                      / {selectedSummary.employee.current_level?.title || "Level pending"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">
                      {labelizePeopleValue(selectedSummary.employee.employment_status)}
                    </span>
                    <span className="inline-flex rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">
                      {labelizePeopleValue(selectedSummary.employee.leadership_status)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">
                      Start
                    </p>
                    <p className="mt-1 font-semibold text-gray-900">
                      {formatDate(selectedSummary.employee.start_date)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">
                      Probation end
                    </p>
                    <p className="mt-1 font-semibold text-gray-900">
                      {formatDate(selectedSummary.employee.probation_end_date)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">
                      Verified offers
                    </p>
                    <p className="mt-1 font-semibold text-gray-900">
                      {selectedSummary.verifiedAcceptedOffersCount}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">
                      Latest average
                    </p>
                    <p className="mt-1 font-semibold text-gray-900">
                      {selectedSummary.latestScorecardAverage !== null
                        ? `${selectedSummary.latestScorecardAverage}%`
                        : "n/a"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Checkpoint</span>
                    <select
                      value={selectedReviewMonthIndex}
                      onChange={(event) =>
                        setSelectedReviewMonthIndex(Number(event.target.value))
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      {[1, 2, 3, 4, 5, 6].map((monthIndex) => (
                        <option key={monthIndex} value={monthIndex}>
                          {getProbationCheckpointLabel(monthIndex)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Review date</span>
                    <input
                      type="date"
                      value={reviewDate}
                      onChange={(event) => setReviewDate(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Status</span>
                    <select
                      value={reviewStatus}
                      onChange={(event) =>
                        setReviewStatus(event.target.value as ProbationReviewStatus)
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="draft">Draft</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="completed">Completed</option>
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">
                      Successful accepted offers
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={successfulAcceptedOffersCount}
                      onChange={(event) =>
                        setSuccessfulAcceptedOffersCount(event.target.value)
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">
                      Monthly average score
                    </span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={monthlyAverageScore}
                      onChange={(event) => setMonthlyAverageScore(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Final decision</span>
                    <select
                      value={finalDecision}
                      onChange={(event) =>
                        setFinalDecision(event.target.value as ProbationDecisionStatus)
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="pending">Pending</option>
                      <option value="permanent_approved">Permanent approved</option>
                      <option value="management_review">Management review</option>
                      <option value="role_change_recommended">
                        Role change recommended
                      </option>
                      <option value="probation_failed">Probation failed</option>
                    </select>
                  </label>
                </div>

                <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={earlyPermanentEligible}
                    onChange={(event) => setEarlyPermanentEligible(event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Early permanent eligibility
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Use this when verified accepted-offer contribution or management review
                      justifies early confirmation.
                    </p>
                  </div>
                </label>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Manager notes</span>
                    <textarea
                      value={managerNotes}
                      onChange={(event) => setManagerNotes(event.target.value)}
                      className="mt-1 min-h-[112px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Performance, conduct, reporting, and overall fit notes."
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">
                      Warnings or disciplinary summary
                    </span>
                    <textarea
                      value={warningsSummary}
                      onChange={(event) => setWarningsSummary(event.target.value)}
                      className="mt-1 min-h-[112px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Warnings, reliability concerns, or issues that matter for review."
                    />
                  </label>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs text-gray-500">
                    Month 6 should capture the permanent contract decision unless management
                    closes the probation earlier.
                  </p>
                  <button
                    onClick={saveReview}
                    disabled={saving}
                    className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save probation review"}
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="border-b border-gray-200 px-5 py-4">
                  <h2 className="font-semibold text-gray-900">Checkpoint history</h2>
                  <p className="text-xs text-gray-500 mt-1">
                    Existing review records for this employee.
                  </p>
                </div>
                {selectedSummary.reviews.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-gray-400">
                    No probation reviews saved yet.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {selectedSummary.reviews.map((review) => (
                      <div key={review.id} className="px-5 py-4 space-y-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="font-medium text-gray-900">
                              {review.checkpoint_label}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              Review date: {formatDate(review.review_date)}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                              {labelizePeopleValue(review.status)}
                            </span>
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getDecisionTone(
                                review.final_decision
                              )}`}
                            >
                              {labelizePeopleValue(review.final_decision)}
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                            <p className="text-xs uppercase tracking-wide text-gray-500">
                              Accepted offers
                            </p>
                            <p className="mt-1 font-semibold text-gray-900">
                              {review.successful_accepted_offers_count}
                            </p>
                          </div>
                          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                            <p className="text-xs uppercase tracking-wide text-gray-500">
                              Average score
                            </p>
                            <p className="mt-1 font-semibold text-gray-900">
                              {review.monthly_average_score !== null
                                ? `${review.monthly_average_score}%`
                                : "n/a"}
                            </p>
                          </div>
                          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                            <p className="text-xs uppercase tracking-wide text-gray-500">
                              Early permanent
                            </p>
                            <p className="mt-1 font-semibold text-gray-900">
                              {review.early_permanent_eligible ? "Yes" : "No"}
                            </p>
                          </div>
                          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                            <p className="text-xs uppercase tracking-wide text-gray-500">
                              Final decision
                            </p>
                            <p className="mt-1 font-semibold text-gray-900">
                              {labelizePeopleValue(review.final_decision)}
                            </p>
                          </div>
                        </div>
                        {(review.manager_notes || review.warnings_summary) && (
                          <div className="space-y-2 text-sm text-gray-600">
                            {review.manager_notes && <p>{review.manager_notes}</p>}
                            {review.warnings_summary && (
                              <p className="text-amber-700">{review.warnings_summary}</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
