"use client";

import { useState, useEffect, useCallback } from "react";

type InboundEmail = {
  id: string;
  gmail_message_id: string;
  thread_id: string;
  from_email: string;
  from_name: string;
  subject: string;
  body_snippet: string;
  received_at: string;
  classification: string;
  classification_confidence: number;
  matched_application_id: string | null;
  matched_job_post_id: string | null;
};

const CLASSIFICATION_LABELS: Record<string, { label: string; color: string }> = {
  rejection: { label: "Rejection", color: "bg-red-100 text-red-800" },
  interview_invite: { label: "Interview Invite", color: "bg-green-100 text-green-800" },
  offer: { label: "Offer", color: "bg-emerald-100 text-emerald-800" },
  follow_up: { label: "Follow-up", color: "bg-violet-100 text-violet-800" },
  verification: { label: "Verification", color: "bg-yellow-100 text-yellow-800" },
  application_confirmation: { label: "Confirmation", color: "bg-indigo-100 text-indigo-800" },
  other: { label: "Other", color: "bg-gray-100 text-gray-700" },
};

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "interview_invite", label: "Interview Invites" },
  { value: "offer", label: "Offers" },
  { value: "rejection", label: "Rejections" },
  { value: "follow_up", label: "Follow-ups" },
  { value: "application_confirmation", label: "Confirmations" },
  { value: "verification", label: "Verification" },
  { value: "other", label: "Other" },
];

export default function InboxPage() {
  const [emails, setEmails] = useState<InboundEmail[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<InboundEmail | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyResult, setReplyResult] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ classification: filter });
      const res = await fetch(`/api/portal/inbox?${params}`);
      const data = await res.json();
      setEmails(data.emails ?? []);
      setCounts(data.counts ?? {});
      setTotal(data.total ?? 0);
    } catch {
      setEmails([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const handleReply = async () => {
    if (!selectedEmail || !replyBody.trim()) return;
    setReplying(true);
    setReplyResult(null);
    try {
      const res = await fetch("/api/portal/inbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_id: selectedEmail.id,
          body: replyBody,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReplyResult({ type: "success", text: "Reply sent successfully!" });
        setReplyBody("");
      } else {
        setReplyResult({
          type: "error",
          text: data.error || "Failed to send reply.",
        });
      }
    } catch {
      setReplyResult({ type: "error", text: "Failed to send reply." });
    } finally {
      setReplying(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Inbox</h2>
        <span className="text-sm text-gray-500">{total} emails scanned</span>
      </div>

      {/* Classification summary */}
      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((opt) => {
          const count =
            opt.value === "all"
              ? total
              : counts[opt.value] ?? 0;
          return (
            <button
              key={opt.value}
              onClick={() => {
                setFilter(opt.value);
                setSelectedEmail(null);
              }}
              className={`px-3 py-2 rounded-full text-sm font-medium transition-colors ${
                filter === opt.value
                  ? "bg-violet-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {opt.label} ({count})
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : emails.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-300 mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
          <p className="text-gray-500">No emails found.</p>
          <p className="text-sm text-gray-400 mt-1">
            Connect your Gmail account in Profile to start scanning your inbox.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Email list */}
          <div className="space-y-2">
            {emails.map((email) => {
              const cls =
                CLASSIFICATION_LABELS[email.classification] ??
                CLASSIFICATION_LABELS.other;
              const isSelected = selectedEmail?.id === email.id;
              return (
                <button
                  key={email.id}
                  onClick={() => {
                    setSelectedEmail(email);
                    setReplyBody("");
                    setReplyResult(null);
                  }}
                  className={`w-full text-left p-4 rounded-lg border transition-colors ${
                    isSelected
                      ? "border-violet-500 bg-violet-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {email.from_name || email.from_email}
                      </p>
                      <p className="text-sm text-gray-700 truncate">
                        {email.subject || "(no subject)"}
                      </p>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {email.body_snippet}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls.color}`}
                      >
                        {cls.label}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(email.received_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Email detail + reply */}
          {selectedEmail && (
            <div className="bg-white rounded-lg shadow p-6 lg:sticky lg:top-4">
              <div className="space-y-3">
                <div>
                  <p className="text-lg font-semibold text-gray-900">
                    {selectedEmail.subject || "(no subject)"}
                  </p>
                  <p className="text-sm text-gray-600">
                    From: {selectedEmail.from_name}{" "}
                    <span className="text-gray-400">
                      &lt;{selectedEmail.from_email}&gt;
                    </span>
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(selectedEmail.received_at).toLocaleString()}
                  </p>
                </div>

                <div className="border-t pt-3">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {selectedEmail.body_snippet}
                  </p>
                </div>

                {/* Reply section */}
                <div className="border-t pt-3">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">
                    Reply
                  </h4>

                  {replyResult && (
                    <div
                      className={`p-2 rounded text-sm mb-2 ${
                        replyResult.type === "success"
                          ? "bg-green-50 text-green-800"
                          : "bg-red-50 text-red-800"
                      }`}
                    >
                      {replyResult.text}
                    </div>
                  )}

                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Type your reply..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 resize-none"
                  />
                  <button
                    onClick={handleReply}
                    disabled={replying || !replyBody.trim()}
                    className="mt-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {replying ? "Sending..." : "Send Reply"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
