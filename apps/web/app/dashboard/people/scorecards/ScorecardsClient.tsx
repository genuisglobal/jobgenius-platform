"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  calculateWeightedScorecardTotal,
  clampScore,
  labelizePeopleValue,
  type ScorecardCategory,
} from "@/lib/people";

interface EmployeeListRow {
  id: string;
  role_title: string | null;
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
}

interface ScorecardRecord {
  id: string;
  employee_id: string;
  review_month: string;
  status: string;
  final_total: number;
  overall_comments: string | null;
  reviewed_at: string | null;
  acknowledged_at: string | null;
  reviewer: {
    name: string | null;
    email: string;
  } | null;
  items: Array<{
    id: string;
    category_id: string;
    numeric_score: number;
    manager_comments: string | null;
    evidence_notes: string | null;
    attachment_url: string | null;
    category: ScorecardCategory | null;
  }>;
}

interface LeadershipRecord {
  id: string;
  employee_id: string;
  review_month: string;
  average_score: number | null;
  auto_flagged: boolean;
  has_blocking_issue: boolean;
  status: string;
  notes: string | null;
  employee: EmployeeListRow | null;
}

interface DraftItem {
  numeric_score: string;
  manager_comments: string;
  evidence_notes: string;
  attachment_url: string;
}

function formatDate(value: string | null, withTime = false): string {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return withTime ? date.toLocaleString() : date.toLocaleDateString();
}

function getCurrentMonthInput(): string {
  return new Date().toISOString().slice(0, 7);
}

function toMonthInput(value: string | null | undefined): string {
  return value ? value.slice(0, 7) : getCurrentMonthInput();
}

function toReviewMonth(value: string): string {
  return `${value || getCurrentMonthInput()}-01`;
}

function getEmployeeLabel(employee: EmployeeListRow): string {
  return (
    employee.worker?.full_name ||
    employee.role_title ||
    employee.worker?.job_title ||
    employee.id
  );
}

function buildEmptyDraft(categories: ScorecardCategory[]): Record<string, DraftItem> {
  return Object.fromEntries(
    categories.map((category) => [
      category.id,
      {
        numeric_score: "",
        manager_comments: "",
        evidence_notes: "",
        attachment_url: "",
      },
    ])
  );
}

function getStatusTone(status: string): string {
  switch (status) {
    case "acknowledged":
      return "bg-emerald-100 text-emerald-700";
    case "finalized":
      return "bg-violet-100 text-violet-700";
    case "submitted":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

export default function ScorecardsClient({
  initialEmployees,
  categories,
  initialScorecards,
  initialLeadershipRecords,
}: {
  initialEmployees: EmployeeListRow[];
  categories: ScorecardCategory[];
  initialScorecards: ScorecardRecord[];
  initialLeadershipRecords: LeadershipRecord[];
}) {
  const router = useRouter();
  const [scorecards, setScorecards] = useState(initialScorecards);
  const [leadershipRecords, setLeadershipRecords] = useState(initialLeadershipRecords);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(
    initialEmployees[0]?.id ?? ""
  );
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthInput());
  const [scorecardStatus, setScorecardStatus] = useState("draft");
  const [overallComments, setOverallComments] = useState("");
  const [draftItems, setDraftItems] = useState<Record<string, DraftItem>>(() =>
    buildEmptyDraft(categories)
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  useEffect(() => {
    setScorecards(initialScorecards);
  }, [initialScorecards]);

  useEffect(() => {
    setLeadershipRecords(initialLeadershipRecords);
  }, [initialLeadershipRecords]);

  useEffect(() => {
    if (!initialEmployees.length) {
      setSelectedEmployeeId("");
      return;
    }
    const exists = initialEmployees.some((employee) => employee.id === selectedEmployeeId);
    if (!exists) {
      setSelectedEmployeeId(initialEmployees[0]?.id ?? "");
    }
  }, [initialEmployees, selectedEmployeeId]);

  const selectedEmployee = useMemo(
    () => initialEmployees.find((employee) => employee.id === selectedEmployeeId) ?? null,
    [initialEmployees, selectedEmployeeId]
  );

  const selectedReviewMonth = useMemo(
    () => toReviewMonth(selectedMonth),
    [selectedMonth]
  );

  const selectedExistingScorecard = useMemo(
    () =>
      scorecards.find(
        (scorecard) =>
          scorecard.employee_id === selectedEmployeeId &&
          scorecard.review_month === selectedReviewMonth
      ) ?? null,
    [scorecards, selectedEmployeeId, selectedReviewMonth]
  );

  useEffect(() => {
    if (!selectedExistingScorecard) {
      setScorecardStatus("draft");
      setOverallComments("");
      setDraftItems(buildEmptyDraft(categories));
      return;
    }

    const nextDraft = buildEmptyDraft(categories);
    for (const item of selectedExistingScorecard.items) {
      nextDraft[item.category_id] = {
        numeric_score: String(item.numeric_score ?? ""),
        manager_comments: item.manager_comments || "",
        evidence_notes: item.evidence_notes || "",
        attachment_url: item.attachment_url || "",
      };
    }

    setScorecardStatus(
      selectedExistingScorecard.status === "acknowledged"
        ? "finalized"
        : selectedExistingScorecard.status
    );
    setOverallComments(selectedExistingScorecard.overall_comments || "");
    setDraftItems(nextDraft);
  }, [categories, selectedExistingScorecard]);

  const draftTotal = useMemo(
    () =>
      calculateWeightedScorecardTotal(
        categories.map((category) => ({
          category_id: category.id,
          numeric_score: clampScore(Number(draftItems[category.id]?.numeric_score || 0)),
        })),
        categories
      ),
    [categories, draftItems]
  );

  const selectedEmployeeScorecards = useMemo(
    () =>
      scorecards.filter((scorecard) => scorecard.employee_id === selectedEmployeeId),
    [scorecards, selectedEmployeeId]
  );

  const latestLeadershipByEmployee = useMemo(() => {
    const records = new Map<string, LeadershipRecord>();
    for (const record of leadershipRecords) {
      if (!records.has(record.employee_id)) {
        records.set(record.employee_id, record);
      }
    }
    return Array.from(records.values());
  }, [leadershipRecords]);

  const finalizedCount = scorecards.filter(
    (scorecard) => scorecard.status === "finalized" || scorecard.status === "acknowledged"
  ).length;
  const acknowledgedCount = scorecards.filter(
    (scorecard) => scorecard.status === "acknowledged"
  ).length;
  const eligibleLeadershipCount = latestLeadershipByEmployee.filter(
    (record) => record.status === "eligible_for_course"
  ).length;

  async function saveScorecard() {
    if (!selectedEmployeeId) {
      setMessage({ type: "error", text: "Select an employee first." });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/people/scorecards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: selectedEmployeeId,
          review_month: selectedReviewMonth,
          status: scorecardStatus,
          overall_comments: overallComments || null,
          items: categories.map((category) => ({
            category_id: category.id,
            numeric_score: clampScore(Number(draftItems[category.id]?.numeric_score || 0)),
            manager_comments: draftItems[category.id]?.manager_comments || null,
            evidence_notes: draftItems[category.id]?.evidence_notes || null,
            attachment_url: draftItems[category.id]?.attachment_url || null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to save scorecard." });
        return;
      }
      setMessage({
        type: "success",
        text:
          scorecardStatus === "finalized"
            ? "Scorecard finalized and leadership eligibility recalculated."
            : "Scorecard saved.",
      });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monthly Scorecards</h1>
          <p className="text-sm text-gray-500 mt-1">
            Review execution, quality, communication, discipline, values, and
            problem-solving each month.
          </p>
        </div>
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
            Employees
          </p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{initialEmployees.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Finalized
          </p>
          <p className="text-3xl font-bold text-violet-700 mt-2">{finalizedCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Acknowledged
          </p>
          <p className="text-3xl font-bold text-emerald-700 mt-2">{acknowledgedCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Leadership ready
          </p>
          <p className="text-3xl font-bold text-violet-700 mt-2">
            {eligibleLeadershipCount}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.85fr] gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-gray-900">Review editor</h2>
              <p className="text-sm text-gray-500 mt-1">
                Finalizing a scorecard can move an employee into the leadership pool
                automatically when the pattern is strong enough.
              </p>
            </div>
            <div className="rounded-lg bg-violet-50 border border-violet-100 px-4 py-3 text-right">
              <p className="text-xs uppercase tracking-wide text-violet-600">Draft total</p>
              <p className="text-2xl font-bold text-violet-900 mt-1">{draftTotal}%</p>
            </div>
          </div>

          {!selectedEmployee ? (
            <div className="rounded-xl border border-dashed border-gray-300 px-6 py-12 text-center text-sm text-gray-400">
              Create an employee profile first before using monthly scorecards.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">Employee</span>
                  <select
                    value={selectedEmployeeId}
                    onChange={(event) => setSelectedEmployeeId(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {initialEmployees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {getEmployeeLabel(employee)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-gray-700">Review month</span>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(event) => setSelectedMonth(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-gray-700">Status</span>
                  <select
                    value={scorecardStatus}
                    onChange={(event) => setScorecardStatus(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="draft">Draft</option>
                    <option value="submitted">Submitted</option>
                    <option value="finalized">Finalized</option>
                  </select>
                </label>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium text-gray-900">
                      {getEmployeeLabel(selectedEmployee)}
                    </p>
                    <p className="text-sm text-gray-500">
                      {selectedEmployee.role_title ||
                        selectedEmployee.worker?.job_title ||
                        "Role pending"}{" "}
                      / {selectedEmployee.current_level?.title || "Level pending"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex rounded-full bg-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700">
                      {labelizePeopleValue(selectedEmployee.employment_status)}
                    </span>
                    <span className="inline-flex rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">
                      {labelizePeopleValue(selectedEmployee.leadership_status)}
                    </span>
                  </div>
                </div>
                {selectedExistingScorecard && (
                  <p className="mt-3 text-xs text-gray-500">
                    Existing review found for {selectedExistingScorecard.review_month}.
                    Last reviewed {formatDate(selectedExistingScorecard.reviewed_at, true)}.
                    {selectedExistingScorecard.acknowledged_at
                      ? ` Employee acknowledged it on ${formatDate(
                          selectedExistingScorecard.acknowledged_at,
                          true
                        )}.`
                      : ""}
                  </p>
                )}
              </div>

              <div className="space-y-4">
                {categories.map((category) => {
                  const item = draftItems[category.id] || {
                    numeric_score: "",
                    manager_comments: "",
                    evidence_notes: "",
                    attachment_url: "",
                  };

                  return (
                    <div
                      key={category.id}
                      className="rounded-xl border border-gray-200 p-4 space-y-3"
                    >
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-medium text-gray-900">{category.label}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Weight: {category.weight}%
                          </p>
                        </div>
                        <label className="block md:w-40">
                          <span className="text-xs font-medium text-gray-600">
                            Numeric score
                          </span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={item.numeric_score}
                            onChange={(event) =>
                              setDraftItems((prev) => ({
                                ...prev,
                                [category.id]: {
                                  ...prev[category.id],
                                  numeric_score: event.target.value,
                                },
                              }))
                            }
                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          />
                        </label>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <label className="block">
                          <span className="text-xs font-medium text-gray-600">
                            Manager comments
                          </span>
                          <textarea
                            value={item.manager_comments}
                            onChange={(event) =>
                              setDraftItems((prev) => ({
                                ...prev,
                                [category.id]: {
                                  ...prev[category.id],
                                  manager_comments: event.target.value,
                                },
                              }))
                            }
                            className="mt-1 min-h-[92px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          />
                        </label>

                        <label className="block">
                          <span className="text-xs font-medium text-gray-600">
                            Evidence or notes
                          </span>
                          <textarea
                            value={item.evidence_notes}
                            onChange={(event) =>
                              setDraftItems((prev) => ({
                                ...prev,
                                [category.id]: {
                                  ...prev[category.id],
                                  evidence_notes: event.target.value,
                                },
                              }))
                            }
                            className="mt-1 min-h-[92px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          />
                        </label>
                      </div>

                      <label className="block">
                        <span className="text-xs font-medium text-gray-600">
                          Attachment or reference link
                        </span>
                        <input
                          type="url"
                          value={item.attachment_url}
                          onChange={(event) =>
                            setDraftItems((prev) => ({
                              ...prev,
                              [category.id]: {
                                ...prev[category.id],
                                attachment_url: event.target.value,
                              },
                            }))
                          }
                          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          placeholder="https://..."
                        />
                      </label>
                    </div>
                  );
                })}
              </div>

              <label className="block">
                <span className="text-sm font-medium text-gray-700">Overall comments</span>
                <textarea
                  value={overallComments}
                  onChange={(event) => setOverallComments(event.target.value)}
                  className="mt-1 min-h-[108px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Overall review, growth areas, strengths, and follow-up expectations."
                />
              </label>

              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-gray-500">
                  Finalized scorecards trigger employee notifications and refresh leadership
                  eligibility automatically.
                </p>
                <button
                  onClick={saveScorecard}
                  disabled={saving}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save scorecard"}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="font-semibold text-gray-900">Leadership pool snapshot</h2>
              <p className="text-xs text-gray-500 mt-1">
                Latest auto-evaluation per employee from scorecard history.
              </p>
            </div>
            {latestLeadershipByEmployee.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-gray-400">
                No leadership evaluations yet.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {latestLeadershipByEmployee.slice(0, 8).map((record) => (
                  <div key={record.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-gray-900">
                          {record.employee ? getEmployeeLabel(record.employee) : "Unknown employee"}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {record.review_month} / Avg{" "}
                          {record.average_score !== null ? `${record.average_score}%` : "n/a"}
                        </p>
                      </div>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          record.status === "eligible_for_course"
                            ? "bg-emerald-100 text-emerald-700"
                            : record.has_blocking_issue
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {labelizePeopleValue(record.status)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      {record.notes || "No notes recorded."}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="font-semibold text-gray-900">Employee history</h2>
              <p className="text-xs text-gray-500 mt-1">
                Recent reviews for the selected employee.
              </p>
            </div>
            {selectedEmployeeScorecards.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-gray-400">
                No scorecards saved for this employee yet.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {selectedEmployeeScorecards.map((scorecard) => (
                  <div key={scorecard.id} className="px-5 py-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-gray-900">{scorecard.review_month}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Reviewer:{" "}
                          {scorecard.reviewer?.name ||
                            scorecard.reviewer?.email ||
                            "Unknown"}
                        </p>
                      </div>
                      <div className="text-right">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusTone(
                            scorecard.status
                          )}`}
                        >
                          {labelizePeopleValue(scorecard.status)}
                        </span>
                        <p className="mt-2 text-lg font-bold text-gray-900">
                          {scorecard.final_total}%
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {scorecard.items.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {item.category?.label || "Category"}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                Score: {item.numeric_score}%
                              </p>
                            </div>
                            {item.attachment_url && (
                              <a
                                href={item.attachment_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-medium text-violet-600 hover:text-violet-700"
                              >
                                Reference
                              </a>
                            )}
                          </div>
                          {(item.manager_comments || item.evidence_notes) && (
                            <div className="mt-3 space-y-2 text-xs text-gray-600">
                              {item.manager_comments && (
                                <p>
                                  <span className="font-medium text-gray-700">Comments:</span>{" "}
                                  {item.manager_comments}
                                </p>
                              )}
                              {item.evidence_notes && (
                                <p>
                                  <span className="font-medium text-gray-700">Evidence:</span>{" "}
                                  {item.evidence_notes}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {scorecard.overall_comments && (
                      <p className="text-sm text-gray-600">{scorecard.overall_comments}</p>
                    )}

                    <p className="text-xs text-gray-400">
                      Reviewed {formatDate(scorecard.reviewed_at, true)} / Acknowledged{" "}
                      {formatDate(scorecard.acknowledged_at, true)}
                    </p>
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
