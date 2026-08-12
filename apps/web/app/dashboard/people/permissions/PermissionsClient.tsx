"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { labelizePeopleValue } from "@/lib/people";

type EmployeeRow = {
  id: string;
  role_title: string | null;
  employment_status: string;
  active: boolean;
  worker: {
    full_name: string;
    email: string | null;
  } | null;
};

type SummaryRow = {
  employee: EmployeeRow;
  activePolicy: {
    id: string;
    period_kind: string;
    period_start_date: string;
    period_end_date: string;
    allowed_days: number;
    notes: string | null;
  } | null;
  approvedDaysUsed: number;
  pendingDays: number;
  committedDays: number;
  remainingDays: number;
  overLimit: boolean;
};

type PolicyRow = {
  id: string;
  employee_id: string;
  period_kind: string;
  period_start_date: string;
  period_end_date: string;
  allowed_days: number;
  active: boolean;
  notes: string | null;
  employee: EmployeeRow | null;
};

type RequestRow = {
  id: string;
  employee_id: string;
  policy_id: string | null;
  request_type: string;
  title: string;
  reason: string | null;
  requested_start_date: string;
  requested_end_date: string;
  requested_days: number;
  approved_days: number | null;
  status: string;
  submitted_at: string | null;
  decided_at: string | null;
  manager_comment: string | null;
  created_at: string;
  employee: EmployeeRow | null;
};

const EMPTY_POLICY_FORM = {
  id: "",
  employee_id: "",
  period_kind: "one_year",
  period_start_date: "",
  allowed_days: "14",
  notes: "",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function getEmployeeLabel(employee: EmployeeRow | null): string {
  return employee?.worker?.full_name || employee?.role_title || employee?.id || "Unknown employee";
}

export default function PermissionsClient({
  employees,
  summaries,
  policies,
  requests,
}: {
  employees: EmployeeRow[];
  summaries: SummaryRow[];
  policies: PolicyRow[];
  requests: RequestRow[];
}) {
  const router = useRouter();
  const [policyForm, setPolicyForm] = useState({ ...EMPTY_POLICY_FORM });
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );
  const [decisionDrafts, setDecisionDrafts] = useState<Record<string, { status: string; approved_days: string; manager_comment: string }>>(
    () =>
      Object.fromEntries(
        requests.map((request) => [
          request.id,
          {
            status: "approved",
            approved_days: String(request.requested_days),
            manager_comment: request.manager_comment || "",
          },
        ])
      )
  );

  const activeSummaries = useMemo(
    () => summaries.filter((summary) => summary.employee.active),
    [summaries]
  );
  const activePolicyCount = activeSummaries.filter((summary) => summary.activePolicy).length;
  const pendingRequestCount = requests.filter((request) => request.status === "pending").length;
  const overLimitCount = activeSummaries.filter((summary) => summary.overLimit).length;
  const totalAvailableDays = activeSummaries.reduce(
    (sum, summary) => sum + Math.max(0, summary.remainingDays),
    0
  );

  const employeeOptions = useMemo(
    () =>
      employees.filter(
        (employee) => employee.active && employee.employment_status !== "terminated"
      ),
    [employees]
  );

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === "pending"),
    [requests]
  );

  function startEditPolicy(policy: PolicyRow) {
    setPolicyForm({
      id: policy.id,
      employee_id: policy.employee_id,
      period_kind: policy.period_kind,
      period_start_date: policy.period_start_date,
      allowed_days: String(policy.allowed_days),
      notes: policy.notes || "",
    });
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function savePolicy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("save-policy");
    setMessage(null);
    try {
      const response = await fetch("/api/admin/people/permissions/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...policyForm,
          id: policyForm.id || undefined,
          allowed_days: Number(policyForm.allowed_days) || 0,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save policy.");
      }
      setMessage({
        type: "success",
        text: policyForm.id ? "Policy updated." : "Policy created.",
      });
      setPolicyForm({ ...EMPTY_POLICY_FORM });
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save policy.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function reviewRequest(requestId: string) {
    const draft = decisionDrafts[requestId];
    if (!draft) return;
    setBusyAction(`review:${requestId}`);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/people/permissions/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: requestId,
          status: draft.status,
          approved_days:
            draft.status === "approved" ? Number(draft.approved_days) || 0 : null,
          manager_comment: draft.manager_comment,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to review request.");
      }
      setMessage({
        type: "success",
        text: "Request review saved.",
      });
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to review request.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Permissions</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure employee permission windows and review incoming permission or
            authorization requests.
          </p>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active policies", value: activePolicyCount, tone: "text-violet-700" },
          { label: "Pending requests", value: pendingRequestCount, tone: "text-amber-700" },
          { label: "Employees over limit", value: overLimitCount, tone: "text-red-700" },
          { label: "Days available", value: totalAvailableDays, tone: "text-emerald-700" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {stat.label}
            </p>
            <p className={`text-3xl font-bold mt-2 ${stat.tone}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <form onSubmit={savePolicy} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">
              {policyForm.id ? "Edit allowance policy" : "Set allowance policy"}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Choose the employee, the policy window, and how many days can be used within
              that period.
            </p>
          </div>
          {policyForm.id && (
            <button
              type="button"
              onClick={() => setPolicyForm({ ...EMPTY_POLICY_FORM })}
              className="px-3 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
            >
              Cancel edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <label className="block xl:col-span-2">
            <span className="text-sm font-medium text-gray-700">Employee</span>
            <select
              value={policyForm.employee_id}
              onChange={(event) =>
                setPolicyForm((current) => ({ ...current, employee_id: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Select employee</option>
              {employeeOptions.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {getEmployeeLabel(employee)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Window</span>
            <select
              value={policyForm.period_kind}
              onChange={(event) =>
                setPolicyForm((current) => ({ ...current, period_kind: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="six_months">Six months</option>
              <option value="one_year">One year</option>
              <option value="two_years">Two years</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Start date</span>
            <input
              type="date"
              value={policyForm.period_start_date}
              onChange={(event) =>
                setPolicyForm((current) => ({
                  ...current,
                  period_start_date: event.target.value,
                }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Allowed days</span>
            <input
              type="number"
              min={1}
              max={365}
              value={policyForm.allowed_days}
              onChange={(event) =>
                setPolicyForm((current) => ({
                  ...current,
                  allowed_days: event.target.value,
                }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Notes</span>
          <textarea
            value={policyForm.notes}
            onChange={(event) =>
              setPolicyForm((current) => ({ ...current, notes: event.target.value }))
            }
            rows={3}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Optional policy note for the employee or reviewers."
          />
        </label>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={busyAction === "save-policy"}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-60"
          >
            {busyAction === "save-policy"
              ? "Saving..."
              : policyForm.id
              ? "Update policy"
              : "Create policy"}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Current allowance summaries</h2>
          <p className="text-xs text-gray-500 mt-1">
            Remaining days are calculated after approved days and still-pending requests.
          </p>
        </div>
        {activeSummaries.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">
            No employee summaries available yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {activeSummaries.map((summary) => (
              <div key={summary.employee.id} className="px-5 py-4 flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-gray-900">{getEmployeeLabel(summary.employee)}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {summary.activePolicy
                      ? `${labelizePeopleValue(summary.activePolicy.period_kind)} · ${formatDate(
                          summary.activePolicy.period_start_date
                        )} to ${formatDate(summary.activePolicy.period_end_date)}`
                      : "No active policy configured"}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Allowed {summary.activePolicy?.allowed_days ?? 0} · Approved used{" "}
                    {summary.approvedDaysUsed} · Pending {summary.pendingDays}
                  </p>
                </div>
                <div className="text-right space-y-2">
                  <p
                    className={`text-2xl font-bold ${
                      summary.overLimit ? "text-red-700" : "text-emerald-700"
                    }`}
                  >
                    {summary.remainingDays}
                  </p>
                  <p className="text-xs text-gray-400">days available now</p>
                  {summary.activePolicy && (
                    <button
                      type="button"
                      onClick={() => {
                        const policy =
                          policies.find((entry) => entry.id === summary.activePolicy?.id) ??
                          null;
                        if (policy) {
                          startEditPolicy(policy);
                          return;
                        }
                        setPolicyForm({
                          id: summary.activePolicy?.id || "",
                          employee_id: summary.employee.id,
                          period_kind: summary.activePolicy?.period_kind || "one_year",
                          period_start_date: summary.activePolicy?.period_start_date || "",
                          allowed_days: String(summary.activePolicy?.allowed_days ?? 0),
                          notes: summary.activePolicy?.notes || "",
                        });
                        setMessage(null);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50"
                    >
                      Edit policy
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Request review queue</h2>
          <p className="text-xs text-gray-500 mt-1">
            Review pending requests and decide how many days to approve within the active
            allowance window.
          </p>
        </div>

        {pendingRequests.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">
            No pending permission requests right now.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pendingRequests.map((request) => {
              const draft = decisionDrafts[request.id] ?? {
                status: "approved",
                approved_days: String(request.requested_days),
                manager_comment: "",
              };

              return (
                <div key={request.id} className="px-5 py-5 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-gray-900">{request.title}</p>
                        <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                          {labelizePeopleValue(request.request_type)}
                        </span>
                        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                          Pending
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        {getEmployeeLabel(request.employee)} · {formatDate(request.requested_start_date)} to{" "}
                        {formatDate(request.requested_end_date)} · {request.requested_days} day
                        {request.requested_days === 1 ? "" : "s"} requested
                      </p>
                      {request.reason && (
                        <p className="text-sm text-gray-600 mt-2">{request.reason}</p>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">
                      Submitted {formatDate(request.submitted_at || request.created_at)}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <label className="block">
                      <span className="text-sm font-medium text-gray-700">Decision</span>
                      <select
                        value={draft.status}
                        onChange={(event) =>
                          setDecisionDrafts((current) => ({
                            ...current,
                            [request.id]: {
                              ...draft,
                              status: event.target.value,
                            },
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="approved">Approve</option>
                        <option value="rejected">Reject</option>
                        <option value="cancelled">Cancel</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-sm font-medium text-gray-700">Approved days</span>
                      <input
                        type="number"
                        min={0}
                        max={request.requested_days}
                        value={draft.approved_days}
                        onChange={(event) =>
                          setDecisionDrafts((current) => ({
                            ...current,
                            [request.id]: {
                              ...draft,
                              approved_days: event.target.value,
                            },
                          }))
                        }
                        disabled={draft.status !== "approved"}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
                      />
                    </label>

                    <label className="block md:col-span-1">
                      <span className="text-sm font-medium text-gray-700">Manager comment</span>
                      <input
                        type="text"
                        value={draft.manager_comment}
                        onChange={(event) =>
                          setDecisionDrafts((current) => ({
                            ...current,
                            [request.id]: {
                              ...draft,
                              manager_comment: event.target.value,
                            },
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder="Optional context for the employee"
                      />
                    </label>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => reviewRequest(request.id)}
                      disabled={busyAction === `review:${request.id}`}
                      className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-60"
                    >
                      {busyAction === `review:${request.id}` ? "Saving..." : "Save review"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
