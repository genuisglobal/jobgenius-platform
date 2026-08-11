"use client";

import { useState } from "react";
import type { BroadcastRecord } from "./page";

type RecipientCounts = {
  job_seekers: number;
  account_managers: number;
  all_users: number;
};

type TargetAudience = "all_job_seekers" | "all_account_managers" | "all_users";

const AUDIENCE_LABELS: Record<TargetAudience, string> = {
  all_job_seekers: "All Job Seekers",
  all_account_managers: "All Account Managers",
  all_users: "Everyone (Seekers + AMs)",
};

function audienceColor(audience: string) {
  if (audience === "all_job_seekers") return "bg-violet-100 text-violet-700";
  if (audience === "all_account_managers") return "bg-purple-100 text-purple-700";
  return "bg-green-100 text-green-700";
}

function statusColor(status: string) {
  if (status === "sent") return "bg-green-100 text-green-700";
  if (status === "sending") return "bg-yellow-100 text-yellow-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-600";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BroadcastClient({
  initialBroadcasts,
  recipientCounts,
}: {
  initialBroadcasts: BroadcastRecord[];
  recipientCounts: RecipientCounts;
}) {
  // ── Compose state ──────────────────────────────────────────────────────────
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<TargetAudience>("all_job_seekers");
  const [sendEmail, setSendEmail] = useState(true);
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [broadcasts, setBroadcasts] = useState<BroadcastRecord[]>(initialBroadcasts);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  const targetCount =
    audience === "all_job_seekers"
      ? recipientCounts.job_seekers
      : audience === "all_account_managers"
      ? recipientCounts.account_managers
      : recipientCounts.all_users;

  async function handleSend() {
    if (!subject.trim() || !body.trim()) return;
    setError(null);
    setSending(true);
    setConfirmOpen(false);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          body: body.trim(),
          target_audience: audience,
          send_email: sendEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to send broadcast.");
        return;
      }
      // Refresh broadcasts list
      const listRes = await fetch("/api/admin/broadcast");
      if (listRes.ok) {
        const listData = await listRes.json();
        setBroadcasts(listData.broadcasts ?? []);
      }
      // Clear compose form
      setSubject("");
      setBody("");
      setAudience("all_job_seekers");
      setSendEmail(true);
      setPreview(false);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Broadcast Messaging</h1>
        <p className="text-gray-500 text-sm mt-1">
          Send a message to all job seekers, all account managers, or everyone on the platform.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* ── Compose panel ─────────────────────────────────────────────── */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-gray-200 p-6 space-y-5 self-start">
          <h2 className="text-lg font-semibold text-gray-900">Compose Message</h2>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Audience */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Target Audience
            </label>
            <div className="space-y-2">
              {(["all_job_seekers", "all_account_managers", "all_users"] as TargetAudience[]).map(
                (a) => (
                  <label
                    key={a}
                    className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                      audience === a
                        ? "border-violet-500 bg-violet-50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="audience"
                        value={a}
                        checked={audience === a}
                        onChange={() => setAudience(a)}
                        className="accent-violet-600"
                      />
                      <span className="text-sm font-medium text-gray-900">
                        {AUDIENCE_LABELS[a]}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-gray-500">
                      {a === "all_job_seekers"
                        ? recipientCounts.job_seekers
                        : a === "all_account_managers"
                        ? recipientCounts.account_managers
                        : recipientCounts.all_users}{" "}
                      recipients
                    </span>
                  </label>
                )
              )}
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Platform update: New features available"
              maxLength={200}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{subject.length}/200</p>
          </div>

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-700">Message</label>
              <button
                type="button"
                onClick={() => setPreview((p) => !p)}
                className="text-xs text-violet-600 hover:text-violet-700"
              >
                {preview ? "Edit" : "Preview"}
              </button>
            </div>
            {preview ? (
              <div className="min-h-[140px] border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 bg-gray-50 whitespace-pre-wrap">
                {body || <span className="text-gray-400">Nothing to preview yet…</span>}
              </div>
            ) : (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your message here…"
                rows={7}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-y"
              />
            )}
          </div>

          {/* Email toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              type="button"
              onClick={() => setSendEmail((v) => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                sendEmail ? "bg-violet-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  sendEmail ? "translate-x-4.5" : "translate-x-0.5"
                }`}
              />
            </button>
            <span className="text-sm text-gray-700">
              Also send by email{" "}
              <span className="text-gray-400">(in addition to in-app display)</span>
            </span>
          </label>

          {/* Send button */}
          <button
            type="button"
            disabled={!subject.trim() || !body.trim() || sending}
            onClick={() => setConfirmOpen(true)}
            className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {sending ? "Sending…" : `Send to ${targetCount.toLocaleString()} recipients`}
          </button>
        </div>

        {/* ── History panel ─────────────────────────────────────────────── */}
        <div className="xl:col-span-3 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Broadcast History</h2>

          {broadcasts.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
              No broadcasts sent yet.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {broadcasts.map((b) => {
                const am = b.account_managers as { full_name: string | null } | null;
                const isExpanded = expandedId === b.id;
                return (
                  <div key={b.id} className="p-4">
                    <button
                      className="w-full text-left"
                      onClick={() => setExpandedId(isExpanded ? null : b.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusColor(b.status)}`}
                            >
                              {b.status}
                            </span>
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${audienceColor(b.target_audience)}`}
                            >
                              {AUDIENCE_LABELS[b.target_audience as TargetAudience] ?? b.target_audience}
                            </span>
                            {b.send_email && (
                              <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
                                + email
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm font-semibold text-gray-900 truncate">
                            {b.subject}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Sent by {am?.full_name ?? "Unknown"} ·{" "}
                            {formatDate(b.sent_at ?? b.created_at)} ·{" "}
                            {b.recipient_count.toLocaleString()} recipient
                            {b.recipient_count !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <svg
                          className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-1 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{b.body}</p>
                        {b.error_detail && (
                          <div className="mt-2 bg-red-50 border border-red-100 rounded p-2 text-xs text-red-600">
                            Error: {b.error_detail}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Confirm dialog ───────────────────────────────────────────────────── */}
      {confirmOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Confirm Broadcast</h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Recipients</span>
                <span className="font-semibold text-gray-900">
                  {AUDIENCE_LABELS[audience]} ({targetCount.toLocaleString()})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Subject</span>
                <span className="font-semibold text-gray-900 truncate ml-4 max-w-[60%] text-right">
                  {subject}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Email</span>
                <span className={sendEmail ? "text-green-600 font-medium" : "text-gray-400"}>
                  {sendEmail ? "Yes, send emails" : "In-app only"}
                </span>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              This will immediately deliver the message to{" "}
              <strong>{targetCount.toLocaleString()}</strong> user
              {targetCount !== 1 ? "s" : ""}.{" "}
              <span className="text-red-600 font-medium">This cannot be undone.</span>
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Send Broadcast
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
