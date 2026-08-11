"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LEADERSHIP_COURSE_STATUSES,
  LEADERSHIP_PIPELINE_STATUSES,
  LEADERSHIP_TRIAL_STATUSES,
  labelizePeopleValue,
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

interface LeadershipEligibilityRecord {
  id: string;
  employee_id: string;
  review_month: string;
  average_score: number | null;
  meets_three_month_eighty: boolean;
  meets_two_of_three_eighty_five: boolean;
  has_blocking_issue: boolean;
  auto_flagged: boolean;
  status: string;
  notes: string | null;
  employee: EmployeeListRow | null;
}

interface LeadershipCourseEnrollmentRecord {
  id: string;
  employee_id: string;
  status: string;
  approved_at: string | null;
  enrolled_at: string | null;
  completed_at: string | null;
  notes: string | null;
  employee: EmployeeListRow | null;
}

interface LeadershipTrialRecord {
  id: string;
  employee_id: string;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  outcome_notes: string | null;
  final_decision: string | null;
  employee: EmployeeListRow | null;
}

interface LeaderOfMonthAwardRecord {
  id: string;
  award_month: string;
  employee_id: string;
  scorecard_id: string | null;
  award_title: string;
  reason: string;
  award_description: string | null;
  employee: EmployeeListRow | null;
  scorecard: {
    id: string;
    review_month: string;
    final_total: number;
    status: string;
  } | null;
}

interface ScorecardRecord {
  id: string;
  employee_id: string;
  review_month: string;
  final_total: number;
  status: string;
}

function getCurrentMonthInput(): string {
  return new Date().toISOString().slice(0, 7);
}

function formatDate(value: string | null, withTime = false): string {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return withTime ? date.toLocaleString() : date.toLocaleDateString();
}

function toMonthDate(value: string): string {
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

function getStatusTone(status: string): string {
  switch (status) {
    case "eligible_for_course":
    case "approved":
    case "completed":
    case "promoted":
      return "bg-emerald-100 text-emerald-700";
    case "enrolled":
    case "active":
    case "in_trial":
    case "enrolled_in_course":
      return "bg-violet-100 text-violet-700";
    case "under_observation":
    case "planned":
    case "ready_for_trial":
      return "bg-amber-100 text-amber-700";
    case "removed":
    case "failed":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

export default function LeadershipClient({
  initialEmployees,
  initialEligibilityRecords,
  initialCourseEnrollments,
  initialTrials,
  initialAwards,
  scorecards,
}: {
  initialEmployees: EmployeeListRow[];
  initialEligibilityRecords: LeadershipEligibilityRecord[];
  initialCourseEnrollments: LeadershipCourseEnrollmentRecord[];
  initialTrials: LeadershipTrialRecord[];
  initialAwards: LeaderOfMonthAwardRecord[];
  scorecards: ScorecardRecord[];
}) {
  const router = useRouter();
  const [eligibilityRecords, setEligibilityRecords] = useState(initialEligibilityRecords);
  const [courseEnrollments, setCourseEnrollments] = useState(initialCourseEnrollments);
  const [trials, setTrials] = useState(initialTrials);
  const [awards, setAwards] = useState(initialAwards);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(
    initialEmployees[0]?.id ?? ""
  );
  const [courseStatus, setCourseStatus] = useState("approved");
  const [courseNotes, setCourseNotes] = useState("");
  const [trialTitle, setTrialTitle] = useState("");
  const [trialDescription, setTrialDescription] = useState("");
  const [trialStartDate, setTrialStartDate] = useState("");
  const [trialEndDate, setTrialEndDate] = useState("");
  const [trialStatus, setTrialStatus] = useState("planned");
  const [trialOutcomeNotes, setTrialOutcomeNotes] = useState("");
  const [trialFinalDecision, setTrialFinalDecision] = useState("");
  const [awardMonth, setAwardMonth] = useState(getCurrentMonthInput());
  const [awardEmployeeId, setAwardEmployeeId] = useState(initialEmployees[0]?.id ?? "");
  const [awardScorecardId, setAwardScorecardId] = useState("");
  const [awardTitle, setAwardTitle] = useState("Leader of the Month");
  const [awardReason, setAwardReason] = useState("");
  const [awardDescription, setAwardDescription] = useState("");
  const [busySection, setBusySection] = useState<null | "course" | "trial" | "award">(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  useEffect(() => {
    setEligibilityRecords(initialEligibilityRecords);
  }, [initialEligibilityRecords]);

  useEffect(() => {
    setCourseEnrollments(initialCourseEnrollments);
  }, [initialCourseEnrollments]);

  useEffect(() => {
    setTrials(initialTrials);
  }, [initialTrials]);

  useEffect(() => {
    setAwards(initialAwards);
  }, [initialAwards]);

  useEffect(() => {
    if (!initialEmployees.length) {
      setSelectedEmployeeId("");
      setAwardEmployeeId("");
      return;
    }

    if (!initialEmployees.some((employee) => employee.id === selectedEmployeeId)) {
      setSelectedEmployeeId(initialEmployees[0]?.id ?? "");
    }
    if (!initialEmployees.some((employee) => employee.id === awardEmployeeId)) {
      setAwardEmployeeId(initialEmployees[0]?.id ?? "");
    }
  }, [awardEmployeeId, initialEmployees, selectedEmployeeId]);

  const latestEligibilityByEmployee = useMemo(() => {
    const map = new Map<string, LeadershipEligibilityRecord>();
    for (const record of eligibilityRecords) {
      if (!map.has(record.employee_id)) {
        map.set(record.employee_id, record);
      }
    }
    return Array.from(map.values());
  }, [eligibilityRecords]);

  const selectedEmployee = useMemo(
    () => initialEmployees.find((employee) => employee.id === selectedEmployeeId) ?? null,
    [initialEmployees, selectedEmployeeId]
  );

  const selectedEligibility = useMemo(
    () =>
      latestEligibilityByEmployee.find(
        (record) => record.employee_id === selectedEmployeeId
      ) ?? null,
    [latestEligibilityByEmployee, selectedEmployeeId]
  );

  const selectedCourseEnrollment = useMemo(
    () => courseEnrollments.find((record) => record.employee_id === selectedEmployeeId) ?? null,
    [courseEnrollments, selectedEmployeeId]
  );

  const selectedTrial = useMemo(
    () => trials.find((record) => record.employee_id === selectedEmployeeId) ?? null,
    [trials, selectedEmployeeId]
  );

  useEffect(() => {
    setCourseStatus(selectedCourseEnrollment?.status || "approved");
    setCourseNotes(selectedCourseEnrollment?.notes || "");
  }, [selectedCourseEnrollment]);

  useEffect(() => {
    setTrialTitle(selectedTrial?.title || "");
    setTrialDescription(selectedTrial?.description || "");
    setTrialStartDate(selectedTrial?.start_date || "");
    setTrialEndDate(selectedTrial?.end_date || "");
    setTrialStatus(selectedTrial?.status || "planned");
    setTrialOutcomeNotes(selectedTrial?.outcome_notes || "");
    setTrialFinalDecision(selectedTrial?.final_decision || "");
  }, [selectedTrial]);

  useEffect(() => {
    const currentAward = awards.find(
      (award) => award.award_month === toMonthDate(awardMonth)
    );
    if (!currentAward) {
      setAwardTitle("Leader of the Month");
      setAwardReason("");
      setAwardDescription("");
      setAwardScorecardId("");
      return;
    }
    setAwardEmployeeId(currentAward.employee_id);
    setAwardScorecardId(currentAward.scorecard_id || "");
    setAwardTitle(currentAward.award_title || "Leader of the Month");
    setAwardReason(currentAward.reason || "");
    setAwardDescription(currentAward.award_description || "");
  }, [awardMonth, awards]);

  const awardEmployee = useMemo(
    () => initialEmployees.find((employee) => employee.id === awardEmployeeId) ?? null,
    [awardEmployeeId, initialEmployees]
  );

  const awardScorecardOptions = useMemo(
    () =>
      scorecards.filter((scorecard) => scorecard.employee_id === awardEmployeeId),
    [awardEmployeeId, scorecards]
  );

  const eligibleCount = latestEligibilityByEmployee.filter(
    (record) => record.status === "eligible_for_course"
  ).length;
  const enrolledCount = courseEnrollments.filter(
    (record) => record.status === "enrolled" || record.status === "completed"
  ).length;
  const trialCount = trials.filter(
    (record) => record.status === "planned" || record.status === "active"
  ).length;
  const promotedCount = initialEmployees.filter(
    (employee) => employee.leadership_status === "promoted"
  ).length;

  async function saveCourseEnrollment() {
    if (!selectedEmployeeId) {
      setMessage({ type: "error", text: "Select an employee first." });
      return;
    }

    setBusySection("course");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/people/leadership/course-enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedCourseEnrollment?.id || null,
          employee_id: selectedEmployeeId,
          status: courseStatus,
          notes: courseNotes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({
          type: "error",
          text: data.error || "Failed to save leadership course record.",
        });
        return;
      }
      setMessage({ type: "success", text: "Leadership course record updated." });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setBusySection(null);
    }
  }

  async function saveTrial() {
    if (!selectedEmployeeId || !trialTitle.trim()) {
      setMessage({
        type: "error",
        text: "Select an employee and add a trial title first.",
      });
      return;
    }

    setBusySection("trial");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/people/leadership/trials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedTrial?.id || null,
          employee_id: selectedEmployeeId,
          title: trialTitle,
          description: trialDescription || null,
          start_date: trialStartDate || null,
          end_date: trialEndDate || null,
          status: trialStatus,
          outcome_notes: trialOutcomeNotes || null,
          final_decision: trialFinalDecision || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to save trial." });
        return;
      }
      setMessage({ type: "success", text: "Leadership trial updated." });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setBusySection(null);
    }
  }

  async function saveAward() {
    if (!awardEmployeeId || !awardReason.trim()) {
      setMessage({
        type: "error",
        text: "Select a winner and provide a recognition reason.",
      });
      return;
    }

    setBusySection("award");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/people/leadership/awards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          award_month: toMonthDate(awardMonth),
          employee_id: awardEmployeeId,
          scorecard_id: awardScorecardId || null,
          award_title: awardTitle || "Leader of the Month",
          reason: awardReason,
          award_description: awardDescription || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to save award." });
        return;
      }
      setMessage({ type: "success", text: "Leader of the Month saved." });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setBusySection(null);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Leadership Pipeline</h1>
        <p className="text-sm text-gray-500 mt-1">
          Move employees from performance-based eligibility into course, trial,
          recognition, and promotion decisions.
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
            Course eligible
          </p>
          <p className="text-3xl font-bold text-emerald-700 mt-2">{eligibleCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            In course
          </p>
          <p className="text-3xl font-bold text-violet-700 mt-2">{enrolledCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Trials active
          </p>
          <p className="text-3xl font-bold text-amber-700 mt-2">{trialCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Promoted
          </p>
          <p className="text-3xl font-bold text-violet-700 mt-2">{promotedCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-6">
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="font-semibold text-gray-900">Eligibility pool</h2>
              <p className="text-xs text-gray-500 mt-1">
                Latest leadership evaluation for each employee.
              </p>
            </div>
            {latestEligibilityByEmployee.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-gray-400">
                No leadership evaluations yet.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {latestEligibilityByEmployee.map((record) => (
                  <button
                    key={record.id}
                    onClick={() => setSelectedEmployeeId(record.employee_id)}
                    className={`w-full px-5 py-4 text-left transition-colors ${
                      selectedEmployeeId === record.employee_id
                        ? "bg-violet-50"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-gray-900">
                          {record.employee
                            ? getEmployeeLabel(record.employee)
                            : "Unknown employee"}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Avg{" "}
                          {record.average_score !== null
                            ? `${record.average_score}%`
                            : "n/a"}{" "}
                          / {record.review_month}
                        </p>
                      </div>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusTone(
                          record.status
                        )}`}
                      >
                        {labelizePeopleValue(record.status)}
                      </span>
                    </div>
                    {record.has_blocking_issue && (
                      <p className="mt-2 text-xs text-red-600">
                        Active blocker on conduct or integrity.
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="font-semibold text-gray-900">Leader of the Month board</h2>
              <p className="text-xs text-gray-500 mt-1">
                Recognition history visible across the staff system.
              </p>
            </div>
            {awards.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-gray-400">
                No recognition awards published yet.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {awards.slice(0, 6).map((award) => (
                  <div key={award.id} className="px-5 py-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-gray-900">
                          {award.employee
                            ? getEmployeeLabel(award.employee)
                            : "Unknown employee"}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {award.award_month} / {award.award_title}
                        </p>
                      </div>
                      {award.scorecard && (
                        <span className="inline-flex rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">
                          {award.scorecard.final_total}%
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{award.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {!selectedEmployee ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 px-6 py-12 text-center text-sm text-gray-400">
              Select an employee from the eligibility pool to manage the leadership
              pipeline.
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-900">
                      {getEmployeeLabel(selectedEmployee)}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                      {selectedEmployee.role_title ||
                        selectedEmployee.worker?.job_title ||
                        "Role pending"}{" "}
                      / {selectedEmployee.current_level?.title || "Level pending"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusTone(
                        selectedEmployee.leadership_status
                      )}`}
                    >
                      {labelizePeopleValue(selectedEmployee.leadership_status)}
                    </span>
                    <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                      {labelizePeopleValue(selectedEmployee.employment_status)}
                    </span>
                  </div>
                </div>

                {selectedEligibility && (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          Latest eligibility review
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {selectedEligibility.review_month} / Avg{" "}
                          {selectedEligibility.average_score !== null
                            ? `${selectedEligibility.average_score}%`
                            : "n/a"}
                        </p>
                      </div>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusTone(
                          selectedEligibility.status
                        )}`}
                      >
                        {labelizePeopleValue(selectedEligibility.status)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-gray-600">
                      {selectedEligibility.notes || "No eligibility note recorded yet."}
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">Leadership course</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Approve, enroll, complete, or remove an employee from the
                      internal leadership course.
                    </p>
                  </div>

                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Course status</span>
                    <select
                      value={courseStatus}
                      onChange={(event) => setCourseStatus(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      {LEADERSHIP_COURSE_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {labelizePeopleValue(status)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Notes</span>
                    <textarea
                      value={courseNotes}
                      onChange={(event) => setCourseNotes(event.target.value)}
                      className="mt-1 min-h-[112px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Enrollment notes, training expectations, or completion context."
                    />
                  </label>

                  <div className="text-xs text-gray-500">
                    Current record:{" "}
                    {selectedCourseEnrollment
                      ? `${labelizePeopleValue(selectedCourseEnrollment.status)} / approved ${formatDate(
                          selectedCourseEnrollment.approved_at,
                          true
                        )}`
                      : "No course record yet."}
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={saveCourseEnrollment}
                      disabled={busySection !== null}
                      className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
                    >
                      {busySection === "course" ? "Saving..." : "Save course status"}
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">Leadership trial</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Assign a trial responsibility, track progress, and record the
                      final leadership decision.
                    </p>
                  </div>

                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Trial title</span>
                    <input
                      type="text"
                      value={trialTitle}
                      onChange={(event) => setTrialTitle(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Supervise 2 consultants for 2 weeks"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Description</span>
                    <textarea
                      value={trialDescription}
                      onChange={(event) => setTrialDescription(event.target.value)}
                      className="mt-1 min-h-[92px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Scope, expected outcomes, or support context."
                    />
                  </label>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="block">
                      <span className="text-sm font-medium text-gray-700">Start date</span>
                      <input
                        type="date"
                        value={trialStartDate}
                        onChange={(event) => setTrialStartDate(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-gray-700">End date</span>
                      <input
                        type="date"
                        value={trialEndDate}
                        onChange={(event) => setTrialEndDate(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="block">
                      <span className="text-sm font-medium text-gray-700">Trial status</span>
                      <select
                        value={trialStatus}
                        onChange={(event) => setTrialStatus(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        {LEADERSHIP_TRIAL_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {labelizePeopleValue(status)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-gray-700">Final decision</span>
                      <select
                        value={trialFinalDecision}
                        onChange={(event) => setTrialFinalDecision(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="">Auto from trial status</option>
                        {LEADERSHIP_PIPELINE_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {labelizePeopleValue(status)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Outcome notes</span>
                    <textarea
                      value={trialOutcomeNotes}
                      onChange={(event) => setTrialOutcomeNotes(event.target.value)}
                      className="mt-1 min-h-[92px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Result summary, quality of execution, or promotion notes."
                    />
                  </label>

                  <div className="text-xs text-gray-500">
                    Current record:{" "}
                    {selectedTrial
                      ? `${selectedTrial.title} / ${labelizePeopleValue(selectedTrial.status)}`
                      : "No trial record yet."}
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={saveTrial}
                      disabled={busySection !== null}
                      className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
                    >
                      {busySection === "trial" ? "Saving..." : "Save leadership trial"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-900">Leader of the Month</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Publish one monthly winner, keep recognition reasons visible, and keep
                    individual score details private.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Award month</span>
                    <input
                      type="month"
                      value={awardMonth}
                      onChange={(event) => setAwardMonth(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Winner</span>
                    <select
                      value={awardEmployeeId}
                      onChange={(event) => setAwardEmployeeId(event.target.value)}
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
                    <span className="text-sm font-medium text-gray-700">
                      Supporting scorecard
                    </span>
                    <select
                      value={awardScorecardId}
                      onChange={(event) => setAwardScorecardId(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">None</option>
                      {awardScorecardOptions.map((scorecard) => (
                        <option key={scorecard.id} value={scorecard.id}>
                          {scorecard.review_month} / {scorecard.final_total}%
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className="text-sm font-medium text-gray-700">Award title</span>
                  <input
                    type="text"
                    value={awardTitle}
                    onChange={(event) => setAwardTitle(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-gray-700">Recognition reason</span>
                  <textarea
                    value={awardReason}
                    onChange={(event) => setAwardReason(event.target.value)}
                    className="mt-1 min-h-[92px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Why this employee stood out this month."
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-gray-700">Award description</span>
                  <textarea
                    value={awardDescription}
                    onChange={(event) => setAwardDescription(event.target.value)}
                    className="mt-1 min-h-[92px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Cash, gift, badge, or certificate details."
                  />
                </label>

                <div className="text-xs text-gray-500">
                  Winner preview:{" "}
                  {awardEmployee ? getEmployeeLabel(awardEmployee) : "No winner selected"}
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={saveAward}
                    disabled={busySection !== null}
                    className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
                  >
                    {busySection === "award" ? "Saving..." : "Save monthly award"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
