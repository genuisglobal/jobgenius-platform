"use client";

import { useEffect, useState } from "react";

type ConversationItem = {
  id: string;
  subject: string;
  conversation_type: string;
  updated_at: string;
  seeker_id: string;
  seeker_name: string;
  seeker_photo: string | null;
  unread_count: number;
  latest_message: {
    content: string;
    sender_type: string;
    created_at: string;
    message_type: string;
  } | null;
};

type Message = {
  id: string;
  content: string;
  sender_type: string;
  created_at: string;
  read_at: string | null;
  task_status: string | null;
  task_due_date: string | null;
  message_type: string;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function typeBadge(type: string) {
  if (type === "task") return "bg-yellow-100 text-yellow-800";
  if (type === "interview") return "bg-purple-100 text-purple-800";
  return "bg-gray-100 text-gray-600";
}

export default function InboxClient({
  initialConversations,
}: {
  initialConversations: ConversationItem[];
}) {
  const [conversations, setConversations] = useState<ConversationItem[]>(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const selected = conversations.find((c) => c.id === selectedId);

  async function loadMessages(convId: string) {
    setLoadingMessages(true);
    const conv = conversations.find((c) => c.id === convId);
    if (!conv) { setLoadingMessages(false); return; }
    try {
      const res = await fetch(`/api/am/seekers/${conv.seeker_id}/conversations/${convId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
        // Mark as read locally
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c))
        );
      }
    } finally {
      setLoadingMessages(false);
    }
  }

  useEffect(() => {
    if (!selectedId) return;
    loadMessages(selectedId);
  }, [selectedId]);

  // Poll for new messages every 15s
  useEffect(() => {
    if (!selectedId || !selected) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      fetch(`/api/am/seekers/${selected.seeker_id}/conversations/${selectedId}/messages`)
        .then((r) => r.json())
        .then((data) => {
          const newMsgs: Message[] = data.messages ?? [];
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const added = newMsgs.filter((m) => !existingIds.has(m.id));
            return added.length > 0 ? [...prev, ...added] : prev;
          });
        })
        .catch((err) => console.error("[inbox] poll messages failed:", err));
    }, 15000);
    return () => clearInterval(interval);
  }, [selectedId, selected]);

  async function sendReply() {
    if (!reply.trim() || !selectedId || !selected || sending) return;
    setSending(true);
    try {
      const res = await fetch(
        `/api/am/seekers/${selected.seeker_id}/conversations/${selectedId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: reply.trim() }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.message) {
          setMessages((prev) => [...prev, data.message]);
        }
        setReply("");
      }
    } finally {
      setSending(false);
    }
  }

  const totalUnread = conversations.reduce((acc, c) => acc + c.unread_count, 0);

  return (
    <div className="h-[calc(100vh-140px)] flex gap-0 bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 flex-shrink-0 border-r border-gray-100 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            Inbox
            {totalUnread > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-red-500 text-white rounded-full">
                {totalUnread > 9 ? "9+" : totalUnread}
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">{conversations.length} conversations</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">No conversations yet</div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedId(conv.id)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                  selectedId === conv.id ? "bg-violet-50 border-l-2 border-l-violet-500" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-sm font-medium truncate ${conv.unread_count > 0 ? "text-gray-900" : "text-gray-700"}`}>
                        {conv.seeker_name}
                      </p>
                      {conv.conversation_type !== "general" && (
                        <span className={`px-1.5 py-0.5 text-xs rounded ${typeBadge(conv.conversation_type)}`}>
                          {conv.conversation_type}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{conv.subject}</p>
                    {conv.latest_message && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {conv.latest_message.sender_type === "account_manager" ? "You: " : ""}
                        {conv.latest_message.content}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-xs text-gray-400">{timeAgo(conv.updated_at)}</span>
                    {conv.unread_count > 0 && (
                      <span className="inline-flex items-center justify-center w-4 h-4 text-xs font-bold bg-red-500 text-white rounded-full">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Message pane */}
      <div className="flex-1 flex flex-col">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Select a conversation to view messages
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between">
              <div>
                <p className="font-semibold text-gray-900">{selected.subject}</p>
                <p className="text-sm text-gray-500">
                  with <a href={`/dashboard/seekers/${selected.seeker_id}?tab=messages`} className="text-violet-600 hover:underline">{selected.seeker_name}</a>
                </p>
              </div>
              <a
                href={`/dashboard/seekers/${selected.seeker_id}?tab=messages&conversation=${selected.id}`}
                className="text-xs text-violet-600 hover:text-violet-700 border border-violet-200 px-2 py-1 rounded"
              >
                Open in seeker →
              </a>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {loadingMessages ? (
                <div className="text-center text-sm text-gray-400">Loading…</div>
              ) : messages.length === 0 ? (
                <div className="text-center text-sm text-gray-400">No messages yet</div>
              ) : (
                messages.map((msg) => {
                  const isAM = msg.sender_type === "account_manager";
                  return (
                    <div key={msg.id} className={`flex ${isAM ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                        isAM
                          ? "bg-violet-600 text-white"
                          : "bg-gray-100 text-gray-900"
                      }`}>
                        {msg.message_type === "task" && (
                          <p className="text-xs font-semibold mb-1 opacity-75">
                            Task {msg.task_status ? `(${msg.task_status})` : ""}
                          </p>
                        )}
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        <p className={`text-xs mt-1 ${isAM ? "text-violet-200" : "text-gray-400"}`}>
                          {new Date(msg.created_at).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Reply box */}
            <div className="p-4 border-t border-gray-100">
              <div className="flex gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply();
                  }}
                  rows={2}
                  placeholder="Type a reply… (Ctrl+Enter to send)"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                />
                <button
                  onClick={sendReply}
                  disabled={!reply.trim() || sending}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg self-end"
                >
                  {sending ? "…" : "Send"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
