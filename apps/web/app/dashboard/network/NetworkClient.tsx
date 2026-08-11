"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ContactTable from "./ContactTable";
import MatchCard from "./MatchCard";
import AddContactForm from "./AddContactForm";

// ─── Types ──────────────────────────────────────────────────────────

export interface ContactRow {
  id: string;
  contact_type: "recruiter" | "referral";
  full_name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  company_name: string | null;
  company_domain: string | null;
  job_title: string | null;
  industries: string[];
  notes: string | null;
  source: string;
  status: string;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
  pending_match_count: number;
}

export interface MatchRow {
  id: string;
  network_contact_id: string;
  job_post_id: string;
  job_seeker_id: string;
  match_reason: string;
  status: string;
  created_at: string;
  network_contacts: {
    id: string;
    full_name: string;
    contact_type: "recruiter" | "referral";
    company_name: string | null;
    email: string | null;
  } | null;
  job_posts: {
    id: string;
    title: string | null;
    company: string | null;
    url: string | null;
  } | null;
  job_seekers: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}

interface NetworkClientProps {
  contacts: ContactRow[];
  matches: MatchRow[];
}

const TABS = [
  { id: "contacts", label: "Contacts" },
  { id: "matches", label: "Matches" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function NetworkClient({
  contacts: initialContacts,
  matches: initialMatches,
}: NetworkClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = (searchParams.get("tab") as TabId) || "contacts";
  const [activeTab, setActiveTab] = useState<TabId>(
    TABS.some((t) => t.id === initialTab) ? initialTab : "contacts"
  );
  const [contacts, setContacts] = useState<ContactRow[]>(initialContacts);
  const [matches, setMatches] = useState<MatchRow[]>(initialMatches);
  const [showAddForm, setShowAddForm] = useState(false);
  const [msg, setMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const switchTab = (tab: TabId) => {
    setActiveTab(tab);
    router.replace(`/dashboard/network?tab=${tab}`, { scroll: false });
  };

  const handleContactAdded = (contact: ContactRow) => {
    setContacts((prev) => [contact, ...prev]);
    setShowAddForm(false);
    setMsg({ type: "success", text: "Contact added. Matching in progress..." });
    setTimeout(() => setMsg(null), 4000);
  };

  const handleMatchUpdate = (matchId: string, newStatus: string) => {
    setMatches((prev) =>
      prev.map((m) => (m.id === matchId ? { ...m, status: newStatus } : m))
    );
    if (newStatus === "dismissed") {
      setMatches((prev) => prev.filter((m) => m.id !== matchId));
    }
  };

  const pendingMatchCount = matches.filter(
    (m) => m.status === "pending"
  ).length;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Network Hub</h1>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition"
        >
          + Add Contact
        </button>
      </div>

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

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${
              activeTab === tab.id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab.label}
            {tab.id === "matches" && pendingMatchCount > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-violet-100 text-violet-700 rounded-full">
                {pendingMatchCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "contacts" && (
        <ContactTable contacts={contacts} />
      )}

      {activeTab === "matches" && (
        <div className="space-y-4">
          {matches.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No pending matches. Add contacts with company names or industries
              to auto-match them to job posts.
            </p>
          ) : (
            matches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                onStatusUpdate={handleMatchUpdate}
                setMsg={setMsg}
              />
            ))
          )}
        </div>
      )}

      {/* Add Contact Modal */}
      {showAddForm && (
        <AddContactForm
          onClose={() => setShowAddForm(false)}
          onAdded={handleContactAdded}
        />
      )}
    </div>
  );
}
