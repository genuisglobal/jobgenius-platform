"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type AccountManager = {
  id: string;
  name: string | null;
  email: string;
};

type CapacityRow = {
  accountManagerId: string;
  accountManagerName: string;
  email: string;
  monthlyLimit: number;
  approvedCount: number;
  spotsLeft: number;
  notes: string | null;
};

type CapacitySnapshot = {
  capacityMonth: string;
  monthLabel: string;
  rows: CapacityRow[];
  totalCapacity: number;
  reservedCount: number;
  spotsLeft: number;
};

type IntakeState = {
  id: string;
  job_seeker_id: string;
  selected_plan: string | null;
  offer_path: string | null;
  submitted_code: string | null;
  base_registration_fee: number | string | null;
  discount_amount: number | string | null;
  final_registration_fee: number | string | null;
  status: string;
  submitted_at: string | null;
  approved_at: string | null;
  capacity_month: string | null;
  preview_agreed_at: string | null;
  preview_started_at: string | null;
  preview_expires_at: string | null;
  preview_converted_at: string | null;
  call_completed_at: string | null;
  assigned_account_manager_id: string | null;
  jobSeeker: {
    id: string;
    full_name: string | null;
    email: string;
    location: string | null;
    seniority: string | null;
    onboarding_completed_at: string | null;
    profile_completion: number | null;
  } | null;
  assignedAccountManager: AccountManager | null;
};

type RowActionState = {
  accountManagerId: string;
  notes: string;
};

const FILTERS = [
  { key: "pending_review", label: "Pending Review" },
  { key: "call_completed", label: "First Call Complete" },
  { key: "waitlisted", label: "Waitlisted" },
  { key: "approved_preview", label: "Preview Approved" },
  { key: "preview_active", label: "Preview Active" },
  { key: "preview_expired", label: "Preview Expired" },
  { key: "approved_payment_pending", label: "Approved / Unfunded" },
  { key: "active_client", label: "Active Clients" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All Intake" },
] as const;

function monthInputValue(capacityMonth: string): string {
  return capacityMonth.slice(0, 7);
}

function toCapacityMonth(value: string): string {
  return /^\d{4}-\d{2}$/.test(value)
    ? `${value}-01`
    : new Date().toISOString().slice(0, 7) + "-01";
}

function statusClasses(status: string): string {
  switch (status) {
    case "approved_preview":
      return "bg-violet-100 text-violet-800";
    case "call_completed":
      return "bg-cyan-100 text-cyan-800";
    case "preview_active":
      return "bg-purple-100 text-purple-800";
    case "preview_expired":
      return "bg-amber-100 text-amber-800";
    case "approved_payment_pending":
      return "bg-green-100 text-green-800";
    case "active_client":
      return "bg-emerald-100 text-emerald-800";
    case "waitlisted":
      return "bg-violet-100 text-violet-800";
    case "rejected":
      return "bg-red-100 text-red-800";
    default:
      return "bg-amber-100 text-amber-800";
  }
}

function formatCurrency(value: number | string | null): string {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? `$${amount.toLocaleString()}` : "$0";
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : "-";
}

export default function IntakeQueueClient({
  initialIntakeStates,
  accountManagers,
  initialCapacity,
  isSuperAdmin = false,
}: {
  initialIntakeStates: IntakeState[];
  accountManagers: AccountManager[];
  initialCapacity: CapacitySnapshot;
  isSuperAdmin?: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] =
    useState<(typeof FILTERS)[number]["key"]>("pending_review");
  const [capacity, setCapacity] = useState(initialCapacity);
  const [selectedMonth, setSelectedMonth] = useState(
    monthInputValue(initialCapacity.capacityMonth)
  );
  const [rowState, setRowState] = useState<Record<string, RowActionState>>(
    Object.fromEntries(
      initialIntakeStates.map((state) => [
        state.id,
        {
          accountManagerId: state.assigned_account_manager_id ?? "",
          notes: "",
        },
      ])
    )
  );
  const [loadingCapacity, setLoadingCapacity] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCapacity() {
      setLoadingCapacity(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/admin/capacity?month=${encodeURIComponent(toCapacityMonth(selectedMonth))}`,
          { cache: "no-store" }
        );
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          if (!cancelled) {
            setError(data?.error || "Failed to load capacity.");
          }
          return;
        }

        if (!cancelled) {
          setCapacity(data as CapacitySnapshot);
        }
      } catch {
        if (!cancelled) {
          setError("Network error while loading capacity.");
        }
      } finally {
        if (!cancelled) {
          setLoadingCapacity(false);
        }
      }
    }

    if (selectedMonth !== monthInputValue(capacity.capacityMonth)) {
      loadCapacity();
      return () => {
        cancelled = true;
      };
    }

    return () => {
      cancelled = true;
    };
  }, [capacity.capacityMonth, selectedMonth]);

  const filteredStates = useMemo(() => {
    if (filter === "all") return initialIntakeStates;
    if (filter === "pending_review") {
      return initialIntakeStates.filter((state) =>
        ["pending_review", "submitted"].includes(state.status)
      );
    }
    return initialIntakeStates.filter((state) => state.status === filter);
  }, [filter, initialIntakeStates]);

  const counts = useMemo(() => {
    return {
      pendingReview: initialIntakeStates.filter((row) =>
        ["pending_review", "submitted"].includes(row.status)
      ).length,
      callCompleted: initialIntakeStates.filter((row) => row.status === "call_completed").length,
      waitlisted: initialIntakeStates.filter((row) => row.status === "waitlisted").length,
      previewPipeline: initialIntakeStates.filter((row) =>
        ["approved_preview", "preview_active"].includes(row.status)
      ).length,
      approvedPaymentPending: initialIntakeStates.filter(
        (row) => row.status === "approved_payment_pending"
      ).length,
      activeClient: initialIntakeStates.filter((row) => row.status === "active_client").length,
    };
  }, [initialIntakeStates]);

  const capacityMap = useMemo(
    () => new Map(capacity.rows.map((row) => [row.accountManagerId, row])),
    [capacity.rows]
  );

  function updateRowState(id: string, updates: Partial<RowActionState>) {
    setRowState((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? { accountManagerId: "", notes: "" }),
        ...updates,
      },
    }));
  }

  async function runAction(
    id: string,
    action: "approve" | "waitlist" | "reject" | "startPreview" | "expirePreview"
    | "markCallComplete" | "activate"
  ) {
    const current = rowState[id] ?? { accountManagerId: "", notes: "" };
    if (action === "approve" && !current.accountManagerId) {
      setError("Select an account manager before approving a spot.");
      return;
    }

    setProcessingId(id);
    setError(null);
    setMessage(null);

    const endpoint =
      action === "approve"
        ? `/api/admin/intake/${id}/approve`
        : action === "markCallComplete"
        ? `/api/admin/intake/${id}/mark-call-complete`
        : action === "startPreview"
        ? `/api/admin/intake/${id}/start-preview`
        : action === "expirePreview"
        ? `/api/admin/intake/${id}/expire-preview`
        : action === "activate"
        ? `/api/admin/intake/${id}/activate`
        : action === "waitlist"
        ? `/api/admin/intake/${id}/waitlist`
        : `/api/admin/intake/${id}/reject`;

    const payload =
      action === "approve"
        ? {
            accountManagerId: current.accountManagerId,
            capacityMonth: toCapacityMonth(selectedMonth),
            notes: current.notes || null,
          }
        : action === "startPreview" || action === "expirePreview" || action === "markCallComplete"
        ? {}
        : {
            notes: current.notes || null,
          };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data?.error || "Action failed.");
        return;
      }

      setMessage(
          action === "approve"
          ? "Spot approved and reserved."
          : action === "activate"
          ? "Client marked active (override)."
          : action === "markCallComplete"
          ? "First call marked complete."
          : action === "startPreview"
          ? "Strategy preview started."
          : action === "expirePreview"
          ? "Strategy preview expired."
          : action === "waitlist"
          ? "Seeker moved to waitlist."
          : "Seeker marked as rejected."
      );
      router.refresh();
    } catch {
      setError("Network error while updating intake.");
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Intake Queue</h1>
          <p className="text-gray-600">
            Review self-serve signups, reserve real account manager spots, or push
            seekers into the next window.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
              Capacity Month
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </div>
          <Link
            href="/dashboard/admin/capacity"
            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Manage AM Capacity
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-7">
        <SummaryCard label="Pending Review" value={counts.pendingReview} tone="amber" />
        <SummaryCard label="First Call Complete" value={counts.callCompleted} tone="cyan" />
        <SummaryCard label="Waitlisted" value={counts.waitlisted} tone="blue" />
        <SummaryCard label="Preview Pipeline" value={counts.previewPipeline} tone="purple" />
        <SummaryCard
          label="Approved / Unfunded"
          value={counts.approvedPaymentPending}
          tone="green"
        />
        <SummaryCard label="Active Clients" value={counts.activeClient} tone="emerald" />
        <SummaryCard
          label={`${capacity.monthLabel} Spots Left`}
          value={capacity.spotsLeft}
          tone="purple"
          loading={loadingCapacity}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            onClick={() => setFilter(option.key)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              filter === option.key
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="font-semibold text-gray-900">Current Queue</h2>
          <p className="text-sm text-gray-500">
            Spots are reserved only when an approved account manager is selected.
          </p>
        </div>

        {filteredStates.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-500">
            No intake records in this view.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredStates.map((state) => {
      const current = rowState[state.id] ?? {
        accountManagerId: state.assigned_account_manager_id ?? "",
        notes: "",
      };
      const showReviewActions = [
        "pending_review",
        "submitted",
        "waitlisted",
      ].includes(state.status);
      const isStrategyPreview = state.offer_path === "strategy_preview";
      const canMarkCallComplete =
        isStrategyPreview && ["pending_review", "submitted"].includes(state.status);
      const canApprovePreview = isStrategyPreview && state.status === "call_completed";
      const canStartPreview =
        isStrategyPreview &&
        state.status === "approved_preview";
      const canExpirePreview =
        isStrategyPreview &&
        state.status === "preview_active";
      const showSettledMessage =
        !showReviewActions && !canMarkCallComplete && !canApprovePreview && !canStartPreview && !canExpirePreview;

              return (
                <div key={state.id} className="px-5 py-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold text-gray-900">
                          {state.jobSeeker?.full_name || "Unnamed seeker"}
                        </p>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses(state.status)}`}
                        >
                          {state.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600">
                        <span>{state.jobSeeker?.email}</span>
                        {state.jobSeeker?.location && <span>{state.jobSeeker.location}</span>}
                        {state.jobSeeker?.seniority && <span>{state.jobSeeker.seniority}</span>}
                        <span>
                          Profile {state.jobSeeker?.profile_completion ?? 0}% complete
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-500">
                        <span>Plan: {state.selected_plan ?? "Not selected"}</span>
                        <span>Offer path: {state.offer_path ?? "discount"}</span>
                        <span>Submitted: {formatDate(state.submitted_at)}</span>
                        {state.submitted_code && <span>Code: {state.submitted_code}</span>}
                      </div>
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-500">
                        <span>Base: {formatCurrency(state.base_registration_fee)}</span>
                        <span>Discount: {formatCurrency(state.discount_amount)}</span>
                        <span>Final: {formatCurrency(state.final_registration_fee)}</span>
                      </div>
                      {state.offer_path === "strategy_preview" && (
                        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-500">
                          {state.call_completed_at && (
                            <span>Call complete: {formatDate(state.call_completed_at)}</span>
                          )}
                          {state.preview_agreed_at && (
                            <span>Preview agreed: {formatDate(state.preview_agreed_at)}</span>
                          )}
                          {state.preview_started_at && (
                            <span>Started: {formatDate(state.preview_started_at)}</span>
                          )}
                          {state.preview_expires_at && (
                            <span>Expires: {formatDate(state.preview_expires_at)}</span>
                          )}
                          {state.preview_converted_at && (
                            <span>Converted: {formatDate(state.preview_converted_at)}</span>
                          )}
                        </div>
                      )}
                      {state.assignedAccountManager && (
                        <p className="text-sm text-gray-600">
                          Assigned AM:{" "}
                          <span className="font-medium text-gray-900">
                            {state.assignedAccountManager.name ||
                              state.assignedAccountManager.email}
                          </span>
                        </p>
                      )}
                    </div>

                    <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                            Reserve Spot With
                          </label>
                          <select
                            value={current.accountManagerId}
                            onChange={(event) =>
                              updateRowState(state.id, {
                                accountManagerId: event.target.value,
                              })
                            }
                            disabled={!showReviewActions}
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
                          >
                            <option value="">Select account manager</option>
                            {accountManagers.map((manager) => {
                              const managerCapacity = capacityMap.get(manager.id);
                              const label = managerCapacity
                                ? `${manager.name || manager.email.split("@")[0]} (${managerCapacity.spotsLeft} left)`
                                : manager.name || manager.email;
                              return (
                                <option key={manager.id} value={manager.id}>
                                  {label}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                        <div className="rounded-lg border border-white bg-white px-3 py-2 text-sm text-gray-600">
                          {loadingCapacity ? (
                            "Loading capacity..."
                          ) : (
                            <>
                              <span className="font-semibold text-gray-900">
                                {capacity.spotsLeft}
                              </span>{" "}
                              total spots left in {capacity.monthLabel}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="mt-3">
                        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                          Notes
                        </label>
                        <textarea
                          rows={3}
                          value={current.notes}
                          onChange={(event) =>
                            updateRowState(state.id, { notes: event.target.value })
                          }
                          disabled={!showReviewActions}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
                          placeholder="Optional internal note"
                        />
                      </div>

                      {isSuperAdmin && state.status !== "active_client" ? (
                        <div className="mt-4">
                          <button
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Override: mark this client ACTIVE without a confirmed payment? This grants live applications immediately and is audit-logged."
                                )
                              ) {
                                runAction(state.id, "activate");
                              }
                            }}
                            disabled={processingId === state.id}
                            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                          >
                            {processingId === state.id
                              ? "Saving..."
                              : "Mark active (override)"}
                          </button>
                        </div>
                      ) : null}

                      {showReviewActions ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {canMarkCallComplete ? (
                            <button
                              onClick={() => runAction(state.id, "markCallComplete")}
                              disabled={processingId === state.id}
                              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
                            >
                              {processingId === state.id ? "Saving..." : "Mark Call Complete"}
                            </button>
                          ) : canApprovePreview ? (
                            <button
                              onClick={() => runAction(state.id, "approve")}
                              disabled={processingId === state.id}
                              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                            >
                              {processingId === state.id ? "Saving..." : "Approve Preview"}
                            </button>
                          ) : (
                            <button
                              onClick={() => runAction(state.id, "approve")}
                              disabled={processingId === state.id}
                              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              {processingId === state.id ? "Saving..." : "Approve Spot"}
                            </button>
                          )}
                          <button
                            onClick={() => runAction(state.id, "waitlist")}
                            disabled={processingId === state.id}
                            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                          >
                            Waitlist
                          </button>
                          <button
                            onClick={() => runAction(state.id, "reject")}
                            disabled={processingId === state.id}
                            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-red-700 border border-red-200 hover:bg-red-50 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      ) : canApprovePreview ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            onClick={() => runAction(state.id, "approve")}
                            disabled={processingId === state.id}
                            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                          >
                            {processingId === state.id ? "Saving..." : "Approve Preview"}
                          </button>
                        </div>
                      ) : canStartPreview ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            onClick={() => runAction(state.id, "startPreview")}
                            disabled={processingId === state.id}
                            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                          >
                            {processingId === state.id ? "Saving..." : "Start Preview"}
                          </button>
                        </div>
                      ) : canExpirePreview ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            onClick={() => runAction(state.id, "expirePreview")}
                            disabled={processingId === state.id}
                            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                          >
                            {processingId === state.id ? "Saving..." : "Expire Preview"}
                          </button>
                        </div>
                      ) : showSettledMessage ? (
                        <p className="mt-4 text-sm text-gray-500">
                          This intake is already in a settled state. Open the seeker record if
                          you need to adjust anything else.
                        </p>
                      ) : (
                        <p className="mt-4 text-sm text-gray-500">No actions available.</p>
                      )}

                      {state.jobSeeker?.id && (
                        <Link
                          href={`/dashboard/admin/job-seekers/${state.jobSeeker.id}`}
                          className="mt-4 inline-flex text-sm font-medium text-violet-600 hover:text-violet-800"
                        >
                          {"Open seeker record ->"}
                        </Link>
                      )}
                    </div>
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

function SummaryCard({
  label,
  value,
  tone,
  loading = false,
}: {
  label: string;
  value: number;
  tone: "amber" | "blue" | "cyan" | "green" | "emerald" | "purple";
  loading?: boolean;
}) {
  const toneMap: Record<"amber" | "blue" | "cyan" | "green" | "emerald" | "purple", string> = {
    amber: "text-amber-600",
    blue: "text-violet-600",
    cyan: "text-cyan-600",
    green: "text-green-600",
    emerald: "text-emerald-600",
    purple: "text-purple-600",
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${toneMap[tone]}`}>
        {loading ? "..." : value}
      </p>
    </div>
  );
}
