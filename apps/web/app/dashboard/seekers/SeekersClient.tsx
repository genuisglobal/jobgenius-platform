"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

type BulkAction = "message" | "task" | null;

interface SeekerWithStats {
  id: string;
  full_name: string | null;
  email: string;
  location: string | null;
  seniority: string | null;
  work_type: string | null;
  target_titles: string[] | null;
  skills: string[] | null;
  profile_completion: number | null;
  status: string | null;
  stats: {
    matched: number;
    queued: number;
    applied: number;
    needsAttention: number;
    interviews: number;
    gmailConnected: boolean;
    gmailEmail: string | null;
    inboxTotal: number;
    inboxInterviews: number;
  };
}

export default function SeekersClient({
  seekers,
}: {
  seekers: SeekerWithStats[];
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "attention" | "active">("all");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction>(null);
  const [bulkSubject, setBulkSubject] = useState("");
  const [bulkContent, setBulkContent] = useState("");
  const [bulkDueDate, setBulkDueDate] = useState("");
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ sent: number; failed: number } | null>(null);

  const filtered = useMemo(() => {
    return seekers.filter((s) => {
      // Search
      if (search) {
        const q = search.toLowerCase();
        const matches =
          (s.full_name || "").toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q) ||
          (s.location || "").toLowerCase().includes(q) ||
          (s.target_titles || []).some((t) => t.toLowerCase().includes(q));
        if (!matches) return false;
      }

      // Filter
      if (filter === "attention" && s.stats.needsAttention === 0) return false;
      if (filter === "active" && s.stats.queued === 0 && s.stats.applied === 0) return false;

      return true;
    });
  }, [seekers, search, filter]);

  const totalNeedsAttention = seekers.reduce((sum, s) => sum + s.stats.needsAttention, 0);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((s) => s.id)));
    }
  }

  async function sendBulk() {
    if (!bulkSubject.trim() || !bulkContent.trim() || selected.size === 0) return;
    setBulkSending(true);
    setBulkResult(null);
    const endpoint = bulkAction === "task" ? "/api/am/bulk/task" : "/api/am/bulk/message";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seeker_ids: Array.from(selected),
          subject: bulkSubject.trim(),
          content: bulkContent.trim(),
          due_date: bulkAction === "task" && bulkDueDate ? bulkDueDate : undefined,
        }),
      });
      const data = await res.json();
      setBulkResult({ sent: data.sent ?? 0, failed: data.failed ?? 0 });
      if (data.sent > 0) {
        setBulkSubject("");
        setBulkContent("");
        setBulkDueDate("");
        setSelected(new Set());
      }
    } catch {
      setBulkResult({ sent: 0, failed: selected.size });
    } finally {
      setBulkSending(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Job Seekers</h1>
          <p className="text-gray-600">{seekers.length} assigned to you</p>
        </div>
        {totalNeedsAttention > 0 && (
          <div className="bg-orange-100 text-orange-800 px-4 py-2 rounded-lg text-sm font-medium">
            {totalNeedsAttention} need attention
          </div>
        )}
      </div>

      {/* Filters & Search */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, location, or target title..."
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            >
              <option value="all">All Seekers</option>
              <option value="attention">Needs Attention</option>
              <option value="active">Active Pipeline</option>
            </select>
            <div className="flex border rounded-lg overflow-hidden">
              <button
                onClick={() => setView("cards")}
                className={`px-3 py-2 ${view === "cards" ? "bg-violet-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => setView("table")}
                className={`px-3 py-2 ${view === "table" ? "bg-violet-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      {selected.size > 0 && (
        <div className="bg-violet-50 border border-violet-200 rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-violet-800">{selected.size} selected</span>
          <button
            onClick={() => setBulkAction("message")}
            className="px-3 py-1.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700"
          >
            Send Message
          </button>
          <button
            onClick={() => setBulkAction("task")}
            className="px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700"
          >
            Assign Task
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
          >
            Clear
          </button>
        </div>
      )}

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500">No job seekers match your filters.</p>
        </div>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((seeker) => (
            <SeekerCard key={seeker.id} seeker={seeker} selected={selected.has(seeker.id)} onToggle={() => toggleSelect(seeker.id)} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                    className="accent-violet-600"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase hidden md:table-cell">Location</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Matched</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Queue</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Applied</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Attention</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Interviews</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase hidden lg:table-cell">Gmail</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase hidden lg:table-cell">Inbox</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((seeker) => (
                <tr key={seeker.id} className={`hover:bg-gray-50 ${selected.has(seeker.id) ? "bg-violet-50" : ""}`}>
                  <td className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={selected.has(seeker.id)}
                      onChange={() => toggleSelect(seeker.id)}
                      className="accent-violet-600"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900">{seeker.full_name || "Unnamed"}</p>
                      <p className="text-xs text-gray-500">{seeker.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">
                    {seeker.location || "-"}
                  </td>
                  <td className="px-4 py-3 text-center text-sm">{seeker.stats.matched}</td>
                  <td className="px-4 py-3 text-center text-sm">{seeker.stats.queued}</td>
                  <td className="px-4 py-3 text-center text-sm text-green-600 font-medium">{seeker.stats.applied}</td>
                  <td className="px-4 py-3 text-center">
                    {seeker.stats.needsAttention > 0 ? (
                      <span className="inline-block px-2 py-0.5 bg-orange-100 text-orange-800 text-xs font-medium rounded-full">
                        {seeker.stats.needsAttention}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-purple-600 font-medium">{seeker.stats.interviews}</td>
                  <td className="px-4 py-3 text-center hidden lg:table-cell">
                    {seeker.stats.gmailConnected ? (
                      <span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">Connected</span>
                    ) : (
                      <span className="text-xs text-gray-400">--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-sm hidden lg:table-cell">{seeker.stats.inboxTotal}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/seekers/${seeker.id}`}
                      className="text-sm text-violet-600 hover:text-violet-800 font-medium"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk Compose Modal */}
      {bulkAction && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">
              {bulkAction === "task" ? "Assign Task" : "Send Message"} to {selected.size} seeker{selected.size !== 1 ? "s" : ""}
            </h3>

            {bulkResult && (
              <div className={`p-3 rounded-lg text-sm ${bulkResult.failed === 0 ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                {bulkResult.sent > 0 && `Sent to ${bulkResult.sent} seekers. `}
                {bulkResult.failed > 0 && `Failed for ${bulkResult.failed} seekers.`}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <input
                type="text"
                value={bulkSubject}
                onChange={(e) => setBulkSubject(e.target.value)}
                placeholder={bulkAction === "task" ? "e.g. Complete your profile" : "e.g. Weekly update"}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {bulkAction === "task" ? "Task Description" : "Message"}
              </label>
              <textarea
                value={bulkContent}
                onChange={(e) => setBulkContent(e.target.value)}
                rows={4}
                placeholder="Write your message here…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              />
            </div>

            {bulkAction === "task" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date (optional)</label>
                <input
                  type="date"
                  value={bulkDueDate}
                  onChange={(e) => setBulkDueDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setBulkAction(null); setBulkResult(null); }}
                className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={sendBulk}
                disabled={!bulkSubject.trim() || !bulkContent.trim() || bulkSending}
                className="flex-1 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
              >
                {bulkSending ? "Sending…" : `Send to ${selected.size}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SeekerCard({ seeker, selected, onToggle }: { seeker: SeekerWithStats; selected: boolean; onToggle: () => void }) {
  const hasAttention = seeker.stats.needsAttention > 0;

  return (
    <div className={`relative bg-white rounded-lg shadow hover:shadow-md transition-shadow ${
      hasAttention ? "ring-2 ring-orange-400" : ""
    } ${selected ? "ring-2 ring-violet-400" : ""}`}>
      {/* Checkbox overlay */}
      <div className="absolute top-3 left-3 z-10">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className="accent-violet-600 w-4 h-4"
        />
      </div>
      <Link href={`/dashboard/seekers/${seeker.id}`} className="block p-5 pl-9">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-900">{seeker.full_name || "Unnamed"}</h3>
            <p className="text-sm text-gray-500">{seeker.email}</p>
          </div>
          {seeker.profile_completion !== null && (
            <div className="relative w-10 h-10 flex-shrink-0">
              <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.915" fill="none" stroke="#e5e7eb" strokeWidth="2" />
                <circle
                  cx="18" cy="18" r="15.915" fill="none" stroke="#8b5cf6" strokeWidth="2"
                  strokeDasharray={`${seeker.profile_completion} ${100 - seeker.profile_completion}`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-600">
                {seeker.profile_completion}%
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1 mb-3">
          {seeker.location && (
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
              {seeker.location}
            </span>
          )}
          {seeker.seniority && (
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded capitalize">
              {seeker.seniority}
            </span>
          )}
          {seeker.work_type && (
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded capitalize">
              {seeker.work_type}
            </span>
          )}
          {seeker.stats.gmailConnected ? (
            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Gmail
            </span>
          ) : (
            <span className="px-2 py-0.5 bg-red-50 text-red-400 text-xs rounded">
              No Gmail
            </span>
          )}
        </div>

        {seeker.target_titles && seeker.target_titles.length > 0 && (
          <p className="text-xs text-gray-500 mb-3 line-clamp-1">
            {seeker.target_titles.slice(0, 2).join(", ")}
            {seeker.target_titles.length > 2 && ` +${seeker.target_titles.length - 2} more`}
          </p>
        )}

        <div className="grid grid-cols-6 gap-2 pt-3 border-t">
          <Stat label="Match" value={seeker.stats.matched} />
          <Stat label="Queue" value={seeker.stats.queued} color="blue" />
          <Stat label="Applied" value={seeker.stats.applied} color="green" />
          <Stat label="Alert" value={seeker.stats.needsAttention} color={seeker.stats.needsAttention > 0 ? "orange" : undefined} />
          <Stat label="Intv" value={seeker.stats.interviews} color="purple" />
          <Stat label="Inbox" value={seeker.stats.inboxTotal} />
        </div>
      </Link>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: "blue" | "green" | "orange" | "purple";
}) {
  const colorClasses: Record<string, string> = {
    blue: "text-violet-600",
    green: "text-green-600",
    orange: "text-orange-600",
    purple: "text-purple-600",
  };
  const colorClass = color ? colorClasses[color] : "text-gray-900";

  return (
    <div className="text-center">
      <div className={`text-lg font-bold ${colorClass}`}>{value}</div>
      <div className="text-[10px] text-gray-500 uppercase">{label}</div>
    </div>
  );
}
