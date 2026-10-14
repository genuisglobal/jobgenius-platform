"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  ClientDeliveryActionType,
  ClientDeliveryBlockerType,
} from "@/lib/client-delivery";

export interface TimelineRow {
  kind: string;
  at: string;
  title: string;
  body: string | null;
  link: string | null;
  meta: Record<string, unknown> | null;
}

interface NextAction {
  title: string;
  why: string;
  priority: "high" | "medium" | "low";
  suggested_link: string | null;
}

interface NextActionResult {
  summary: string;
  actions: NextAction[];
  aiOutputId: string | null;
}

const KIND_STYLES: Record<string, string> = {
  application_run: "bg-violet-100 text-violet-700",
  outreach_reply: "bg-emerald-100 text-emerald-700",
  outreach_send: "bg-gray-100 text-gray-700",
  interview: "bg-purple-100 text-purple-700",
  job_offer: "bg-pink-100 text-pink-700",
  payment: "bg-amber-100 text-amber-700",
  contract_signed: "bg-indigo-100 text-indigo-700",
  ai_output: "bg-cyan-100 text-cyan-700",
  feedback: "bg-rose-100 text-rose-700",
};

const PRIORITY_STYLES: Record<NextAction["priority"], string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-gray-100 text-gray-600",
};

const KINDS = [
  "application_run",
  "outreach_reply",
  "outreach_send",
  "interview",
  "job_offer",
  "payment",
  "contract_signed",
  "ai_output",
  "feedback",
];

function fmtDateTime(iso: string): string {
  const dateValue = new Date(iso);
  if (Number.isNaN(dateValue.getTime())) return iso;
  return dateValue.toLocaleString();
}

function inferActionType(action: NextAction): ClientDeliveryActionType {
  const text = `${action.title} ${action.why}`.toLowerCase();

  if (text.includes("interview") || text.includes("prep")) {
    return "interview_prep";
  }
  if (text.includes("offer") || text.includes("background")) {
    return "offer_support";
  }
  if (text.includes("billing") || text.includes("payment")) {
    return "billing_follow_up";
  }
  if (
    text.includes("document") ||
    text.includes("resume") ||
    text.includes("upload")
  ) {
    return "document_request";
  }
  if (
    text.includes("recruiter") ||
    text.includes("follow up") ||
    text.includes("follow-up") ||
    text.includes("reply") ||
    text.includes("outreach")
  ) {
    return "outreach_follow_up";
  }
  if (text.includes("manager") || text.includes("escalat")) {
    return "manager_escalation";
  }
  if (
    text.includes("client") ||
    text.includes("check in") ||
    text.includes("check-in")
  ) {
    return "client_check_in";
  }

  return text.includes("application") || text.includes("apply")
    ? "application_push"
    : "client_check_in";
}

function inferBlockerType(action: NextAction): ClientDeliveryBlockerType {
  const text = `${action.title} ${action.why}`.toLowerCase();

  if (text.includes("billing") || text.includes("payment")) {
    return "billing_hold";
  }
  if (text.includes("interview")) {
    return "interview_prep_gap";
  }
  if (text.includes("document")) {
    return "document_gap";
  }
  if (text.includes("resume")) {
    return "resume_gap";
  }
  if (text.includes("availability") || text.includes("schedule")) {
    return "availability_conflict";
  }
  if (text.includes("recruiter") || text.includes("reply")) {
    return "recruiter_reply_pending";
  }
  if (text.includes("background")) {
    return "background_check";
  }
  if (text.includes("offer")) {
    return "offer_decision";
  }
  if (text.includes("technical") || text.includes("system")) {
    return "technical_issue";
  }
  if (text.includes("seeker") || text.includes("client")) {
    return "seeker_unresponsive";
  }

  return "internal_ops";
}

function suggestedDueIso(priority: NextAction["priority"]): string {
  const hours =
    priority === "high" ? 24 : priority === "medium" ? 48 : 72;
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export default function TimelineClient({
  seekerId,
  initialRows,
}: {
  seekerId: string;
  initialRows: TimelineRow[];
}) {
  const [rows] = useState(initialRows);
  const [filter, setFilter] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<NextActionResult | null>(null);
  const [actionBusyKey, setActionBusyKey] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const visible =
    filter === "all" ? rows : rows.filter((row) => row.kind === filter);

  async function suggest() {
    setBusy(true);
    setError(null);
    setActionMessage(null);
    try {
      const response = await fetch(`/api/am/seekers/${seekerId}/next-action`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Suggestion failed.");
        return;
      }
      setSuggestion(data as NextActionResult);
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSuggestedNextAction(action: NextAction, index: number) {
    const key = `next-action-${index}`;
    setActionBusyKey(key);
    setActionMessage(null);
    try {
      const response = await fetch(`/api/am/delivery/${seekerId}/case`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          next_action_type: inferActionType(action),
          next_action_title: action.title,
          next_action_notes: action.why,
          next_action_due_at: suggestedDueIso(action.priority),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setActionMessage({
          type: "error",
          text: data.error || "Failed to save next action.",
        });
        return;
      }
      setActionMessage({
        type: "success",
        text: `"${action.title}" was saved to the delivery case.`,
      });
    } catch {
      setActionMessage({
        type: "error",
        text: "Network error while saving next action.",
      });
    } finally {
      setActionBusyKey(null);
    }
  }

  async function createBlockerFromSuggestion(
    action: NextAction,
    index: number
  ) {
    const key = `blocker-${index}`;
    setActionBusyKey(key);
    setActionMessage(null);
    try {
      const response = await fetch(`/api/am/delivery/${seekerId}/blockers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blocker_type: inferBlockerType(action),
          title: action.title,
          description: action.why,
          due_at: suggestedDueIso(action.priority),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setActionMessage({
          type: "error",
          text: data.error || "Failed to create blocker.",
        });
        return;
      }
      setActionMessage({
        type: "success",
        text: `"${action.title}" was added as a delivery blocker.`,
      });
    } catch {
      setActionMessage({
        type: "error",
        text: "Network error while creating blocker.",
      });
    } finally {
      setActionBusyKey(null);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${
              filter === "all"
                ? "bg-violet-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            All
          </button>
          {KINDS.filter((kind) => rows.some((row) => row.kind === kind)).map(
            (kind) => (
              <button
                key={kind}
                onClick={() => setFilter(kind)}
                className={`px-3 py-1 rounded-full text-[11px] font-medium ${
                  filter === kind
                    ? "bg-gray-900 text-white"
                    : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}
              >
                {kind.replace(/_/g, " ")}
              </button>
            )
          )}
        </div>
        <button
          onClick={suggest}
          disabled={busy}
          className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "Thinking..." : "Suggest next action"}
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {suggestion && (
        <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="flex items-start justify-between mb-2 gap-2">
            <h2 className="text-sm font-semibold text-emerald-900">
              Next best action
            </h2>
            <button
              onClick={() => setSuggestion(null)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Dismiss
            </button>
          </div>
          {suggestion.summary && (
            <p className="text-sm text-emerald-900 mb-3">
              {suggestion.summary}
            </p>
          )}
          {actionMessage && (
            <div
              className={`mb-3 rounded-lg px-3 py-2 text-sm ${
                actionMessage.type === "success"
                  ? "bg-green-50 border border-green-200 text-green-700"
                  : "bg-red-50 border border-red-200 text-red-700"
              }`}
            >
              {actionMessage.text}
            </div>
          )}
          <div className="space-y-2">
            {suggestion.actions.map((action, index) => (
              <div
                key={index}
                className="bg-white border border-emerald-100 rounded-lg p-3"
              >
                <div className="flex items-start gap-2 mb-1">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                      PRIORITY_STYLES[action.priority]
                    }`}
                  >
                    {action.priority}
                  </span>
                  <p className="text-sm font-medium text-gray-900 flex-1">
                    {action.title}
                  </p>
                  {action.suggested_link && (
                    <Link
                      href={action.suggested_link}
                      className="text-xs text-violet-600 hover:text-violet-700 whitespace-nowrap"
                    >
                      Open →
                    </Link>
                  )}
                </div>
                {action.why && (
                  <p className="text-xs text-gray-600 italic">{action.why}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => saveSuggestedNextAction(action, index)}
                    disabled={actionBusyKey !== null}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {actionBusyKey === `next-action-${index}`
                      ? "Saving..."
                      : "Save as next action"}
                  </button>
                  <button
                    type="button"
                    onClick={() => createBlockerFromSuggestion(action, index)}
                    disabled={actionBusyKey !== null}
                    className="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 text-xs font-medium hover:bg-amber-50 disabled:opacity-50"
                  >
                    {actionBusyKey === `blocker-${index}`
                      ? "Creating..."
                      : "Create blocker"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-500 mt-3">
            Generated suggestion — review and act. Logged to AI Outputs.
          </p>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center text-sm text-gray-400">
          No timeline events match this filter.
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((row, index) => (
            <div
              key={index}
              className="bg-white rounded-xl border border-gray-200 p-3"
            >
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                    KIND_STYLES[row.kind] ?? "bg-gray-100 text-gray-700"
                  }`}
                >
                  {row.kind.replace(/_/g, " ")}
                </span>
                <span className="text-[11px] text-gray-400">
                  {fmtDateTime(row.at)}
                </span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {row.title}
                  </p>
                  {row.body && (
                    <p className="text-xs text-gray-600 mt-0.5">{row.body}</p>
                  )}
                </div>
                {row.link && (
                  <Link
                    href={row.link}
                    className="text-xs text-violet-600 hover:text-violet-700 whitespace-nowrap"
                  >
                    Open →
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
