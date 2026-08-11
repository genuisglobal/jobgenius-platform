"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { labelizePeopleValue } from "@/lib/people";

interface OnboardingQueueRow {
  id: string;
  full_name: string;
  email: string;
  role_title: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  manager_notes: string | null;
  signature_name: string | null;
  status: string;
  acknowledge_role_expectations: boolean;
  acknowledge_tentative_offer: boolean;
  acknowledge_probation_policy: boolean;
  acknowledge_bonus_policy: boolean;
  acknowledge_social_fund_policy: boolean;
  acknowledge_social_lead_policy: boolean;
  acknowledge_leadership_growth: boolean;
  employee: {
    id: string;
    employee_code: string | null;
    role_title: string | null;
    employment_status: string;
    worker: {
      full_name: string;
      email: string | null;
    } | null;
    current_level: {
      title: string;
    } | null;
  } | null;
}

function fmtDate(value: string | null) {
  if (!value) return "Not submitted";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not submitted" : date.toLocaleString();
}

export default function OnboardingQueueClient({
  initialQueue,
}: {
  initialQueue: OnboardingQueueRow[];
}) {
  const router = useRouter();
  const [queue, setQueue] = useState(initialQueue);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialQueue.map((item) => [item.id, item.manager_notes || ""]))
  );
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  async function review(id: string, status: "approved" | "needs_changes") {
    setBusyId(`${status}:${id}`);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/people/onboarding/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          manager_notes: notes[id] || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to review onboarding." });
        return;
      }
      setMessage({
        type: "success",
        text:
          status === "approved"
            ? "Onboarding approved."
            : "Onboarding returned for changes.",
      });
      setQueue((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                status,
                reviewed_at: data.form.reviewed_at,
                manager_notes: data.form.manager_notes,
              }
            : item
        )
      );
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Onboarding Queue</h1>
        <p className="text-sm text-gray-500 mt-1">
          Review employee onboarding submissions and send them forward or back with notes.
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

      <div className="space-y-4">
        {queue.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
            No onboarding forms yet.
          </div>
        ) : (
          queue.map((item) => {
            const completedChecks = [
              item.acknowledge_role_expectations,
              item.acknowledge_tentative_offer,
              item.acknowledge_probation_policy,
              item.acknowledge_bonus_policy,
              item.acknowledge_social_fund_policy,
              item.acknowledge_social_lead_policy,
              item.acknowledge_leadership_growth,
            ].filter(Boolean).length;

            return (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-gray-200 p-5 space-y-4"
              >
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{item.full_name}</p>
                    <p className="text-sm text-gray-500">{item.email}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {item.role_title || item.employee?.role_title || "Role pending"} ·{" "}
                      {item.employee?.current_level?.title || "Level pending"} ·{" "}
                      {item.employee?.employee_code || "Code pending"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                        item.status === "approved"
                          ? "bg-green-100 text-green-700"
                          : item.status === "submitted"
                          ? "bg-violet-100 text-violet-700"
                          : item.status === "needs_changes"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {labelizePeopleValue(item.status)}
                    </span>
                    <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      {completedChecks}/7 acknowledgements
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                      Submitted
                    </p>
                    <p className="font-medium text-gray-900">{fmtDate(item.submitted_at)}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Signed by {item.signature_name || "not yet signed"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                      Employment
                    </p>
                    <p className="font-medium text-gray-900">
                      {labelizePeopleValue(item.employee?.employment_status || "tentative")}
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                      Last review
                    </p>
                    <p className="font-medium text-gray-900">{fmtDate(item.reviewed_at)}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Manager notes
                  </label>
                  <textarea
                    value={notes[item.id] || ""}
                    onChange={(e) =>
                      setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                    className="w-full min-h-[92px] rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Add onboarding review notes, missing items, or approval context."
                  />
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => review(item.id, "needs_changes")}
                    disabled={busyId !== null}
                    className="px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50"
                  >
                    {busyId === `needs_changes:${item.id}`
                      ? "Sending..."
                      : "Needs changes"}
                  </button>
                  <button
                    onClick={() => review(item.id, "approved")}
                    disabled={busyId !== null}
                    className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {busyId === `approved:${item.id}` ? "Approving..." : "Approve"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
