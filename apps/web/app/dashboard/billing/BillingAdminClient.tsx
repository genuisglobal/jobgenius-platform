"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PaymentRequest {
  id: string;
  method: string;
  status: string;
  note: string | null;
  created_at: string;
  job_seeker_id: string;
  installment_id: string | null;
  offer_id: string | null;
  job_seekers: { id: string; full_name: string; email: string } | null;
}

interface Screenshot {
  id: string;
  file_url: string;
  uploaded_at: string;
  acknowledged_at: string | null;
  job_seeker_id: string;
  installment_id: string | null;
  offer_id: string | null;
  job_seekers: { id: string; full_name: string; email: string } | null;
}

interface Contract {
  id: string;
  plan_type: string;
  registration_fee: number;
  agreed_at: string | null;
  job_seeker_id: string;
  job_seekers: { id: string; full_name: string; email: string; plan_type: string } | null;
}

interface JobOffer {
  id: string;
  company: string;
  role: string;
  base_salary: number;
  status: string;
  commission_status: string;
  commission_amount: number | null;
  commission_due_date: string | null;
  reported_by: string;
  seeker_confirmed_at: string | null;
  am_confirmed_at: string | null;
  job_seeker_id: string;
  job_seekers: { id: string; full_name: string; email: string } | null;
}

interface Escalation {
  id: string;
  reason: string;
  context_notes: string | null;
  decision: string | null;
  created_at: string;
  job_seeker_id: string;
  job_seekers: { id: string; full_name: string; email: string } | null;
}

interface RegistrationFlexRequest {
  id: string;
  status: "pending" | "approved" | "rejected";
  requested_installment_count: number | null;
  requested_window_days: number | null;
  requested_note: string;
  requested_schedule:
    | { installment_number: number; amount: number; proposed_date: string }[]
    | null;
  approved_max_installments: number | null;
  approved_window_days: number | null;
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  job_seeker_id: string;
  job_seekers: { id: string; full_name: string; email: string } | null;
}

interface BillingAdminClientProps {
  paymentRequests: PaymentRequest[];
  screenshots: Screenshot[];
  contracts: Contract[];
  offers: JobOffer[];
  escalations: Escalation[];
  flexRequests: RegistrationFlexRequest[];
}

const TABS = ["Requests", "Screenshots", "Contracts", "Offers", "Escalations"] as const;
type Tab = typeof TABS[number];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  details_sent: "bg-purple-100 text-purple-800",
  screenshot_uploaded: "bg-indigo-100 text-indigo-800",
  acknowledged: "bg-green-100 text-green-800",
  reported: "bg-gray-100 text-gray-700",
  confirmed: "bg-violet-100 text-violet-700",
  accepted: "bg-green-100 text-green-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  signed: "bg-green-100 text-green-800",
  cleared: "bg-green-100 text-green-800",
  terminated: "bg-red-100 text-red-800",
  overdue: "bg-red-100 text-red-800",
  legal: "bg-red-200 text-red-900",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function BillingAdminClient({
  paymentRequests,
  screenshots,
  contracts,
  offers,
  escalations,
  flexRequests,
}: BillingAdminClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("Requests");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flexDrafts, setFlexDrafts] = useState<
    Record<string, { maxInstallments: string; windowDays: string; adminNote: string }>
  >({});

  const refresh = () => router.refresh();

  const callApi = async (url: string, body: Record<string, unknown>) => {
    setLoading(url);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Action failed.");
        return false;
      }
      refresh();
      return true;
    } catch {
      setError("Network error.");
      return false;
    } finally {
      setLoading(null);
    }
  };

  const pendingRequests = paymentRequests.filter((r) => r.status === "pending");
  const pendingScreenshots = screenshots.filter((s) => !s.acknowledged_at);
  const openEscalations = escalations.filter((e) => !e.decision);
  const pendingFlexRequests = flexRequests.filter((r) => r.status === "pending");

  const getFlexDraft = (req: RegistrationFlexRequest) => {
    const existing = flexDrafts[req.id];
    if (existing) {
      return existing;
    }
    const requestedScheduleCount = Array.isArray(req.requested_schedule)
      ? req.requested_schedule.length
      : 0;
    const requestedCount =
      req.requested_installment_count ??
      (requestedScheduleCount > 0 ? requestedScheduleCount : 4);
    return {
      maxInstallments: String(requestedCount),
      windowDays: String(req.requested_window_days ?? 60),
      adminNote: "",
    };
  };

  const setFlexDraft = (
    requestId: string,
    next: Partial<{ maxInstallments: string; windowDays: string; adminNote: string }>
  ) => {
    setFlexDrafts((prev) => {
      const current = prev[requestId] ?? {
        maxInstallments: "4",
        windowDays: "60",
        adminNote: "",
      };
      return {
        ...prev,
        [requestId]: { ...current, ...next },
      };
    });
  };

  const reviewFlexRequest = async (
    requestId: string,
    decision: "approved" | "rejected"
  ) => {
    const draft = flexDrafts[requestId] ?? {
      maxInstallments: "4",
      windowDays: "60",
      adminNote: "",
    };
    const maxInstallments = Number(draft.maxInstallments);
    const windowDays = Number(draft.windowDays);

    if (
      decision === "approved" &&
      (!Number.isFinite(maxInstallments) ||
        maxInstallments < 1 ||
        maxInstallments > 12 ||
        !Number.isFinite(windowDays) ||
        windowDays < 7 ||
        windowDays > 365)
    ) {
      setError(
        "Approved terms must be within valid limits (installments 1-12, days 7-365)."
      );
      return;
    }

    await callApi("/api/admin/billing/registration-flex/review", {
      requestId,
      decision,
      approvedMaxInstallments: decision === "approved" ? maxInstallments : null,
      approvedWindowDays: decision === "approved" ? windowDays : null,
      adminNote: draft.adminNote.trim() || null,
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
        <div className="flex items-center gap-2">
          <a
            href="/dashboard/billing/settings/promo-codes"
            className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Promo Codes
          </a>
          <a
            href="/dashboard/billing/settings"
            className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Payment Settings
          </a>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
          <p className="text-2xl font-bold text-yellow-600">{pendingRequests.length}</p>
          <p className="text-xs text-gray-500">Pending Requests</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
          <p className="text-2xl font-bold text-indigo-600">{pendingScreenshots.length}</p>
          <p className="text-xs text-gray-500">Unreviewed Screenshots</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
          <p className="text-2xl font-bold text-violet-600">
            {offers.filter((o) => o.status !== "accepted").length}
          </p>
          <p className="text-xs text-gray-500">Offers Pending Confirm</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
          <p className="text-2xl font-bold text-red-600">{openEscalations.length}</p>
          <p className="text-xs text-gray-500">Open Escalations</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
          <p className="text-2xl font-bold text-orange-600">{pendingFlexRequests.length}</p>
          <p className="text-xs text-gray-500">Flex Reg Requests</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline text-xs">Dismiss</button>
        </div>
      )}

      {flexRequests.length > 0 && (
        <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">
              Flexible Registration Requests
            </h2>
            <span className="text-xs text-gray-500">
              {pendingFlexRequests.length} pending
            </span>
          </div>

          <div className="space-y-3">
            {flexRequests.map((req) => {
              const draft = getFlexDraft(req);
              const requestedSchedule = Array.isArray(req.requested_schedule)
                ? req.requested_schedule
                : [];
              const requestedScheduleTotal = requestedSchedule.reduce(
                (sum, row) => sum + (Number(row.amount) || 0),
                0
              );
              return (
                <div
                  key={req.id}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">
                        {req.job_seekers?.full_name ?? req.job_seeker_id}
                      </p>
                      <p className="text-sm text-gray-500">
                        {req.job_seekers?.email}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Requested: {req.requested_installment_count ?? "-"} installments
                        {" | "}
                        {req.requested_window_days ?? "-"} days
                      </p>
                      <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                        {req.requested_note}
                      </p>
                      {requestedSchedule.length > 0 && (
                        <div className="mt-2 rounded-md border border-gray-200 bg-white p-2">
                          <p className="text-xs font-semibold text-gray-700">
                            Proposed schedule
                          </p>
                          <div className="mt-1 space-y-1">
                            {requestedSchedule.map((row, index) => (
                              <p
                                key={`${req.id}-schedule-${index}`}
                                className="text-xs text-gray-600"
                              >
                                #{row.installment_number || index + 1}: $
                                {Number(row.amount).toFixed(2)} on{" "}
                                {row.proposed_date}
                              </p>
                            ))}
                          </div>
                          <p className="text-[11px] text-gray-500 mt-1">
                            Total proposed: ${requestedScheduleTotal.toFixed(2)}
                          </p>
                        </div>
                      )}
                      {req.admin_note && (
                        <p className="text-xs text-gray-600 mt-1">
                          Admin note: {req.admin_note}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        Submitted {new Date(req.created_at).toLocaleString()}
                        {req.reviewed_at
                          ? ` | Reviewed ${new Date(req.reviewed_at).toLocaleString()}`
                          : ""}
                      </p>
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-2 min-w-[220px]">
                      <StatusBadge status={req.status} />
                      {req.status === "approved" && (
                        <p className="text-xs text-green-700 text-right">
                          Approved terms: {req.approved_max_installments ?? "-"} installments
                          {" | "}
                          {req.approved_window_days ?? "-"} days
                        </p>
                      )}

                      {req.status === "pending" && (
                        <>
                          <div className="grid grid-cols-2 gap-2 w-full">
                            <input
                              type="number"
                              min={1}
                              max={12}
                              value={draft.maxInstallments}
                              onChange={(event) =>
                                setFlexDraft(req.id, {
                                  maxInstallments: event.target.value,
                                })
                              }
                              className="px-2 py-1 text-xs border rounded bg-white"
                              placeholder="Installments"
                            />
                            <input
                              type="number"
                              min={7}
                              max={365}
                              value={draft.windowDays}
                              onChange={(event) =>
                                setFlexDraft(req.id, {
                                  windowDays: event.target.value,
                                })
                              }
                              className="px-2 py-1 text-xs border rounded bg-white"
                              placeholder="Days"
                            />
                          </div>
                          <textarea
                            rows={2}
                            value={draft.adminNote}
                            onChange={(event) =>
                              setFlexDraft(req.id, {
                                adminNote: event.target.value,
                              })
                            }
                            className="w-full px-2 py-1 text-xs border rounded bg-white resize-none"
                            placeholder="Optional admin note..."
                          />
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => reviewFlexRequest(req.id, "approved")}
                              disabled={loading === "/api/admin/billing/registration-flex/review"}
                              className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => reviewFlexRequest(req.id, "rejected")}
                              disabled={loading === "/api/admin/billing/registration-flex/review"}
                              className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-1">
          {TABS.map((tab) => {
            const badge =
              tab === "Requests" ? pendingRequests.length
              : tab === "Screenshots" ? pendingScreenshots.length
              : tab === "Escalations" ? openEscalations.length
              : 0;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? "border-violet-600 text-violet-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab}
                {badge > 0 && (
                  <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Requests Tab */}
      {activeTab === "Requests" && (
        <div className="space-y-3">
          {paymentRequests.length === 0 && (
            <p className="text-sm text-gray-500">No payment requests.</p>
          )}
          {paymentRequests.map((req) => (
            <div key={req.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-gray-900">
                    {req.job_seekers?.full_name ?? req.job_seeker_id}
                  </p>
                  <p className="text-sm text-gray-500">{req.job_seekers?.email}</p>
                  <p className="text-sm text-gray-700 mt-1">
                    Method: <strong className="capitalize">{req.method}</strong>
                    {req.installment_id && " · For installment"}
                    {req.offer_id && " · For commission"}
                  </p>
                  {req.note && <p className="text-xs text-gray-500 mt-1">Note: {req.note}</p>}
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(req.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={req.status} />
                  {req.status === "pending" && (
                    <button
                      onClick={() =>
                        callApi("/api/admin/billing/payment-details", { paymentRequestId: req.id })
                      }
                      disabled={loading === "/api/admin/billing/payment-details"}
                      className="text-xs px-3 py-1.5 bg-violet-600 text-white rounded-md hover:bg-violet-700 transition-colors disabled:opacity-50"
                    >
                      Send Details
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Screenshots Tab */}
      {activeTab === "Screenshots" && (
        <div className="space-y-3">
          {screenshots.length === 0 && (
            <p className="text-sm text-gray-500">No screenshots uploaded.</p>
          )}
          {screenshots.map((ss) => (
            <div key={ss.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-gray-900">
                    {ss.job_seekers?.full_name ?? ss.job_seeker_id}
                  </p>
                  <p className="text-sm text-gray-500">{ss.job_seekers?.email}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Uploaded: {new Date(ss.uploaded_at).toLocaleString()}
                  </p>
                  {ss.acknowledged_at && (
                    <p className="text-xs text-green-600 mt-0.5">
                      Acknowledged: {new Date(ss.acknowledged_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <a
                    href={ss.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                  >
                    View
                  </a>
                  {!ss.acknowledged_at && (
                    <button
                      onClick={() =>
                        callApi("/api/admin/billing/acknowledge-payment", { screenshotId: ss.id })
                      }
                      disabled={loading === "/api/admin/billing/acknowledge-payment"}
                      className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      Acknowledge
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Contracts Tab */}
      {activeTab === "Contracts" && (
        <div className="space-y-3">
          {contracts.length === 0 && (
            <p className="text-sm text-gray-500">No contracts signed yet.</p>
          )}
          {contracts.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">
                    {c.job_seekers?.full_name ?? c.job_seeker_id}
                  </p>
                  <p className="text-sm text-gray-500">{c.job_seekers?.email}</p>
                  <p className="text-sm text-gray-700 mt-1">
                    Plan: <strong className="capitalize">{c.plan_type}</strong> · Fee: ${Number(c.registration_fee).toLocaleString()}
                  </p>
                  {c.agreed_at && (
                    <p className="text-xs text-gray-400 mt-1">
                      Signed: {new Date(c.agreed_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <StatusBadge status={c.agreed_at ? "signed" : "pending"} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Offers Tab */}
      {activeTab === "Offers" && (
        <div className="space-y-3">
          {offers.length === 0 && (
            <p className="text-sm text-gray-500">No job offers reported.</p>
          )}
          {offers.map((offer) => (
            <div key={offer.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-gray-900">
                    {offer.job_seekers?.full_name ?? offer.job_seeker_id}
                  </p>
                  <p className="text-sm text-gray-500">{offer.job_seekers?.email}</p>
                  <p className="text-sm text-gray-700 mt-1">
                    {offer.role} at {offer.company} · ${Number(offer.base_salary).toLocaleString()}
                  </p>
                  {offer.commission_amount && (
                    <p className="text-sm text-orange-700 mt-0.5">
                      Commission: ${Number(offer.commission_amount).toLocaleString()}
                      {offer.commission_due_date && ` · Due: ${new Date(offer.commission_due_date).toLocaleDateString()}`}
                    </p>
                  )}
                  <div className="flex gap-2 mt-1 text-xs text-gray-500">
                    <span>Seeker confirmed: {offer.seeker_confirmed_at ? "✓" : "✗"}</span>
                    <span>AM confirmed: {offer.am_confirmed_at ? "✓" : "✗"}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={offer.status} />
                  <StatusBadge status={offer.commission_status} />
                  {offer.status !== "accepted" && (
                    <button
                      onClick={() =>
                        callApi("/api/admin/billing/offer/confirm", { offerId: offer.id })
                      }
                      disabled={loading === "/api/admin/billing/offer/confirm"}
                      className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      Confirm Offer
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Escalations Tab */}
      {activeTab === "Escalations" && (
        <div className="space-y-3">
          {escalations.length === 0 && (
            <p className="text-sm text-gray-500">No termination escalations.</p>
          )}
          {escalations.map((esc) => (
            <div key={esc.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-gray-900">
                    {esc.job_seekers?.full_name ?? esc.job_seeker_id}
                  </p>
                  <p className="text-sm text-gray-500">{esc.job_seekers?.email}</p>
                  <p className="text-sm text-gray-700 mt-1 capitalize">
                    Reason: <strong>{esc.reason.replace(/_/g, " ")}</strong>
                  </p>
                  {esc.context_notes && (
                    <p className="text-sm text-gray-600 mt-1">{esc.context_notes}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Escalated: {new Date(esc.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {esc.decision ? (
                    <StatusBadge status={esc.decision} />
                  ) : (
                    <>
                      <button
                        onClick={() =>
                          callApi("/api/admin/billing/escalation", {
                            escalationId: esc.id,
                            decision: "cleared",
                          })
                        }
                        disabled={!!loading}
                        className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        Clear
                      </button>
                      <button
                        onClick={() => {
                          if (!confirm(`Terminate ${esc.job_seekers?.full_name ?? "this seeker"}? This will deactivate their account.`)) return;
                          callApi("/api/admin/billing/escalation", {
                            escalationId: esc.id,
                            decision: "terminated",
                          });
                        }}
                        disabled={!!loading}
                        className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        Terminate
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
