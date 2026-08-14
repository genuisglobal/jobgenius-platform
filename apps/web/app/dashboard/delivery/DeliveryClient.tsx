"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  buildClientDeliveryBoardSummary,
  CLIENT_DELIVERY_HEALTH_BANDS,
  CLIENT_DELIVERY_RISK_LEVELS,
  CLIENT_DELIVERY_STAGES,
  CLIENT_DELIVERY_STALE_STATUSES,
  labelizeClientDeliveryValue,
  type ClientDeliveryBoardSummary,
  type ClientDeliveryHealthBand,
  type ClientDeliveryRiskLevel,
  type ClientDeliverySnapshotRecord,
  type ClientDeliveryStage,
  type ClientDeliveryStaleStatus,
} from "@/lib/client-delivery";

type AccountManagerDirectoryRow = {
  id: string;
  name: string | null;
  email: string;
};

function stageBadgeClasses(stage: ClientDeliveryStage) {
  switch (stage) {
    case "onboarding":
      return "bg-slate-100 text-slate-700";
    case "ready_to_launch":
      return "bg-sky-100 text-sky-800";
    case "active_search":
      return "bg-violet-100 text-violet-800";
    case "interviewing":
      return "bg-amber-100 text-amber-800";
    case "offer":
      return "bg-emerald-100 text-emerald-800";
    case "placed":
      return "bg-green-100 text-green-800";
    case "paused":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function riskBadgeClasses(risk: ClientDeliveryRiskLevel) {
  switch (risk) {
    case "critical":
      return "bg-red-100 text-red-800";
    case "high":
      return "bg-amber-100 text-amber-800";
    case "medium":
      return "bg-violet-100 text-violet-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function healthBadgeClasses(healthBand: ClientDeliveryHealthBand) {
  switch (healthBand) {
    case "critical":
      return "bg-red-100 text-red-800";
    case "at_risk":
      return "bg-amber-100 text-amber-800";
    case "watch":
      return "bg-violet-100 text-violet-800";
    default:
      return "bg-emerald-100 text-emerald-800";
  }
}

function staleBadgeClasses(staleStatus: ClientDeliveryStaleStatus) {
  switch (staleStatus) {
    case "severely_stale":
      return "bg-red-100 text-red-800";
    case "stale":
      return "bg-amber-100 text-amber-800";
    case "approaching_stale":
      return "bg-slate-200 text-slate-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function formatDateTime(value: string | null) {
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatDate(value: string | null) {
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function compactMoney(value: number | null) {
  if (value === null || Number.isNaN(value)) return "n/a";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function summarizeLastTouch(days: number) {
  if (days <= 0) return "Touched today";
  if (days === 1) return "Touched 1 day ago";
  return `Touched ${days} days ago`;
}

function ownerLabel(
  accountManagerId: string | null,
  directory: Map<string, AccountManagerDirectoryRow>
) {
  if (!accountManagerId) return "Unassigned";
  const row = directory.get(accountManagerId);
  if (!row) return "Unknown owner";
  return row.name?.trim() || row.email;
}

function RowActivity({ row }: { row: ClientDeliverySnapshotRecord }) {
  return (
    <div className="space-y-1 text-xs text-gray-500">
      <p>{row.applications7d} applications in the last 7 days</p>
      <p>{row.activeThreadCount} active outreach thread{row.activeThreadCount === 1 ? "" : "s"}</p>
      <p>{row.openInterviewCount} open interview{row.openInterviewCount === 1 ? "" : "s"}</p>
      <p>Health: {row.healthScore}/100</p>
      {row.staleStatus !== "none" ? <p>Stale: {labelizeClientDeliveryValue(row.staleStatus)}</p> : null}
      {row.nextInterviewAt ? <p>Next interview: {formatDateTime(row.nextInterviewAt)}</p> : null}
      {row.nextFollowUpAt ? <p>Follow-up due: {formatDateTime(row.nextFollowUpAt)}</p> : null}
      {row.hasOpenOffer ? <p>Offer flow is currently active</p> : null}
    </div>
  );
}

function SummaryCards({ summary }: { summary: ClientDeliveryBoardSummary }) {
  const cards = [
    { label: "Visible cases", value: summary.totalCount, tone: "text-gray-900" },
    { label: "Need attention", value: summary.needsAttentionCount, tone: "text-red-700" },
    { label: "Overdue action", value: summary.overdueNextActionCount, tone: "text-amber-700" },
    { label: "High risk", value: summary.highRiskCount, tone: "text-violet-700" },
    { label: "Critical health", value: summary.criticalHealthCount, tone: "text-red-700" },
    { label: "Stale", value: summary.staleCount, tone: "text-amber-700" },
    { label: "Escalated", value: summary.escalatedCount, tone: "text-rose-700" },
    { label: "Mgr review", value: summary.managerReviewCount, tone: "text-violet-700" },
    { label: "Active blockers", value: summary.activeBlockerCount, tone: "text-violet-700" },
    { label: "Payment holds", value: summary.paymentHoldCount, tone: "text-rose-700" },
  ];

  return (
    <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            {card.label}
          </p>
          <p className={`mt-2 text-3xl font-bold ${card.tone}`}>{card.value}</p>
        </div>
      ))}
    </div>
  );
}

export default function DeliveryClient({
  initialRows,
  accountManagers,
  canViewAllCases,
}: {
  initialRows: ClientDeliverySnapshotRecord[];
  accountManagers: AccountManagerDirectoryRow[];
  canViewAllCases: boolean;
}) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<ClientDeliveryStage | "all">("all");
  const [riskFilter, setRiskFilter] = useState<ClientDeliveryRiskLevel | "all">("all");
  const [healthFilter, setHealthFilter] = useState<ClientDeliveryHealthBand | "all">("all");
  const [staleFilter, setStaleFilter] = useState<ClientDeliveryStaleStatus | "all">("all");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [escalatedOnly, setEscalatedOnly] = useState(false);
  const [managerReviewOnly, setManagerReviewOnly] = useState(false);

  const accountManagerDirectory = useMemo(
    () => new Map(accountManagers.map((row) => [row.id, row])),
    [accountManagers]
  );

  const unfilteredSummary = useMemo(
    () => buildClientDeliveryBoardSummary(initialRows),
    [initialRows]
  );

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return initialRows.filter((row) => {
      if (attentionOnly && !row.needsAttention) return false;
      if (stageFilter !== "all" && row.effectiveStage !== stageFilter) return false;
      if (riskFilter !== "all" && row.riskLevel !== riskFilter) return false;
      if (healthFilter !== "all" && row.healthBand !== healthFilter) return false;
      if (staleFilter !== "all" && row.staleStatus !== staleFilter) return false;
      if (escalatedOnly && !row.hasActiveEscalationRecord) return false;
      if (managerReviewOnly && !row.needsManagerReview) return false;
      if (!needle) return true;

      const owner = ownerLabel(row.accountManagerId, accountManagerDirectory).toLowerCase();
      return (
        row.fullName.toLowerCase().includes(needle) ||
        row.email.toLowerCase().includes(needle) ||
        row.location.toLowerCase().includes(needle) ||
        owner.includes(needle) ||
        row.targetTitles.some((title) => title.toLowerCase().includes(needle))
      );
    });
  }, [
    accountManagerDirectory,
    attentionOnly,
    escalatedOnly,
    healthFilter,
    initialRows,
    managerReviewOnly,
    riskFilter,
    search,
    staleFilter,
    stageFilter,
  ]);

  const summary = useMemo(() => buildClientDeliveryBoardSummary(rows), [rows]);
  const managerQueue = useMemo(
    () => rows.filter((row) => row.needsManagerReview).slice(0, 8),
    [rows]
  );

  return (
    <div className="space-y-6">
      <SummaryCards summary={summary} />

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Board filters</h2>
            <p className="text-sm text-gray-500 mt-1">
              Narrow cases by stage, risk, and attention needs.
            </p>
          </div>
          <div className="xl:w-80">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search seeker, role, location, or owner"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAttentionOnly((current) => !current)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              attentionOnly
                ? "bg-red-600 text-white"
                : "border border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {attentionOnly ? "Showing attention only" : "Attention only"}
          </button>
          <button
            type="button"
            onClick={() => setEscalatedOnly((current) => !current)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              escalatedOnly
                ? "bg-rose-600 text-white"
                : "border border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {escalatedOnly ? "Showing escalated only" : "Escalated only"}
          </button>
          <button
            type="button"
            onClick={() => setManagerReviewOnly((current) => !current)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              managerReviewOnly
                ? "bg-violet-600 text-white"
                : "border border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {managerReviewOnly ? "Showing manager review" : "Manager review only"}
          </button>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setAttentionOnly(false);
              setEscalatedOnly(false);
              setManagerReviewOnly(false);
              setStageFilter("all");
              setRiskFilter("all");
              setHealthFilter("all");
              setStaleFilter("all");
            }}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Reset filters
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Stage
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStageFilter("all")}
              className={`px-3 py-2 rounded-full text-sm font-medium ${
                stageFilter === "all"
                  ? "bg-violet-600 text-white"
                  : "border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              All {unfilteredSummary.totalCount}
            </button>
            {CLIENT_DELIVERY_STAGES.map((stage) => (
              <button
                key={stage}
                type="button"
                onClick={() => setStageFilter(stage)}
                className={`px-3 py-2 rounded-full text-sm font-medium ${
                  stageFilter === stage
                    ? "bg-violet-600 text-white"
                    : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {labelizeClientDeliveryValue(stage)} {unfilteredSummary.stageCounts[stage]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Risk
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRiskFilter("all")}
              className={`px-3 py-2 rounded-full text-sm font-medium ${
                riskFilter === "all"
                  ? "bg-violet-600 text-white"
                  : "border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              All {unfilteredSummary.totalCount}
            </button>
            {CLIENT_DELIVERY_RISK_LEVELS.map((risk) => (
              <button
                key={risk}
                type="button"
                onClick={() => setRiskFilter(risk)}
                className={`px-3 py-2 rounded-full text-sm font-medium ${
                  riskFilter === risk
                    ? "bg-violet-600 text-white"
                    : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {labelizeClientDeliveryValue(risk)} {unfilteredSummary.riskCounts[risk]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Health
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setHealthFilter("all")}
              className={`px-3 py-2 rounded-full text-sm font-medium ${
                healthFilter === "all"
                  ? "bg-violet-600 text-white"
                  : "border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              All {unfilteredSummary.totalCount}
            </button>
            {CLIENT_DELIVERY_HEALTH_BANDS.map((healthBand) => (
              <button
                key={healthBand}
                type="button"
                onClick={() => setHealthFilter(healthBand)}
                className={`px-3 py-2 rounded-full text-sm font-medium ${
                  healthFilter === healthBand
                    ? "bg-violet-600 text-white"
                    : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {labelizeClientDeliveryValue(healthBand)}{" "}
                {unfilteredSummary.healthBandCounts[healthBand]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Stale state
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStaleFilter("all")}
              className={`px-3 py-2 rounded-full text-sm font-medium ${
                staleFilter === "all"
                  ? "bg-violet-600 text-white"
                  : "border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              All {unfilteredSummary.totalCount}
            </button>
            {CLIENT_DELIVERY_STALE_STATUSES.map((staleStatus) => (
              <button
                key={staleStatus}
                type="button"
                onClick={() => setStaleFilter(staleStatus)}
                className={`px-3 py-2 rounded-full text-sm font-medium ${
                  staleFilter === staleStatus
                    ? "bg-violet-600 text-white"
                    : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {labelizeClientDeliveryValue(staleStatus)}{" "}
                {unfilteredSummary.staleStatusCounts[staleStatus]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {canViewAllCases && managerQueue.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-gray-900">Manager review queue</h2>
            <p className="text-sm text-gray-500 mt-1">
              Highest-priority cases currently flagged for manager intervention.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {managerQueue.map((row) => (
              <Link
                key={`review-${row.jobSeekerId}`}
                href={`/dashboard/seekers/${row.jobSeekerId}`}
                className="rounded-lg border border-gray-200 px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{row.fullName}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      {ownerLabel(row.accountManagerId, accountManagerDirectory)}
                    </p>
                  </div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${healthBadgeClasses(row.healthBand)}`}>
                    {labelizeClientDeliveryValue(row.healthBand)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {row.staleStatus !== "none" ? (
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${staleBadgeClasses(row.staleStatus)}`}>
                      {labelizeClientDeliveryValue(row.staleStatus)}
                    </span>
                  ) : null}
                  {row.hasActiveEscalationRecord ? (
                    <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800">
                      {labelizeClientDeliveryValue(row.escalationStatus)}
                    </span>
                  ) : null}
                  {row.overdueNextAction ? (
                    <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                      Overdue action
                    </span>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Active delivery board</h2>
            <p className="text-sm text-gray-500 mt-1">
              {rows.length} visible case{rows.length === 1 ? "" : "s"} after filters.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className="inline-flex px-2.5 py-1 rounded-full bg-red-50 text-red-700">
              Attention cases first
            </span>
            <span className="inline-flex px-2.5 py-1 rounded-full bg-violet-50 text-violet-700">
              Last touch + blockers + due actions drive ordering
            </span>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm text-gray-500">
              No delivery cases match the current filters.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden xl:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Client
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Stage
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Next action
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Activity
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Risk
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Owner
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Open
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row) => (
                    <tr key={row.jobSeekerId} className={row.needsAttention ? "bg-amber-50/40" : ""}>
                      <td className="px-5 py-4 align-top">
                        <div className="space-y-2">
                          <div>
                            <p className="font-semibold text-gray-900">{row.fullName}</p>
                            <p className="text-sm text-gray-500">{row.email || "No email set"}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {row.needsAttention ? (
                              <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                Needs attention
                              </span>
                            ) : null}
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${healthBadgeClasses(row.healthBand)}`}>
                              {labelizeClientDeliveryValue(row.healthBand)}
                            </span>
                            {row.staleStatus !== "none" ? (
                              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${staleBadgeClasses(row.staleStatus)}`}>
                                {labelizeClientDeliveryValue(row.staleStatus)}
                              </span>
                            ) : null}
                            {row.hasActiveEscalationRecord ? (
                              <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-800">
                                {labelizeClientDeliveryValue(row.escalationStatus)}
                              </span>
                            ) : null}
                            {row.hasPaymentHold ? (
                              <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-800">
                                Billing hold
                              </span>
                            ) : null}
                            {row.activeBlockerCount > 0 ? (
                              <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                {row.activeBlockerCount} blocker{row.activeBlockerCount === 1 ? "" : "s"}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-gray-500 space-y-1">
                            <p>{row.location || "Location pending"}</p>
                            <p>{row.targetTitles[0] || "Target role pending"}</p>
                            <p>{summarizeLastTouch(row.daysSinceLastTouch)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="space-y-2">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${stageBadgeClasses(row.effectiveStage)}`}>
                            {labelizeClientDeliveryValue(row.effectiveStage)}
                          </span>
                          <div className="text-xs text-gray-500 space-y-1">
                            <p>System: {labelizeClientDeliveryValue(row.systemStage)}</p>
                            {row.stageOverride ? (
                              <p>Override: {labelizeClientDeliveryValue(row.stageOverride)}</p>
                            ) : null}
                            <p>Stale: {labelizeClientDeliveryValue(row.staleStatus)}</p>
                            <p>Payment: {labelizeClientDeliveryValue(row.paymentStatus || "unknown")}</p>
                            {row.hasOpenOffer ? <p>Offer flow open</p> : null}
                            {row.nextStartDate ? <p>Start date: {formatDate(row.nextStartDate)}</p> : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="space-y-2">
                          <p className="font-medium text-gray-900">
                            {row.nextActionTitle || "No next action set"}
                          </p>
                          <div className="text-xs text-gray-500 space-y-1">
                            <p>
                              {row.nextActionType
                                ? labelizeClientDeliveryValue(row.nextActionType)
                                : "Manual next action needed"}
                            </p>
                            <p>Due: {formatDateTime(row.nextActionDueAt)}</p>
                            {row.overdueNextAction ? (
                              <p className="text-red-700 font-medium">Overdue</p>
                            ) : null}
                            {row.managerNotes ? <p>Notes: {row.managerNotes}</p> : null}
                          </div>
                          {row.activeBlockerTitles.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {row.activeBlockerTitles.slice(0, 2).map((title) => (
                                <span
                                  key={title}
                                  className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800"
                                >
                                  {title}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <RowActivity row={row} />
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="space-y-2">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${riskBadgeClasses(row.riskLevel)}`}>
                            {labelizeClientDeliveryValue(row.riskLevel)}
                          </span>
                          <div className="text-xs text-gray-500 space-y-1">
                            <p>{row.followUpsDueCount} follow-up{row.followUpsDueCount === 1 ? "" : "s"} due</p>
                            <p>{row.prepCount} prep item{row.prepCount === 1 ? "" : "s"}</p>
                            <p>{row.overdueBlockerCount} overdue blocker{row.overdueBlockerCount === 1 ? "" : "s"}</p>
                            <p>Paid: {compactMoney(row.amountPaid)} / {compactMoney(row.totalAmount)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="space-y-1 text-sm text-gray-700">
                          <p className="font-medium">
                            {ownerLabel(row.accountManagerId, accountManagerDirectory)}
                          </p>
                          {canViewAllCases ? (
                            <p className="text-xs text-gray-500">
                              {row.accountManagerId ? "Assigned case" : "Needs owner"}
                            </p>
                          ) : (
                            <p className="text-xs text-gray-500">My case</p>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="flex flex-col items-start gap-2">
                          <Link
                            href={`/dashboard/seekers/${row.jobSeekerId}`}
                            className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
                          >
                            Open seeker
                          </Link>
                          <Link
                            href={`/dashboard/seekers/${row.jobSeekerId}/timeline`}
                            className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            Timeline
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="xl:hidden divide-y divide-gray-100">
              {rows.map((row) => (
                <div key={row.jobSeekerId} className="px-5 py-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">{row.fullName}</p>
                      <p className="text-sm text-gray-500">{row.email || "No email set"}</p>
                    </div>
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${stageBadgeClasses(row.effectiveStage)}`}>
                      {labelizeClientDeliveryValue(row.effectiveStage)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${riskBadgeClasses(row.riskLevel)}`}>
                      {labelizeClientDeliveryValue(row.riskLevel)}
                    </span>
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${healthBadgeClasses(row.healthBand)}`}>
                      {labelizeClientDeliveryValue(row.healthBand)}
                    </span>
                    {row.staleStatus !== "none" ? (
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${staleBadgeClasses(row.staleStatus)}`}>
                        {labelizeClientDeliveryValue(row.staleStatus)}
                      </span>
                    ) : null}
                    {row.needsAttention ? (
                      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        Needs attention
                      </span>
                    ) : null}
                    {row.hasActiveEscalationRecord ? (
                      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-800">
                        {labelizeClientDeliveryValue(row.escalationStatus)}
                      </span>
                    ) : null}
                    {row.activeBlockerCount > 0 ? (
                      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                        {row.activeBlockerCount} blocker{row.activeBlockerCount === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 gap-3 text-sm">
                    <div className="rounded-lg border border-gray-200 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Next action
                      </p>
                      <p className="mt-1 font-medium text-gray-900">
                        {row.nextActionTitle || "No next action set"}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Due: {formatDateTime(row.nextActionDueAt)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-gray-200 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Activity
                      </p>
                      <RowActivity row={row} />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/dashboard/seekers/${row.jobSeekerId}`}
                      className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
                    >
                      Open seeker
                    </Link>
                    <Link
                      href={`/dashboard/seekers/${row.jobSeekerId}/timeline`}
                      className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Timeline
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
