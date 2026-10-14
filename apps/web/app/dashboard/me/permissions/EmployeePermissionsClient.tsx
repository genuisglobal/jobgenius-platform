"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { labelizePeopleValue } from "@/lib/people";
import type {
  EmployeePermissionAllowanceSummaryRow,
  EmployeePermissionRequestRow,
} from "@/lib/people-server";

const EMPTY_FORM = {
  request_type: "permission",
  title: "",
  requested_start_date: "",
  requested_end_date: "",
  reason: "",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export default function EmployeePermissionsClient({
  employeeName,
  summary,
  requests,
}: {
  employeeName: string;
  summary: EmployeePermissionAllowanceSummaryRow | null;
  requests: EmployeePermissionRequestRow[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  const activePolicy = summary?.activePolicy ?? null;

  async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("submit");
    setMessage(null);

    try {
      const response = await fetch("/api/me/employee/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to submit request.");
      }
      setMessage({
        type: "success",
        text: "Your request was submitted for management review.",
      });
      setForm({ ...EMPTY_FORM });
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to submit request.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function cancelRequest(requestId: string) {
    setBusyAction(`cancel:${requestId}`);
    setMessage(null);
    try {
      const response = await fetch("/api/me/employee/permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: requestId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to cancel request.");
      }
      setMessage({
        type: "success",
        text: "Pending request cancelled.",
      });
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to cancel request.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Permissions</h1>
          <p className="text-sm text-gray-500 mt-1">
            Request permission or authorization days against the allowance configured for
            your current policy window.
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-right">
          <p className="text-xs uppercase tracking-wide text-gray-500">Employee</p>
          <p className="text-sm font-semibold text-gray-900 mt-1">{employeeName}</p>
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

      {!activePolicy && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          No active permission allowance has been configured yet. An operations manager or
          admin must first set your allowed days for a 6-month, 1-year, or 2-year window.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Policy window
          </p>
          <p className="text-sm font-semibold text-gray-900 mt-2">
            {activePolicy ? labelizePeopleValue(activePolicy.period_kind) : "Not set"}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {activePolicy
              ? `${formatDate(activePolicy.period_start_date)} to ${formatDate(
                  activePolicy.period_end_date
                )}`
              : "Waiting for admin setup"}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Allowed days
          </p>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {summary?.activePolicy?.allowed_days ?? 0}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Approved used
          </p>
          <p className="text-3xl font-bold text-violet-700 mt-2">
            {summary?.approvedDaysUsed ?? 0}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Pending review
          </p>
          <p className="text-3xl font-bold text-amber-700 mt-2">
            {summary?.pendingDays ?? 0}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Available now
          </p>
          <p
            className={`text-3xl font-bold mt-2 ${
              (summary?.remainingDays ?? 0) < 0 ? "text-red-700" : "text-emerald-700"
            }`}
          >
            {summary?.remainingDays ?? 0}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-6">
        <form
          onSubmit={submitRequest}
          className="bg-white rounded-xl border border-gray-200 p-6 space-y-4"
        >
          <div>
            <h2 className="font-semibold text-gray-900">Submit a request</h2>
            <p className="text-sm text-gray-500 mt-1">
              Use this when you need approved time away under your current permission
              allowance.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Request type</span>
              <select
                value={form.request_type}
                onChange={(event) =>
                  setForm((current) => ({ ...current, request_type: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                disabled={!activePolicy || busyAction === "submit"}
              >
                <option value="permission">Permission</option>
                <option value="authorization">Authorization</option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Title</span>
              <input
                type="text"
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Medical visit, family travel, urgent matter..."
                disabled={!activePolicy || busyAction === "submit"}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Start date</span>
              <input
                type="date"
                value={form.requested_start_date}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    requested_start_date: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                disabled={!activePolicy || busyAction === "submit"}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">End date</span>
              <input
                type="date"
                value={form.requested_end_date}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    requested_end_date: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                disabled={!activePolicy || busyAction === "submit"}
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Reason</span>
            <textarea
              value={form.reason}
              onChange={(event) =>
                setForm((current) => ({ ...current, reason: event.target.value }))
              }
              rows={4}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Give enough context for management to review the request quickly."
              disabled={!activePolicy || busyAction === "submit"}
            />
          </label>

          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-gray-500">
              Requests are counted in whole days and checked against your remaining
              available allowance.
            </p>
            <button
              type="submit"
              disabled={!activePolicy || busyAction === "submit"}
              className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-60"
            >
              {busyAction === "submit" ? "Submitting..." : "Submit request"}
            </button>
          </div>
        </form>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900">Allowance rules</h2>
          <ul className="mt-4 space-y-3 text-sm text-gray-600">
            <li>Management sets the allowed day cap for a 6-month, 1-year, or 2-year window.</li>
            <li>Pending requests reserve days until they are approved, rejected, or cancelled.</li>
            <li>Approved days reduce your remaining allowance for the active policy period.</li>
            <li>If your policy changes later, older requests stay linked to the policy window they were submitted under.</li>
          </ul>

          {activePolicy?.notes && (
            <div className="mt-5 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
              <span className="font-medium">Manager note:</span> {activePolicy.notes}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Request history</h2>
          <p className="text-xs text-gray-500 mt-1">
            Your submitted permission and authorization requests, including their review
            status.
          </p>
        </div>

        {requests.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-400">
            No requests submitted yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {requests.map((request) => (
              <div key={request.id} className="px-5 py-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-gray-900">{request.title}</p>
                    <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                      {labelizePeopleValue(request.request_type)}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        request.status === "approved"
                          ? "bg-emerald-100 text-emerald-700"
                          : request.status === "rejected"
                          ? "bg-red-100 text-red-700"
                          : request.status === "cancelled"
                          ? "bg-gray-100 text-gray-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {labelizePeopleValue(request.status)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {formatDate(request.requested_start_date)} to{" "}
                    {formatDate(request.requested_end_date)} · {request.requested_days} day
                    {request.requested_days === 1 ? "" : "s"} requested
                    {request.approved_days !== null
                      ? ` · ${request.approved_days} day${
                          request.approved_days === 1 ? "" : "s"
                        } approved`
                      : ""}
                  </p>
                  {request.reason && (
                    <p className="text-sm text-gray-600 mt-2">{request.reason}</p>
                  )}
                  {request.manager_comment && (
                    <p className="text-xs text-gray-500 mt-2">
                      Manager note: {request.manager_comment}
                    </p>
                  )}
                </div>

                <div className="shrink-0 text-right space-y-2">
                  <p className="text-xs text-gray-400">
                    Submitted {formatDate(request.submitted_at || request.created_at)}
                  </p>
                  {request.status === "pending" && (
                    <button
                      type="button"
                      onClick={() => cancelRequest(request.id)}
                      disabled={busyAction === `cancel:${request.id}`}
                      className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-60"
                    >
                      {busyAction === `cancel:${request.id}` ? "Cancelling..." : "Cancel"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
