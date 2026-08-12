"use client";

import { useState } from "react";
import Link from "next/link";

type Conversation = {
  id: string;
  conversation_type: "general" | "application_question" | "task";
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
  account_managers: { name: string; email: string } | null;
  job_posts: { title: string; company: string | null } | null;
  unread_count: number;
  open_task_count: number;
  last_message: {
    content: string;
    sender_type: string;
    created_at: string;
  } | null;
};

const TABS = [
  { key: "all", label: "All" },
  { key: "task", label: "Tasks" },
  { key: "general", label: "Information & Chat" },
  { key: "application_question", label: "Application Questions" },
] as const;

export default function ConversationsClient({
  conversations,
}: {
  conversations: Conversation[];
}) {
  const [activeTab, setActiveTab] = useState<string>("all");

  const filtered =
    activeTab === "all"
      ? conversations
      : conversations.filter((c) => c.conversation_type === activeTab);

  return (
    <>
      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 rounded-lg p-1 mb-6">
        {TABS.map((tab) => {
          const count =
            tab.key === "all"
              ? conversations.length
              : conversations.filter((c) => c.conversation_type === tab.key)
                  .length;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Conversation List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500">No conversations yet.</p>
          <p className="text-sm text-gray-400 mt-2">
            Your account manager will reach out when they have questions or
            updates for you.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((conv) => (
            <Link
              key={conv.id}
              href={`/portal/conversations/${conv.id}`}
              className="block bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">
                      {conv.subject}
                    </h3>
                    {conv.unread_count > 0 && (
                      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        conv.conversation_type === "application_question"
                          ? "bg-purple-100 text-purple-700"
                          : conv.conversation_type === "task"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-violet-100 text-violet-700"
                      }`}
                    >
                      {conv.conversation_type === "application_question"
                        ? "Application Question"
                        : conv.conversation_type === "task"
                        ? "Task"
                        : "General"}
                    </span>
                    {conv.open_task_count > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">
                        {conv.open_task_count} open
                      </span>
                    )}
                    {conv.job_posts && (
                      <span className="text-xs text-gray-500">
                        {conv.job_posts.title}
                        {conv.job_posts.company
                          ? ` at ${conv.job_posts.company}`
                          : ""}
                      </span>
                    )}
                  </div>
                  {conv.last_message && (
                    <p className="text-sm text-gray-600 mt-2 truncate">
                      <span className="font-medium">
                        {conv.last_message.sender_type === "account_manager"
                          ? conv.account_managers?.name || "AM"
                          : "You"}
                        :
                      </span>{" "}
                      {conv.last_message.content}
                    </p>
                  )}
                </div>
                <div className="text-right ml-4 shrink-0">
                  <p className="text-xs text-gray-400">
                    {new Date(conv.updated_at).toLocaleDateString()}
                  </p>
                  <span
                    className={`mt-1 inline-block text-xs px-2 py-0.5 rounded ${
                      conv.status === "open"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {conv.status}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
