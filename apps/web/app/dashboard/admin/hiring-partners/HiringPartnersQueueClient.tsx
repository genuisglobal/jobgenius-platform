"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  RecruiterPartnerInsight,
  RecruiterPartnerReport,
  RecruiterPartnerScoreTier,
} from "@/lib/recruiter-partner-insights";
import {
  ROLE_REQUEST_STATUSES,
  formatPartnerLabel,
} from "@/lib/recruiter-partners";

type AccountManager = {
  id: string;
  name: string | null;
  email: string;
};

type HiringRequest = {
  id: string;
  recruiter_id: string;
  submitted_by_name: string | null;
  submitted_by_email: string;
  persona_type: string;
  company_name: string;
  client_company_name: string | null;
  role_title: string | null;
  job_url: string | null;
  location: string;
  hiring_urgency: string | null;
  details: string | null;
  internal_note: string | null;
  status: string;
  assigned_account_manager_id: string | null;
  first_response_at: string | null;
  last_outbound_at: string | null;
  last_inbound_at: string | null;
  last_inbound_action_type: string | null;
  closed_reason: string | null;
  created_at: string;
  updated_at: string;
  recruiter: {
    id: string;
    name: string | null;
    company: string | null;
    email: string | null;
    linkedin_url: string | null;
    company_domain: string | null;
    partner_type: string | null;
    intake_source: string | null;
    do_not_contact: boolean | null;
    owner_account_manager_id: string | null;
    status: string;
  } | null;
  assignedAccountManager: AccountManager | null;
};

type RowState = {
  assignedAccountManagerId: string;
  status: string;
  doNotContact: boolean;
  internalNote: string;
};

type ProcessingState =
  | {
      id: string;
      action: "save" | "workspace";
    }
  | null;

const FILTERS = [
  { key: "new", label: "New" },
  { key: "awaiting_first_response", label: "Awaiting First Response" },
  { key: "actioned", label: "Recruiter Actioned" },
  { key: "repeat_partner", label: "Repeat Partners" },
  { key: "strategic", label: "Strategic Score" },
  { key: "workspace_enabled", label: "Workspace Enabled" },
  { key: "qualified", label: "Profiles Requested" },
  { key: "awaiting_details", label: "Needs Details" },
  { key: "agency", label: "Agency" },
  { key: "in_house", label: "In-House" },
  { key: "high_urgency", label: "High Urgency" },
  { key: "closed", label: "Closed" },
  { key: "unassigned", label: "No Owner" },
  { key: "do_not_contact", label: "Do Not Contact" },
  { key: "all", label: "All Requests" },
] as const;

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

function formatPercent(value: number) {
  return `${value}%`;
}

function statusClasses(status: string) {
  switch (status) {
    case "reviewing":
      return "bg-violet-100 text-violet-800";
    case "qualified":
      return "bg-violet-100 text-violet-800";
    case "awaiting_details":
      return "bg-amber-100 text-amber-800";
    case "candidate_shortlist_sent":
      return "bg-cyan-100 text-cyan-800";
    case "active":
      return "bg-emerald-100 text-emerald-800";
    case "closed":
      return "bg-gray-200 text-gray-700";
    case "rejected":
      return "bg-red-100 text-red-800";
    default:
      return "bg-orange-100 text-orange-800";
  }
}

function scoreTierClasses(tier: RecruiterPartnerScoreTier) {
  switch (tier) {
    case "strategic":
      return "bg-emerald-100 text-emerald-800";
    case "active":
      return "bg-violet-100 text-violet-800";
    case "warming":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-gray-200 text-gray-700";
  }
}

export default function HiringPartnersQueueClient({
  initialRequests,
  accountManagers,
  report,
}: {
  initialRequests: HiringRequest[];
  accountManagers: AccountManager[];
  report: RecruiterPartnerReport;
}) {
  const router = useRouter();
  const [filter, setFilter] =
    useState<(typeof FILTERS)[number]["key"]>("awaiting_first_response");
  const [processingState, setProcessingState] = useState<ProcessingState>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>(
    Object.fromEntries(
      initialRequests.map((request) => [
        request.id,
        {
          assignedAccountManagerId:
            request.assigned_account_manager_id ??
            request.recruiter?.owner_account_manager_id ??
            "",
          status: request.status,
          doNotContact: request.recruiter?.do_not_contact === true,
          internalNote: request.internal_note ?? "",
        },
      ])
    )
  );

  const insightByRecruiterId = useMemo(
    () => new Map(report.partnerInsights.map((insight) => [insight.recruiterId, insight])),
    [report.partnerInsights]
  );

  const filteredRequests = useMemo(() => {
    if (filter === "all") return initialRequests;
    if (filter === "awaiting_first_response") {
      return initialRequests.filter(
        (request) =>
          !request.first_response_at && !["closed", "rejected"].includes(request.status)
      );
    }
    if (filter === "high_urgency") {
      return initialRequests.filter((request) =>
        ["urgent", "immediate"].includes(request.hiring_urgency ?? "")
      );
    }
    if (filter === "actioned") {
      return initialRequests.filter((request) => Boolean(request.last_inbound_at));
    }
    if (filter === "repeat_partner") {
      return initialRequests.filter(
        (request) => insightByRecruiterId.get(request.recruiter_id)?.repeatPartner
      );
    }
    if (filter === "strategic") {
      return initialRequests.filter(
        (request) => insightByRecruiterId.get(request.recruiter_id)?.scoreTier === "strategic"
      );
    }
    if (filter === "workspace_enabled") {
      return initialRequests.filter(
        (request) => insightByRecruiterId.get(request.recruiter_id)?.workspaceEnabled
      );
    }
    if (filter === "unassigned") {
      return initialRequests.filter(
        (request) =>
          !request.assigned_account_manager_id && !request.recruiter?.owner_account_manager_id
      );
    }
    if (filter === "do_not_contact") {
      return initialRequests.filter((request) => request.recruiter?.do_not_contact === true);
    }
    if (filter === "agency" || filter === "in_house") {
      return initialRequests.filter((request) => request.persona_type === filter);
    }
    return initialRequests.filter((request) => request.status === filter);
  }, [filter, initialRequests, insightByRecruiterId]);

  const counts = useMemo(
    () => ({
      newCount: initialRequests.filter((request) => request.status === "new").length,
      awaitingResponse: initialRequests.filter(
        (request) =>
          !request.first_response_at && !["closed", "rejected"].includes(request.status)
      ).length,
      agency: initialRequests.filter((request) => request.persona_type === "agency").length,
      inHouse: initialRequests.filter((request) => request.persona_type === "in_house").length,
      highUrgency: initialRequests.filter((request) =>
        ["urgent", "immediate"].includes(request.hiring_urgency ?? "")
      ).length,
      unassigned: initialRequests.filter(
        (request) =>
          !request.assigned_account_manager_id && !request.recruiter?.owner_account_manager_id
      ).length,
    }),
    [initialRequests]
  );

  function updateRowState(id: string, updates: Partial<RowState>) {
    setRowState((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? {
          assignedAccountManagerId: "",
          status: "new",
          doNotContact: false,
          internalNote: "",
        }),
        ...updates,
      },
    }));
  }

  async function saveRequest(id: string) {
    const current = rowState[id];
    if (!current) return;

    setProcessingState({ id, action: "save" });
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/recruiter-role-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedAccountManagerId: current.assignedAccountManagerId || null,
          status: current.status,
          doNotContact: current.doNotContact,
          internalNote: current.internalNote || null,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data?.error || "Failed to save hiring request.");
        return;
      }

      setMessage("Hiring request updated.");
      router.refresh();
    } catch {
      setError("Network error while updating hiring request.");
    } finally {
      setProcessingState(null);
    }
  }

  async function sendPartnerLink(id: string) {
    setProcessingState({ id, action: "workspace" });
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/recruiter-role-requests/${id}/magic-link`, {
        method: "POST",
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        sent_to_email?: string;
      };

      if (!response.ok) {
        setError(data.error || "Failed to send partner workspace link.");
        return;
      }

      setMessage(
        data.sent_to_email
          ? `Partner workspace link sent to ${data.sent_to_email}.`
          : "Partner workspace link sent."
      );
      router.refresh();
    } catch {
      setError("Network error while sending partner workspace link.");
    } finally {
      setProcessingState(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hiring Requests</h1>
          <p className="text-gray-600">
            Review recruiter and agency demand, assign an owner, and move qualified
            requests forward without forcing partner signup.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/hire"
            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Open public hire page
          </Link>
          <Link
            href="/dashboard/admin/accounts"
            className="inline-flex items-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Manage owners
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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <SummaryCard
          label="Repeat Partners"
          value={report.metrics.repeatPartners}
          tone="violet"
          helper={`${report.metrics.totalPartners} total`}
        />
        <SummaryCard
          label="Agency Share"
          value={report.metrics.agencySharePercent}
          tone="blue"
          suffix="%"
          helper={`${report.metrics.agencyRequestCount} agency reqs`}
        />
        <SummaryCard
          label="Reply Rate"
          value={report.metrics.replyRatePercent}
          tone="emerald"
          suffix="%"
          helper={`${report.metrics.replyingPartners} partners replied`}
        />
        <SummaryCard
          label="Progressed"
          value={report.metrics.progressedRatePercent}
          tone="orange"
          suffix="%"
          helper={`${report.metrics.progressedRequests} reqs`}
        />
        <SummaryCard
          label="Strategic"
          value={report.metrics.strategicPartners}
          tone="red"
          helper={`Avg score ${report.metrics.averageScore}`}
        />
        <SummaryCard
          label="Workspace"
          value={report.metrics.workspaceEnabledPartners}
          tone="gray"
          helper="invite-enabled partners"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Agency Reporting</h2>
              <p className="mt-1 text-sm text-gray-500">
                Track which agencies behave like repeat demand channels rather than one-off
                contacts.
              </p>
            </div>
            <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-violet-700">
              Phase 4
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <MetricTile
              label="Agency Partners"
              value={String(report.metrics.agencyPartners)}
              detail={`${report.metrics.repeatAgencies} repeat agencies`}
            />
            <MetricTile
              label="Unique Client Cos."
              value={String(report.metrics.uniqueAgencyClients)}
              detail="across agency-submitted reqs"
            />
            <MetricTile
              label="Agency Request Share"
              value={formatPercent(report.metrics.agencySharePercent)}
              detail={`${report.metrics.agencyRequestCount} of ${report.metrics.totalRequests} reqs`}
            />
            <MetricTile
              label="Workspace Enabled"
              value={String(
                report.partnerInsights.filter(
                  (insight) => insight.partnerType === "agency" && insight.workspaceEnabled
                ).length
              )}
              detail="agency partners with access"
            />
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Top Agencies
            </h3>
            {report.agencyLeaderboard.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">No agency partners yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {report.agencyLeaderboard.map((agency) => (
                  <div
                    key={agency.recruiterId}
                    className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">{agency.displayName}</p>
                        <p className="mt-1 text-sm text-gray-500">
                          {agency.ownerLabel || "No owner"} | {agency.clientCompanyCount} client
                          {agency.clientCompanyCount === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${scoreTierClasses(
                            agency.scoreTier
                          )}`}
                        >
                          {formatPartnerLabel(agency.scoreTier)}
                        </span>
                        <span className="text-sm font-semibold text-gray-700">
                          Score {agency.score}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600">
                      <span>{agency.requestCount} requests</span>
                      <span>{agency.openRequestCount} open</span>
                      <span>{agency.replyCount} replied</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Partner Scoring</h2>
              <p className="mt-1 text-sm text-gray-500">
                Prioritize repeat demand, real recruiter engagement, pipeline movement, and
                workspace usage.
              </p>
            </div>
            <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-violet-700">
              Avg {report.metrics.averageScore}
            </span>
          </div>

          {report.partnerInsights.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No partner insights available yet.</p>
          ) : (
            <div className="mt-5 space-y-3">
              {report.partnerInsights.slice(0, 8).map((insight) => (
                <PartnerScoreRow key={insight.recruiterId} insight={insight} />
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Pipeline Collaboration Snapshot
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              This is the shared hiring-side view of where requests are sitting after intake.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <PipelineTile label="New" value={report.pipeline.newCount} tone="orange" />
          <PipelineTile label="Reviewing" value={report.pipeline.reviewingCount} tone="blue" />
          <PipelineTile label="Qualified" value={report.pipeline.qualifiedCount} tone="violet" />
          <PipelineTile
            label="Need Details"
            value={report.pipeline.awaitingDetailsCount}
            tone="amber"
          />
          <PipelineTile
            label="Shortlist Sent"
            value={report.pipeline.shortlistSentCount}
            tone="cyan"
          />
          <PipelineTile label="Active" value={report.pipeline.activeCount} tone="emerald" />
          <PipelineTile label="Closed" value={report.pipeline.closedCount} tone="gray" />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <SummaryCard label="New" value={counts.newCount} tone="orange" />
        <SummaryCard
          label="Awaiting Response"
          value={counts.awaitingResponse}
          tone="violet"
        />
        <SummaryCard label="Agency" value={counts.agency} tone="blue" />
        <SummaryCard label="In-House" value={counts.inHouse} tone="emerald" />
        <SummaryCard label="High Urgency" value={counts.highUrgency} tone="red" />
        <SummaryCard label="No Owner" value={counts.unassigned} tone="gray" />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setFilter(option.key)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              filter === option.key
                ? "bg-gray-900 text-white"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
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
            Requests remain no-account on the recruiter side. Internal owner assignment
            happens here.
          </p>
        </div>

        {filteredRequests.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-500">
            No hiring requests in this view.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredRequests.map((request) => {
              const current = rowState[request.id];
              const contactName =
                request.submitted_by_name ||
                request.recruiter?.name ||
                request.submitted_by_email;
              const personaLabel =
                request.persona_type === "agency" ? "Hiring for clients" : "Hiring for company";
              const roleLabel = request.role_title || "Role title not provided";
              const canSendWorkspaceLink =
                request.recruiter?.do_not_contact !== true &&
                Boolean(request.submitted_by_email || request.recruiter?.email);
              const isSaving =
                processingState?.id === request.id && processingState.action === "save";
              const isSendingWorkspaceLink =
                processingState?.id === request.id &&
                processingState.action === "workspace";

              return (
                <div key={request.id} className="px-5 py-5">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold text-gray-900">{roleLabel}</p>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses(request.status)}`}
                        >
                          {formatPartnerLabel(request.status)}
                        </span>
                        {request.recruiter?.do_not_contact ? (
                          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
                            Do not contact
                          </span>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600">
                        <span>{contactName}</span>
                        <span>{request.submitted_by_email}</span>
                        <span>{personaLabel}</span>
                        <span>{request.company_name}</span>
                        <span>{request.location}</span>
                      </div>

                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-500">
                        <span>Partner type: {formatPartnerLabel(request.recruiter?.partner_type)}</span>
                        <span>Urgency: {formatPartnerLabel(request.hiring_urgency)}</span>
                        <span>Submitted: {formatDate(request.created_at)}</span>
                        <span>First response: {formatDate(request.first_response_at)}</span>
                        <span>Last outbound: {formatDate(request.last_outbound_at)}</span>
                      </div>

                      {request.last_inbound_action_type ? (
                        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-violet-700">
                          <span>
                            Recruiter action:{" "}
                            <span className="font-semibold">
                              {formatPartnerLabel(request.last_inbound_action_type)}
                            </span>
                          </span>
                          <span>Recorded: {formatDate(request.last_inbound_at)}</span>
                        </div>
                      ) : null}

                      {(request.client_company_name || request.recruiter?.company_domain) && (
                        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-500">
                          {request.client_company_name ? (
                            <span>Client: {request.client_company_name}</span>
                          ) : null}
                          {request.recruiter?.company_domain ? (
                            <span>Domain: {request.recruiter.company_domain}</span>
                          ) : null}
                        </div>
                      )}

                      {request.job_url ? (
                        <p className="text-sm">
                          <a
                            href={request.job_url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-violet-600 hover:text-violet-800"
                          >
                            Open job link
                          </a>
                        </p>
                      ) : null}

                      {request.details ? (
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-700">
                          {request.details}
                        </div>
                      ) : null}
                    </div>

                    <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Owner
                          </label>
                          <select
                            value={current?.assignedAccountManagerId ?? ""}
                            onChange={(event) =>
                              updateRowState(request.id, {
                                assignedAccountManagerId: event.target.value,
                              })
                            }
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                          >
                            <option value="">Unassigned</option>
                            {accountManagers.map((manager) => (
                              <option key={manager.id} value={manager.id}>
                                {manager.name || manager.email}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Request Status
                          </label>
                          <select
                            value={current?.status ?? request.status}
                            onChange={(event) =>
                              updateRowState(request.id, { status: event.target.value })
                            }
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                          >
                            {ROLE_REQUEST_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {formatPartnerLabel(status)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <label className="mt-4 flex items-center gap-3 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={current?.doNotContact ?? false}
                          onChange={(event) =>
                            updateRowState(request.id, {
                              doNotContact: event.target.checked,
                            })
                          }
                          className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                        />
                        Do not contact this recruiter directly
                      </label>

                      <div className="mt-4">
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Internal Note
                        </label>
                        <textarea
                          rows={4}
                          value={current?.internalNote ?? ""}
                          onChange={(event) =>
                            updateRowState(request.id, {
                              internalNote: event.target.value,
                            })
                          }
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                          placeholder="Fit notes, follow-up context, or ownership details."
                        />
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => saveRequest(request.id)}
                          disabled={Boolean(processingState?.id === request.id)}
                          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                        >
                          {isSaving ? "Saving..." : "Save Request"}
                        </button>
                        {canSendWorkspaceLink ? (
                          <button
                            type="button"
                            onClick={() => sendPartnerLink(request.id)}
                            disabled={Boolean(processingState?.id === request.id)}
                            className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                          >
                            {isSendingWorkspaceLink
                              ? "Working..."
                              : "Send Partner Link"}
                          </button>
                        ) : null}
                        {request.recruiter?.linkedin_url ? (
                          <a
                            href={request.recruiter.linkedin_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-medium text-gray-600 hover:text-gray-900"
                          >
                            LinkedIn
                          </a>
                        ) : null}
                        <a
                          href={`mailto:${request.submitted_by_email}`}
                          className="text-sm font-medium text-gray-600 hover:text-gray-900"
                        >
                          Email contact
                        </a>
                      </div>
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
  suffix,
  helper,
}: {
  label: string;
  value: number;
  tone: "orange" | "violet" | "blue" | "emerald" | "red" | "gray";
  suffix?: string;
  helper?: string;
}) {
  const toneMap: Record<"orange" | "violet" | "blue" | "emerald" | "red" | "gray", string> = {
    orange: "text-orange-600",
    violet: "text-violet-600",
    blue: "text-violet-600",
    emerald: "text-emerald-600",
    red: "text-red-600",
    gray: "text-gray-700",
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${toneMap[tone]}`}>
        {value}
        {suffix ?? ""}
      </p>
      {helper ? <p className="mt-1 text-xs text-gray-400">{helper}</p> : null}
    </div>
  );
}

function MetricTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{detail}</p>
    </div>
  );
}

function PipelineTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "orange" | "blue" | "violet" | "amber" | "cyan" | "emerald" | "gray";
}) {
  const toneMap: Record<
    "orange" | "blue" | "violet" | "amber" | "cyan" | "emerald" | "gray",
    string
  > = {
    orange: "text-orange-600",
    blue: "text-violet-600",
    violet: "text-violet-600",
    amber: "text-amber-600",
    cyan: "text-cyan-600",
    emerald: "text-emerald-600",
    gray: "text-gray-700",
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${toneMap[tone]}`}>{value}</p>
    </div>
  );
}

function PartnerScoreRow({ insight }: { insight: RecruiterPartnerInsight }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-gray-900">{insight.displayName}</p>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${scoreTierClasses(
                insight.scoreTier
              )}`}
            >
              {formatPartnerLabel(insight.scoreTier)}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {formatPartnerLabel(insight.partnerType)} | {insight.ownerLabel || "No owner"} |
            Last touch {formatDate(insight.lastTouchAt)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-gray-500">Partner score</p>
          <p className="text-2xl font-bold text-gray-900">{insight.score}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600">
        <span>{insight.requestCount} requests</span>
        <span>{insight.openRequestCount} open</span>
        <span>{insight.replyCount} replied</span>
        <span>{insight.progressedRequestCount} progressed</span>
        {insight.partnerType === "agency" ? (
          <span>{insight.clientCompanyCount} client accounts</span>
        ) : null}
        {insight.workspaceEnabled ? <span>Workspace enabled</span> : null}
      </div>

      {insight.scoreReasons.length > 0 ? (
        <p className="mt-3 text-sm text-gray-500">{insight.scoreReasons.join(" | ")}</p>
      ) : null}
    </div>
  );
}
