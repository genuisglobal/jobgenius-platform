"use client";

import { useState } from "react";
import type { MatchRow } from "./NetworkClient";

interface MatchCardProps {
  match: MatchRow;
  onStatusUpdate: (matchId: string, newStatus: string) => void;
  setMsg: (msg: { type: "success" | "error"; text: string } | null) => void;
}

type EmailDraft = { subject: string; body: string };
type View = "idle" | "compose-email" | "compose-text";

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function ContactTypeBadge({ type }: { type: "recruiter" | "referral" }) {
  const cls =
    type === "recruiter"
      ? "bg-purple-100 text-purple-700"
      : "bg-teal-100 text-teal-700";
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {type}
    </span>
  );
}

export default function MatchCard({ match, onStatusUpdate, setMsg }: MatchCardProps) {
  const [view, setView] = useState<View>("idle");
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [textDraft, setTextDraft] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  const contact = match.network_contacts;
  const job = match.job_posts;
  const seeker = match.job_seekers;

  // ── Generate email draft ─────────────────────────────────────────────────
  const handleGenerateEmail = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/am/network/generate-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: match.id, message_type: "email" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate email.");
      setDraft({ subject: data.subject, body: data.body });
      setView("compose-email");
    } catch (err) {
      setMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to generate email.",
      });
    } finally {
      setLoading(false);
    }
  };

  // ── Generate text draft ──────────────────────────────────────────────────
  const handleGenerateText = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/am/network/generate-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: match.id, message_type: "text" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate text.");
      setTextDraft(data.text);
      setView("compose-text");
    } catch (err) {
      setMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to generate text.",
      });
    } finally {
      setLoading(false);
    }
  };

  // ── Send email ───────────────────────────────────────────────────────────
  const handleSendEmail = async () => {
    if (!draft || !contact?.email) return;
    setSendingEmail(true);
    try {
      const res = await fetch("/api/am/network/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: match.id,
          subject: draft.subject,
          body: draft.body,
          to_email: contact.email,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send email.");
      setMsg({ type: "success", text: `Email sent to ${contact.email}.` });
      onStatusUpdate(match.id, "contacted");
    } catch (err) {
      setMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to send email.",
      });
      setView("compose-email");
    } finally {
      setSendingEmail(false);
    }
  };

  // ── Dismiss match ────────────────────────────────────────────────────────
  const handleDismiss = async () => {
    try {
      const res = await fetch("/api/am/network/matches", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: match.id, status: "dismissed" }),
      });
      if (!res.ok) throw new Error("Failed to dismiss.");
      onStatusUpdate(match.id, "dismissed");
    } catch {
      setMsg({ type: "error", text: "Failed to dismiss match." });
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* ── Card header ─────────────────────────────────────────── */}
      <div className="px-5 py-4 flex flex-wrap gap-4 items-start justify-between">
        {/* Contact info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {contact && <ContactTypeBadge type={contact.contact_type} />}
            <span className="font-semibold text-gray-900 truncate">
              {contact?.full_name ?? "Unknown Contact"}
            </span>
            {contact?.company_name && (
              <span className="text-gray-400 text-sm">@ {contact.company_name}</span>
            )}
          </div>
          {contact?.email && (
            <p className="text-xs text-gray-500">{contact.email}</p>
          )}
        </div>

        {/* Seeker chip */}
        {seeker && (
          <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-100">
            For: <span className="font-medium text-gray-700">{seeker.full_name ?? seeker.email}</span>
          </div>
        )}
      </div>

      {/* ── Job info ─────────────────────────────────────────────── */}
      {job && (
        <div className="px-5 pb-3 flex items-center gap-2 text-sm text-gray-700">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="font-medium">{job.title ?? "Untitled Role"}</span>
          {job.company && <span className="text-gray-400">at {job.company}</span>}
          {job.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-violet-500 hover:underline text-xs"
            >
              View job
            </a>
          )}
        </div>
      )}

      {/* ── Match reason ─────────────────────────────────────────── */}
      <div className="px-5 pb-4">
        <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
          {match.match_reason}
        </span>
      </div>

      {/* ── Compose: email ───────────────────────────────────────── */}
      {view === "compose-email" && draft && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-3 bg-gray-50">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
            <input
              type="text"
              value={draft.subject}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Body</label>
            <textarea
              rows={6}
              value={stripHtml(draft.body)}
              onChange={(e) =>
                setDraft({ ...draft, body: `<p>${e.target.value.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br/>")}</p>` })
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
            />
          </div>
          {!contact?.email && (
            <p className="text-xs text-red-600">
              No email address on file for this contact. Add one to send.
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setView("idle")}
              className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSendEmail}
              disabled={!contact?.email || sendingEmail}
              className="px-3 py-1.5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition"
            >
              {sendingEmail ? "Sending…" : `Send to ${contact?.email ?? "—"}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Compose: text ────────────────────────────────────────── */}
      {view === "compose-text" && textDraft !== null && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-3 bg-gray-50">
          <label className="block text-xs font-medium text-gray-600">Text / WhatsApp Message</label>
          <textarea
            rows={4}
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setView("idle")}
              className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
            >
              Close
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(textDraft);
                setMsg({ type: "success", text: "Copied to clipboard." });
              }}
              className="px-3 py-1.5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition"
            >
              Copy to clipboard
            </button>
          </div>
        </div>
      )}

      {/* ── Action bar ───────────────────────────────────────────── */}
      {(view === "idle") && (
        <div className="border-t border-gray-100 px-5 py-3 flex flex-wrap gap-2 bg-gray-50">
          <button
            onClick={handleGenerateEmail}
            disabled={loading}
            className="px-3 py-1.5 text-sm font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 disabled:opacity-50 transition"
          >
            {loading ? "Generating…" : "Generate Email"}
          </button>
          <button
            onClick={handleGenerateText}
            disabled={loading}
            className="px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition"
          >
            {loading ? "Generating…" : "Generate Text"}
          </button>
          <button
            onClick={handleDismiss}
            className="ml-auto px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-100 transition"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

