"use client";

import { useState } from "react";
import Link from "next/link";
import type { ContactRow } from "./NetworkClient";

interface ContactTableProps {
  contacts: ContactRow[];
}

type TypeFilter = "all" | "recruiter" | "referral";

const TYPE_BADGE: Record<string, string> = {
  recruiter: "bg-purple-100 text-purple-700",
  referral: "bg-teal-100 text-teal-700",
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  inactive: "bg-gray-100 text-gray-500",
  do_not_contact: "bg-red-100 text-red-700",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ContactTable({ contacts: initialContacts }: ContactTableProps) {
  const [contacts, setContacts] = useState<ContactRow[]>(initialContacts);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered =
    typeFilter === "all"
      ? contacts
      : contacts.filter((c) => c.contact_type === typeFilter);

  const handleDelete = async (id: string) => {
    if (!confirm("Archive this contact? It will be removed from your list.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/am/network/contacts/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setContacts((prev) => prev.filter((c) => c.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      {/* Filter bar */}
      <div className="flex gap-2 mb-4">
        {(["all", "recruiter", "referral"] as TypeFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setTypeFilter(f)}
            className={`px-3 py-1.5 text-sm rounded-full border transition ${
              typeFilter === f
                ? "bg-violet-600 text-white border-violet-600"
                : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1) + "s"}
          </button>
        ))}
        <span className="ml-auto text-sm text-gray-500 self-center">
          {filtered.length} contact{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">
          {contacts.length === 0
            ? "No contacts yet. Click \"+ Add Contact\" to get started."
            : "No contacts match the current filter."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Company / Title</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Industries</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Matches</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Last Contacted</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Added</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((contact) => (
                <tr key={contact.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        TYPE_BADGE[contact.contact_type] || "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {contact.contact_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <div>{contact.full_name}</div>
                    {contact.linkedin_url && (
                      <a
                        href={contact.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-violet-500 text-xs hover:underline"
                      >
                        LinkedIn
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <div>{contact.company_name || "—"}</div>
                    {contact.job_title && (
                      <div className="text-xs text-gray-400">{contact.job_title}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {contact.email ? (
                      <a
                        href={`mailto:${contact.email}`}
                        className="text-violet-600 hover:underline"
                      >
                        {contact.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {contact.industries && contact.industries.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {contact.industries.slice(0, 3).map((ind) => (
                          <span
                            key={ind}
                            className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
                          >
                            {ind}
                          </span>
                        ))}
                        {contact.industries.length > 3 && (
                          <span className="text-xs text-gray-400">
                            +{contact.industries.length - 3}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {contact.pending_match_count > 0 ? (
                      <span className="px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full text-xs font-medium">
                        {contact.pending_match_count} pending
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {formatDate(contact.last_contacted_at)}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {formatDate(contact.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/dashboard/network/${contact.id}`}
                        className="text-xs text-violet-600 hover:text-violet-800 transition"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => handleDelete(contact.id)}
                        disabled={deletingId === contact.id}
                        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40 transition"
                      >
                        {deletingId === contact.id ? "Removing…" : "Archive"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
