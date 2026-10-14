"use client";

import { useState } from "react";

interface Contact {
  id: string;
  full_name: string;
  role: string | null;
  email: string | null;
  company_name: string | null;
  linkedin_url: string | null;
  phone: string | null;
  source: string | null;
  created_at: string;
}

interface Props {
  contacts: Contact[];
}

export default function ContactsClient({ contacts }: Props) {
  const [search, setSearch] = useState("");

  const filtered = contacts.filter((c) => {
    if (!search) return true;
    const lower = search.toLowerCase();
    return (
      c.full_name.toLowerCase().includes(lower) ||
      (c.company_name?.toLowerCase().includes(lower) ?? false) ||
      (c.email?.toLowerCase().includes(lower) ?? false) ||
      (c.role?.toLowerCase().includes(lower) ?? false)
    );
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
        <p className="text-gray-600">
          Company representatives and recruiter contacts found by your account manager.
        </p>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg shadow p-4">
        <input
          type="text"
          placeholder="Search by name, company, email..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-2xl font-bold text-violet-600">{contacts.length}</div>
          <div className="text-xs text-gray-500 mt-1">Total Contacts</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-2xl font-bold text-green-600">
            {contacts.filter((c) => c.email).length}
          </div>
          <div className="text-xs text-gray-500 mt-1">With Email</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-2xl font-bold text-indigo-600">
            {contacts.filter((c) => c.linkedin_url).length}
          </div>
          <div className="text-xs text-gray-500 mt-1">With LinkedIn</div>
        </div>
      </div>

      {/* Contact Cards */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          <svg
            className="w-12 h-12 mx-auto mb-4 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <p className="font-medium">No contacts found</p>
          <p className="text-sm mt-1">
            Your account manager will find company contacts for you during their job search.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((contact) => (
            <div
              key={contact.id}
              className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                  <span className="text-indigo-600 font-bold text-sm">
                    {contact.full_name[0]?.toUpperCase() || "?"}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 text-sm truncate">
                    {contact.full_name}
                  </h3>
                  {contact.role && (
                    <p className="text-xs text-gray-500 truncate">{contact.role}</p>
                  )}
                  {contact.company_name && (
                    <p className="text-xs text-indigo-600 truncate">{contact.company_name}</p>
                  )}
                </div>
              </div>

              <div className="mt-3 space-y-1">
                {contact.email && (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <a href={`mailto:${contact.email}`} className="text-violet-600 hover:underline truncate">
                      {contact.email}
                    </a>
                  </div>
                )}
                {contact.linkedin_url && (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                    </svg>
                    <a
                      href={contact.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-600 hover:underline truncate"
                    >
                      LinkedIn Profile
                    </a>
                  </div>
                )}
                {contact.phone && (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <span>{contact.phone}</span>
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] text-gray-400">
                  {new Date(contact.created_at).toLocaleDateString()}
                </span>
                {contact.source && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                    {contact.source.replace(/_/g, " ")}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
