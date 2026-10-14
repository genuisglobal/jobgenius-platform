"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import EditContactForm from "../EditContactForm";
import type { ContactRow } from "../NetworkClient";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MatchRow {
  id: string;
  job_post_id: string;
  job_seeker_id: string;
  match_reason: string;
  status: string;
  created_at: string;
  job_posts: { id: string; title: string | null; company: string | null; url: string | null } | null;
  job_seekers: { id: string; full_name: string | null; email: string } | null;
}

interface ActivityRow {
  id: string;
  activity_type: string;
  details: Record<string, unknown>;
  created_at: string;
}

interface ContactDetailClientProps {
  contact: ContactRow;
  matches: MatchRow[];
  activity: ActivityRow[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, string> = {
  recruiter: "bg-purple-100 text-purple-700",
  referral: "bg-teal-100 text-teal-700",
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  inactive: "bg-gray-100 text-gray-500",
  do_not_contact: "bg-red-100 text-red-700",
};

const MATCH_STATUS_BADGE: Record<string, string> = {
  pending: "bg-violet-100 text-violet-700",
  contacted: "bg-yellow-100 text-yellow-700",
  responded: "bg-green-100 text-green-700",
  dismissed: "bg-gray-100 text-gray-500",
};

const ACTIVITY_LABELS: Record<string, string> = {
  email_sent: "Email sent",
  text_copied: "Text copied",
  note_added: "Note added",
  status_changed: "Status changed",
  match_created: "Matches created",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type TabId = "matches" | "activity";

// ─── Component ──────────────────────────────────────────────────────────────

export default function ContactDetailClient({
  contact: initialContact,
  matches: initialMatches,
  activity: initialActivity,
}: ContactDetailClientProps) {
  const router = useRouter();
  const [contact, setContact] = useState<ContactRow>(initialContact);
  const [matches] = useState<MatchRow[]>(initialMatches);
  const [activity] = useState<ActivityRow[]>(initialActivity);
  const [activeTab, setActiveTab] = useState<TabId>("matches");
  const [showEdit, setShowEdit] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSaved = (updated: ContactRow) => {
    setContact(updated);
    setShowEdit(false);
    setMsg({ type: "success", text: "Contact updated." });
    setTimeout(() => setMsg(null), 3000);
  };

  const handleArchive = async () => {
    if (!confirm("Archive this contact? It will be removed from your list.")) return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/am/network/contacts/${contact.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/dashboard/network");
      }
    } finally {
      setArchiving(false);
    }
  };

  const pendingCount = matches.filter((m) => m.status === "pending").length;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back link */}
      <Link
        href="/dashboard/network"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Network Hub
      </Link>

      {msg && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm ${
            msg.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Contact card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
        <div className="flex flex-wrap gap-4 items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  TYPE_BADGE[contact.contact_type] || "bg-gray-100 text-gray-600"
                }`}
              >
                {contact.contact_type}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  STATUS_BADGE[contact.status] || "bg-gray-100 text-gray-600"
                }`}
              >
                {contact.status.replace(/_/g, " ")}
              </span>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-1">{contact.full_name}</h1>

            {(contact.job_title || contact.company_name) && (
              <p className="text-gray-600 mb-3">
                {contact.job_title}
                {contact.job_title && contact.company_name && " at "}
                {contact.company_name}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6 text-sm text-gray-600">
              {contact.email && (
                <div>
                  <span className="text-gray-400 text-xs uppercase tracking-wide block">Email</span>
                  <a href={`mailto:${contact.email}`} className="text-violet-600 hover:underline">
                    {contact.email}
                  </a>
                </div>
              )}
              {contact.phone && (
                <div>
                  <span className="text-gray-400 text-xs uppercase tracking-wide block">Phone</span>
                  {contact.phone}
                </div>
              )}
              {contact.linkedin_url && (
                <div>
                  <span className="text-gray-400 text-xs uppercase tracking-wide block">LinkedIn</span>
                  <a
                    href={contact.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-600 hover:underline truncate block"
                  >
                    {contact.linkedin_url}
                  </a>
                </div>
              )}
              {contact.last_contacted_at && (
                <div>
                  <span className="text-gray-400 text-xs uppercase tracking-wide block">Last Contacted</span>
                  {formatDate(contact.last_contacted_at)}
                </div>
              )}
              <div>
                <span className="text-gray-400 text-xs uppercase tracking-wide block">Added</span>
                {formatDate(contact.created_at)}
              </div>
              <div>
                <span className="text-gray-400 text-xs uppercase tracking-wide block">Source</span>
                {contact.source}
              </div>
            </div>

            {contact.industries && contact.industries.length > 0 && (
              <div className="mt-3">
                <span className="text-gray-400 text-xs uppercase tracking-wide block mb-1">Industries</span>
                <div className="flex flex-wrap gap-1">
                  {contact.industries.map((ind) => (
                    <span
                      key={ind}
                      className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
                    >
                      {ind}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {contact.notes && (
              <div className="mt-3">
                <span className="text-gray-400 text-xs uppercase tracking-wide block mb-1">Notes</span>
                <p className="text-sm text-gray-700 whitespace-pre-line">{contact.notes}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => setShowEdit(true)}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Edit
            </button>
            <button
              onClick={handleArchive}
              disabled={archiving}
              className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40 transition"
            >
              {archiving ? "Archiving…" : "Archive"}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {(["matches", "activity"] as TabId[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${
              activeTab === tab
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === "matches" && pendingCount > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-violet-100 text-violet-700 rounded-full">
                {pendingCount} pending
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Matches tab */}
      {activeTab === "matches" && (
        <div>
          {matches.length === 0 ? (
            <p className="text-gray-500 text-sm py-4">
              No matches yet. Matching runs automatically when contacts are added or new jobs are scored.
            </p>
          ) : (
            <div className="space-y-3">
              {matches.map((match) => (
                <div
                  key={match.id}
                  className="bg-white rounded-xl border border-gray-200 px-5 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            MATCH_STATUS_BADGE[match.status] || "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {match.status}
                        </span>
                        <span className="text-sm font-medium text-gray-900">
                          {match.job_posts?.title ?? "Untitled Role"}
                        </span>
                        {match.job_posts?.company && (
                          <span className="text-sm text-gray-500">at {match.job_posts.company}</span>
                        )}
                      </div>
                      {match.job_seekers && (
                        <p className="text-xs text-gray-500">
                          For: {match.job_seekers.full_name ?? match.job_seekers.email}
                        </p>
                      )}
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 inline-block px-2 py-0.5 rounded-full mt-1">
                        {match.match_reason}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {match.job_posts?.url && (
                        <a
                          href={match.job_posts.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-violet-500 hover:underline"
                        >
                          View job
                        </a>
                      )}
                      <span className="text-xs text-gray-400">{formatDate(match.created_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Activity tab */}
      {activeTab === "activity" && (
        <div>
          {activity.length === 0 ? (
            <p className="text-gray-500 text-sm py-4">No activity recorded yet.</p>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {activity.map((item) => (
                <div key={item.id} className="px-5 py-3 flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-violet-400 mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 font-medium">
                      {ACTIVITY_LABELS[item.activity_type] ?? item.activity_type}
                    </p>
                    {item.activity_type === "email_sent" && Boolean(item.details.to_email) && (
                      <p className="text-xs text-gray-500">To: {String(item.details.to_email)}</p>
                    )}
                    {item.activity_type === "status_changed" && Boolean(item.details.new_status) && (
                      <p className="text-xs text-gray-500">
                        New status: {String(item.details.new_status).replace(/_/g, " ")}
                      </p>
                    )}
                    {item.activity_type === "match_created" && Boolean(item.details.matches_created) && (
                      <p className="text-xs text-gray-500">
                        {String(item.details.matches_created)} new match
                        {Number(item.details.matches_created) !== 1 ? "es" : ""}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {formatDateTime(item.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit modal */}
      {showEdit && (
        <EditContactForm
          contact={contact}
          onClose={() => setShowEdit(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
