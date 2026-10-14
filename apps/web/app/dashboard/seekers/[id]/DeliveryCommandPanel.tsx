"use client";

import Link from "next/link";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useEffect, useMemo, useState } from "react";
import {
  CLIENT_DELIVERY_ACTION_TYPES,
  CLIENT_DELIVERY_BLOCKER_TYPES,
  CLIENT_DELIVERY_ESCALATION_REASONS,
  CLIENT_DELIVERY_RISK_LEVELS,
  CLIENT_DELIVERY_STAGES,
  labelizeClientDeliveryValue,
  type ClientDeliveryActionType,
  type ClientDeliveryBlockerRecord,
  type ClientDeliveryBlockerType,
  type ClientDeliveryCaseBundle,
  type ClientDeliveryEscalationReason,
  type ClientDeliveryHealthBand,
  type ClientDeliveryRiskLevel,
  type ClientDeliveryStage,
  type ClientDeliveryStaleStatus,
} from "@/lib/client-delivery";

type CaseFormState = {
  riskLevel: ClientDeliveryRiskLevel;
  paused: boolean;
  stageOverride: ClientDeliveryStage | "";
  nextActionType: ClientDeliveryActionType | "";
  nextActionTitle: string;
  nextActionNotes: string;
  nextActionDueAt: string;
  managerNotes: string;
};

type BlockerFormState = {
  blockerType: ClientDeliveryBlockerType;
  title: string;
  description: string;
  dueAt: string;
};

type EscalationFormState = {
  reason: ClientDeliveryEscalationReason;
  details: string;
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

function blockerBadgeClasses(blocker: ClientDeliveryBlockerRecord) {
  if (blocker.status === "resolved") {
    return "bg-green-100 text-green-800";
  }
  if (blocker.escalated || blocker.status === "escalated") {
    return "bg-red-100 text-red-800";
  }
  return "bg-amber-100 text-amber-800";
}

function formatDateTime(value: string | null) {
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatDateTimeInput(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const offset = parsed.getTimezoneOffset();
  const local = new Date(parsed.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function summarizeLastTouch(days: number | null | undefined) {
  if (days === null || days === undefined) return "No activity yet";
  if (days <= 0) return "Touched today";
  if (days === 1) return "Touched 1 day ago";
  return `Touched ${days} days ago`;
}

function buildCaseForm(bundle: ClientDeliveryCaseBundle): CaseFormState {
  const snapshot = bundle.snapshot;
  const caseRecord = bundle.caseRecord;

  return {
    riskLevel:
      snapshot?.riskLevel ?? caseRecord?.riskLevel ?? CLIENT_DELIVERY_RISK_LEVELS[0],
    paused: snapshot?.paused ?? caseRecord?.paused ?? false,
    stageOverride: caseRecord?.stageOverride ?? snapshot?.stageOverride ?? "",
    nextActionType:
      caseRecord?.nextActionType ?? snapshot?.nextActionType ?? "",
    nextActionTitle:
      caseRecord?.nextActionTitle || snapshot?.nextActionTitle || "",
    nextActionNotes:
      caseRecord?.nextActionNotes || snapshot?.nextActionNotes || "",
    nextActionDueAt: formatDateTimeInput(
      caseRecord?.nextActionDueAt ?? snapshot?.nextActionDueAt ?? null
    ),
    managerNotes:
      caseRecord?.managerNotes || snapshot?.managerNotes || "",
  };
}

function emptyBlockerForm(): BlockerFormState {
  return {
    blockerType: CLIENT_DELIVERY_BLOCKER_TYPES[0],
    title: "",
    description: "",
    dueAt: "",
  };
}

function emptyEscalationForm(): EscalationFormState {
  return {
    reason: CLIENT_DELIVERY_ESCALATION_REASONS[0],
    details: "",
  };
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-900">
        {title}
      </h3>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "text-gray-900",
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className={`mt-2 text-lg font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </span>
  );
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, className = "", ...rest } = props;
  return (
    <label className="block space-y-2">
      <FieldLabel>{label}</FieldLabel>
      <input
        {...rest}
        className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 ${className}`}
      />
    </label>
  );
}

function TextArea(
  props: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }
) {
  const { label, className = "", ...rest } = props;
  return (
    <label className="block space-y-2">
      <FieldLabel>{label}</FieldLabel>
      <textarea
        {...rest}
        className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 ${className}`}
      />
    </label>
  );
}

function SelectField(
  props: SelectHTMLAttributes<HTMLSelectElement> & { label: string }
) {
  const { label, className = "", children, ...rest } = props;
  return (
    <label className="block space-y-2">
      <FieldLabel>{label}</FieldLabel>
      <select
        {...rest}
        className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 ${className}`}
      >
        {children}
      </select>
    </label>
  );
}

export default function DeliveryCommandPanel({
  seekerId,
  seekerName,
  deliveryBundle,
  canReviewCases = false,
}: {
  seekerId: string;
  seekerName: string;
  deliveryBundle: ClientDeliveryCaseBundle | null;
  canReviewCases?: boolean;
}) {
  const [bundleState, setBundleState] = useState<ClientDeliveryCaseBundle>(
    deliveryBundle ?? { snapshot: null, caseRecord: null, blockers: [], escalations: [] }
  );
  const [caseForm, setCaseForm] = useState<CaseFormState>(
    buildCaseForm(
      deliveryBundle ?? {
        snapshot: null,
        caseRecord: null,
        blockers: [],
        escalations: [],
      }
    )
  );
  const [blockerForm, setBlockerForm] = useState<BlockerFormState>(emptyBlockerForm);
  const [escalationForm, setEscalationForm] = useState<EscalationFormState>(
    emptyEscalationForm
  );
  const [caseSaving, setCaseSaving] = useState(false);
  const [blockerSaving, setBlockerSaving] = useState(false);
  const [escalationSaving, setEscalationSaving] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [busyBlockerId, setBusyBlockerId] = useState<string | null>(null);

  useEffect(() => {
    const nextBundle = deliveryBundle ?? {
      snapshot: null,
      caseRecord: null,
      blockers: [],
      escalations: [],
    };
    setBundleState(nextBundle);
    setCaseForm(buildCaseForm(nextBundle));
  }, [deliveryBundle]);

  const snapshot = bundleState.snapshot;
  const activeBlockers = useMemo(
    () =>
      bundleState.blockers.filter(
        (blocker) => blocker.status !== "resolved"
      ),
    [bundleState.blockers]
  );

  async function syncFromResponse(response: Response) {
    const data = await readJson(response);
    if (!response.ok) {
      throw new Error(
        typeof data?.error === "string"
          ? data.error
          : "Request failed."
      );
    }

    const nextBundle = (data?.bundle ?? null) as ClientDeliveryCaseBundle | null;
    if (nextBundle) {
      setBundleState(nextBundle);
      setCaseForm(buildCaseForm(nextBundle));
    }
    return nextBundle;
  }

  async function saveCase(
    overrides: Partial<{
      complete_next_action: boolean;
    }> = {}
  ) {
    setCaseSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/am/delivery/${seekerId}/case`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          risk_level: caseForm.riskLevel,
          paused: caseForm.paused,
          stage_override: caseForm.stageOverride || null,
          next_action_type: caseForm.nextActionType || null,
          next_action_title: caseForm.nextActionTitle,
          next_action_notes: caseForm.nextActionNotes,
          next_action_due_at: caseForm.nextActionDueAt || null,
          manager_notes: caseForm.managerNotes,
          ...overrides,
        }),
      });

      await syncFromResponse(response);
      setMessage({
        type: "success",
        text: overrides.complete_next_action
          ? "Next action marked complete."
          : "Delivery case saved.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save case.",
      });
    } finally {
      setCaseSaving(false);
    }
  }

  async function createBlocker() {
    setBlockerSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/am/delivery/${seekerId}/blockers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blocker_type: blockerForm.blockerType,
          title: blockerForm.title,
          description: blockerForm.description,
          due_at: blockerForm.dueAt || null,
        }),
      });

      await syncFromResponse(response);
      setBlockerForm(emptyBlockerForm());
      setMessage({
        type: "success",
        text: "Blocker added.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error ? error.message : "Failed to add blocker.",
      });
    } finally {
      setBlockerSaving(false);
    }
  }

  async function updateBlocker(
    blockerId: string,
    body: Record<string, unknown>,
    successText: string
  ) {
    setBusyBlockerId(blockerId);
    setMessage(null);
    try {
      const response = await fetch(`/api/am/delivery/blockers/${blockerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      await syncFromResponse(response);
      setMessage({
        type: "success",
        text: successText,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to update blocker.",
      });
    } finally {
      setBusyBlockerId(null);
    }
  }

  async function createEscalation() {
    setEscalationSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/am/delivery/${seekerId}/escalate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: escalationForm.reason,
          details: escalationForm.details,
        }),
      });

      await syncFromResponse(response);
      setEscalationForm(emptyEscalationForm());
      setMessage({
        type: "success",
        text: "Delivery case escalated for manager review.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to escalate delivery case.",
      });
    } finally {
      setEscalationSaving(false);
    }
  }

  async function markReviewed() {
    setReviewSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/am/delivery/${seekerId}/review`, {
        method: "POST",
      });

      await syncFromResponse(response);
      setMessage({
        type: "success",
        text: "Delivery case marked reviewed.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to mark delivery case reviewed.",
      });
    } finally {
      setReviewSaving(false);
    }
  }

  const effectiveStage =
    snapshot?.effectiveStage ?? (caseForm.paused ? "paused" : null);

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 p-6 space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-600">
            Delivery Command
          </p>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {seekerName}: command layer
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Set the next action, mark risk, pause work when needed, and keep blockers visible.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {effectiveStage ? (
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${stageBadgeClasses(
                  effectiveStage
                )}`}
              >
                {labelizeClientDeliveryValue(effectiveStage)}
              </span>
            ) : (
              <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                Not yet on delivery board
              </span>
            )}
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${riskBadgeClasses(
                caseForm.riskLevel
              )}`}
            >
              {labelizeClientDeliveryValue(caseForm.riskLevel)} risk
            </span>
            {snapshot ? (
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${healthBadgeClasses(
                  snapshot.healthBand
                )}`}
              >
                {labelizeClientDeliveryValue(snapshot.healthBand)} health
              </span>
            ) : null}
            {snapshot && snapshot.staleStatus !== "none" ? (
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${staleBadgeClasses(
                  snapshot.staleStatus
                )}`}
              >
                {labelizeClientDeliveryValue(snapshot.staleStatus)}
              </span>
            ) : null}
            {caseForm.paused ? (
              <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-800">
                Paused
              </span>
            ) : null}
            {snapshot?.hasActiveEscalationRecord ? (
              <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800">
                {labelizeClientDeliveryValue(snapshot.escalationStatus)}
              </span>
            ) : null}
            {snapshot?.needsManagerReview ? (
              <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-800">
                Manager review needed
              </span>
            ) : null}
            {activeBlockers.length > 0 ? (
              <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                {activeBlockers.length} open blocker{activeBlockers.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/delivery"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Open delivery board
          </Link>
          <Link
            href={`/dashboard/seekers/${seekerId}/timeline`}
            className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700"
          >
            Open timeline
          </Link>
        </div>
      </div>

      {!snapshot ? (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
          This seeker is not yet in the command-center snapshot. Saving this panel will create a tracked delivery case and make the seeker visible on the delivery board.
        </div>
      ) : null}

      {message ? (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="System stage"
          value={snapshot ? labelizeClientDeliveryValue(snapshot.systemStage) : "Pending"}
        />
        <StatCard
          label="Health"
          value={snapshot ? `${snapshot.healthScore} / 100` : "Pending"}
          tone={
            snapshot?.healthBand === "critical"
              ? "text-red-700"
              : snapshot?.healthBand === "at_risk"
                ? "text-amber-700"
                : snapshot?.healthBand === "watch"
                  ? "text-violet-700"
                  : "text-emerald-700"
          }
        />
        <StatCard
          label="Last touch"
          value={snapshot ? summarizeLastTouch(snapshot.daysSinceLastTouch) : "No activity yet"}
          tone={snapshot?.needsAttention ? "text-red-700" : "text-gray-900"}
        />
        <StatCard
          label="Applications (7d)"
          value={snapshot?.applications7d ?? 0}
          tone="text-violet-700"
        />
        <StatCard
          label="Stale state"
          value={
            snapshot
              ? labelizeClientDeliveryValue(snapshot.staleStatus)
              : "Pending"
          }
          tone={
            snapshot?.staleStatus === "severely_stale" || snapshot?.staleStatus === "stale"
              ? "text-red-700"
              : snapshot?.staleStatus === "approaching_stale"
                ? "text-amber-700"
                : "text-emerald-700"
          }
        />
        <StatCard
          label="Review queue"
          value={snapshot?.needsManagerReview ? "Needs review" : "Stable"}
          tone={snapshot?.needsManagerReview ? "text-red-700" : "text-gray-900"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 p-5 space-y-4">
            <SectionTitle
              title="Case control"
              description="This is the AM overlay on top of the system-derived delivery state."
            />

            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label="Risk level"
                value={caseForm.riskLevel}
                onChange={(event) =>
                  setCaseForm((current) => ({
                    ...current,
                    riskLevel: event.target.value as ClientDeliveryRiskLevel,
                  }))
                }
              >
                {CLIENT_DELIVERY_RISK_LEVELS.map((risk) => (
                  <option key={risk} value={risk}>
                    {labelizeClientDeliveryValue(risk)}
                  </option>
                ))}
              </SelectField>

              <SelectField
                label="Stage override"
                value={caseForm.stageOverride}
                onChange={(event) =>
                  setCaseForm((current) => ({
                    ...current,
                    stageOverride: event.target.value as ClientDeliveryStage | "",
                  }))
                }
              >
                <option value="">Use system stage</option>
                {CLIENT_DELIVERY_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {labelizeClientDeliveryValue(stage)}
                  </option>
                ))}
              </SelectField>
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <input
                type="checkbox"
                checked={caseForm.paused}
                onChange={(event) =>
                  setCaseForm((current) => ({
                    ...current,
                    paused: event.target.checked,
                  }))
                }
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">
                  Pause delivery
                </span>
                <span className="mt-1 block text-sm text-gray-500">
                  Use this when work should stop temporarily because the seeker or business process is not ready.
                </span>
              </span>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label="Next action type"
                value={caseForm.nextActionType}
                onChange={(event) =>
                  setCaseForm((current) => ({
                    ...current,
                    nextActionType: event.target.value as ClientDeliveryActionType | "",
                  }))
                }
              >
                <option value="">No manual type</option>
                {CLIENT_DELIVERY_ACTION_TYPES.map((actionType) => (
                  <option key={actionType} value={actionType}>
                    {labelizeClientDeliveryValue(actionType)}
                  </option>
                ))}
              </SelectField>

              <TextInput
                label="Next action due"
                type="datetime-local"
                value={caseForm.nextActionDueAt}
                onChange={(event) =>
                  setCaseForm((current) => ({
                    ...current,
                    nextActionDueAt: event.target.value,
                  }))
                }
              />
            </div>

            <TextInput
              label="Next action title"
              value={caseForm.nextActionTitle}
              onChange={(event) =>
                setCaseForm((current) => ({
                  ...current,
                  nextActionTitle: event.target.value,
                }))
              }
              placeholder="Example: push 10 targeted applications and send 3 recruiter follow-ups"
            />

            <TextArea
              label="Next action notes"
              value={caseForm.nextActionNotes}
              onChange={(event) =>
                setCaseForm((current) => ({
                  ...current,
                  nextActionNotes: event.target.value,
                }))
              }
              rows={3}
              placeholder="Extra context for the AM team or manager."
            />

            <TextArea
              label="Manager notes"
              value={caseForm.managerNotes}
              onChange={(event) =>
                setCaseForm((current) => ({
                  ...current,
                  managerNotes: event.target.value,
                }))
              }
              rows={4}
              placeholder="Escalation context, quality concerns, or delivery instructions."
            />

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => saveCase()}
                disabled={caseSaving}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {caseSaving ? "Saving..." : "Save delivery case"}
              </button>
              <button
                type="button"
                onClick={() => saveCase({ complete_next_action: true })}
                disabled={
                  caseSaving ||
                  (!caseForm.nextActionTitle.trim() && !(snapshot?.nextActionTitle ?? "").trim())
                }
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Complete current action
              </button>
              {snapshot?.nextActionCompletedAt ? (
                <p className="text-xs text-gray-500">
                  Last completed: {formatDateTime(snapshot.nextActionCompletedAt)}
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 p-5 space-y-4">
            <SectionTitle
              title="Escalation control"
              description="Escalate only when ordinary AM execution is not enough and the case needs manager intervention."
            />

            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label="Escalation reason"
                value={escalationForm.reason}
                onChange={(event) =>
                  setEscalationForm((current) => ({
                    ...current,
                    reason: event.target.value as ClientDeliveryEscalationReason,
                  }))
                }
              >
                {CLIENT_DELIVERY_ESCALATION_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {labelizeClientDeliveryValue(reason)}
                  </option>
                ))}
              </SelectField>

              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Current escalation state
                </p>
                <p className="mt-2 text-sm font-medium text-gray-900">
                  {snapshot
                    ? labelizeClientDeliveryValue(snapshot.escalationStatus)
                    : "None"}
                </p>
                {snapshot?.latestEscalationReason ? (
                  <p className="mt-1 text-xs text-gray-500">
                    Latest reason:{" "}
                    {labelizeClientDeliveryValue(snapshot.latestEscalationReason)}
                  </p>
                ) : null}
              </div>
            </div>

            <TextArea
              label="Escalation details"
              value={escalationForm.details}
              onChange={(event) =>
                setEscalationForm((current) => ({
                  ...current,
                  details: event.target.value,
                }))
              }
              rows={3}
              placeholder="Explain what is stalled, what has already been tried, and what manager help is needed."
            />

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={createEscalation}
                disabled={escalationSaving}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {escalationSaving ? "Escalating..." : "Escalate case"}
              </button>
              {canReviewCases ? (
                <button
                  type="button"
                  onClick={markReviewed}
                  disabled={reviewSaving}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {reviewSaving ? "Reviewing..." : "Mark reviewed"}
                </button>
              ) : null}
              {snapshot?.managerReviewedAt ? (
                <p className="text-xs text-gray-500">
                  Last manager review: {formatDateTime(snapshot.managerReviewedAt)}
                </p>
              ) : null}
            </div>

            {bundleState.escalations.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500">
                No escalation history yet.
              </div>
            ) : (
              <div className="space-y-3">
                {bundleState.escalations.map((escalation) => (
                  <div
                    key={escalation.id}
                    className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800">
                        {labelizeClientDeliveryValue(escalation.status)}
                      </span>
                      <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-600 border border-gray-200">
                        {labelizeClientDeliveryValue(escalation.reason)}
                      </span>
                    </div>
                    {escalation.details ? (
                      <p className="mt-2 text-sm text-gray-700">{escalation.details}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-500">
                      <span>Opened: {formatDateTime(escalation.openedAt)}</span>
                      {escalation.reviewedAt ? (
                        <span>Reviewed: {formatDateTime(escalation.reviewedAt)}</span>
                      ) : null}
                      {escalation.resolvedAt ? (
                        <span>Resolved: {formatDateTime(escalation.resolvedAt)}</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 p-5 space-y-4">
            <SectionTitle
              title="Blockers"
              description="Keep delivery blockers explicit so managers can see what is slowing the seeker down."
            />

            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label="Blocker type"
                value={blockerForm.blockerType}
                onChange={(event) =>
                  setBlockerForm((current) => ({
                    ...current,
                    blockerType: event.target.value as ClientDeliveryBlockerType,
                  }))
                }
              >
                {CLIENT_DELIVERY_BLOCKER_TYPES.map((blockerType) => (
                  <option key={blockerType} value={blockerType}>
                    {labelizeClientDeliveryValue(blockerType)}
                  </option>
                ))}
              </SelectField>

              <TextInput
                label="Due date"
                type="datetime-local"
                value={blockerForm.dueAt}
                onChange={(event) =>
                  setBlockerForm((current) => ({
                    ...current,
                    dueAt: event.target.value,
                  }))
                }
              />
            </div>

            <TextInput
              label="Blocker title"
              value={blockerForm.title}
              onChange={(event) =>
                setBlockerForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder="Example: seeker has not uploaded final resume"
            />

            <TextArea
              label="Blocker description"
              value={blockerForm.description}
              onChange={(event) =>
                setBlockerForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              rows={3}
              placeholder="What is blocked, who owns it, and what would unblock it."
            />

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={createBlocker}
                disabled={blockerSaving || !blockerForm.title.trim()}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {blockerSaving ? "Adding..." : "Add blocker"}
              </button>
              <p className="text-xs text-gray-500">
                Blockers drive attention state on the delivery board automatically.
              </p>
            </div>

            {bundleState.blockers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500">
                No blockers logged yet.
              </div>
            ) : (
              <div className="space-y-3">
                {bundleState.blockers.map((blocker) => (
                  <div
                    key={blocker.id}
                    className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4"
                  >
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${blockerBadgeClasses(
                              blocker
                            )}`}
                          >
                            {blocker.status === "resolved"
                              ? "Resolved"
                              : blocker.escalated
                              ? "Escalated"
                              : "Active"}
                          </span>
                          <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-600 border border-gray-200">
                            {labelizeClientDeliveryValue(blocker.blockerType)}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {blocker.title}
                          </p>
                          {blocker.description ? (
                            <p className="mt-1 text-sm text-gray-600">
                              {blocker.description}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                          <span>Due: {formatDateTime(blocker.dueAt)}</span>
                          <span>Updated: {formatDateTime(blocker.updatedAt)}</span>
                          {blocker.resolvedAt ? (
                            <span>Resolved: {formatDateTime(blocker.resolvedAt)}</span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {blocker.status !== "resolved" ? (
                          <button
                            type="button"
                            onClick={() =>
                              updateBlocker(
                                blocker.id,
                                { status: "resolved" },
                                "Blocker resolved."
                              )
                            }
                            disabled={busyBlockerId === blocker.id}
                            className="rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Resolve
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              updateBlocker(
                                blocker.id,
                                { status: "active" },
                                "Blocker reopened."
                              )
                            }
                            disabled={busyBlockerId === blocker.id}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Reopen
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            updateBlocker(
                              blocker.id,
                              { escalated: !blocker.escalated },
                              blocker.escalated
                                ? "Blocker de-escalated."
                                : "Blocker escalated."
                            )
                          }
                          disabled={busyBlockerId === blocker.id}
                          className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {blocker.escalated ? "De-escalate" : "Escalate"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 p-5 space-y-4">
            <SectionTitle
              title="Current snapshot"
              description="System-derived state from delivery activity, billing, outreach, interviews, and offers."
            />

            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500">Effective stage</span>
                <span className="font-medium text-gray-900">
                  {snapshot
                    ? labelizeClientDeliveryValue(snapshot.effectiveStage)
                    : "Pending"}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500">System stage</span>
                <span className="font-medium text-gray-900">
                  {snapshot
                    ? labelizeClientDeliveryValue(snapshot.systemStage)
                    : "Pending"}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500">Payment hold</span>
                <span className="font-medium text-gray-900">
                  {snapshot?.hasPaymentHold ? "Yes" : "No"}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500">Health score</span>
                <span className="font-medium text-gray-900">
                  {snapshot ? `${snapshot.healthScore} / 100` : "Pending"}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500">Health band</span>
                <span className="font-medium text-gray-900">
                  {snapshot
                    ? labelizeClientDeliveryValue(snapshot.healthBand)
                    : "Pending"}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500">Stale state</span>
                <span className="font-medium text-gray-900">
                  {snapshot
                    ? labelizeClientDeliveryValue(snapshot.staleStatus)
                    : "Pending"}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500">Escalation state</span>
                <span className="font-medium text-right text-gray-900">
                  {snapshot
                    ? labelizeClientDeliveryValue(snapshot.escalationStatus)
                    : "None"}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500">Needs attention</span>
                <span className="font-medium text-gray-900">
                  {snapshot?.needsAttention ? "Yes" : "No"}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500">Next interview</span>
                <span className="font-medium text-right text-gray-900">
                  {formatDateTime(snapshot?.nextInterviewAt ?? null)}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500">Next follow-up</span>
                <span className="font-medium text-right text-gray-900">
                  {formatDateTime(snapshot?.nextFollowUpAt ?? null)}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500">Next action due</span>
                <span className="font-medium text-right text-gray-900">
                  {formatDateTime(snapshot?.nextActionDueAt ?? null)}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500">Current next action</span>
                <span className="font-medium text-right text-gray-900">
                  {snapshot?.nextActionTitle || "Not set"}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500">Manager review</span>
                <span className="font-medium text-right text-gray-900">
                  {snapshot?.needsManagerReview ? "Required" : "Not required"}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 p-5 space-y-4">
            <SectionTitle
              title="Activity signals"
              description="Use these signals to decide whether the next action and risk are realistic."
            />

            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500">Applications (30d)</span>
                <span className="font-medium text-gray-900">
                  {snapshot?.applications30d ?? 0}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500">Open application runs</span>
                <span className="font-medium text-gray-900">
                  {snapshot?.openApplicationRuns ?? 0}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500">Open queue items</span>
                <span className="font-medium text-gray-900">
                  {snapshot?.openQueueCount ?? 0}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500">Active outreach threads</span>
                <span className="font-medium text-gray-900">
                  {snapshot?.activeThreadCount ?? 0}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500">Prep items</span>
                <span className="font-medium text-gray-900">
                  {snapshot?.prepCount ?? 0}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500">Last application</span>
                <span className="font-medium text-right text-gray-900">
                  {formatDateTime(snapshot?.lastApplicationAt ?? null)}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500">Days since application</span>
                <span className="font-medium text-right text-gray-900">
                  {snapshot?.daysSinceLastApplication ?? "n/a"}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500">Last outreach</span>
                <span className="font-medium text-right text-gray-900">
                  {formatDateTime(snapshot?.lastOutreachAt ?? null)}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500">Overdue blockers</span>
                <span className="font-medium text-gray-900">
                  {snapshot?.overdueBlockerCount ?? 0}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500">Critical overdue blockers</span>
                <span className="font-medium text-gray-900">
                  {snapshot?.criticalOverdueBlockerCount ?? 0}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500">Offer flow</span>
                <span className="font-medium text-gray-900">
                  {snapshot?.hasOpenOffer
                    ? "Open offer"
                    : snapshot?.hasPlacedOffer
                    ? "Placed"
                    : "None"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
