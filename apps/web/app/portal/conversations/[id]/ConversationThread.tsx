"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  formatTaskStatusLabel,
  getTaskAttachmentFromAttachments,
  type TaskStatus,
} from "@/lib/conversations/tasks";

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

type Message = {
  id: string;
  sender_type: string;
  sender_id: string;
  content: string;
  is_answer: boolean;
  created_at: string;
  read_at: string | null;
  attachments?: unknown;
};

type Conversation = {
  id: string;
  conversation_type: "general" | "application_question" | "task";
  subject: string;
  status: string;
  account_managers: { name: string; email: string } | null;
  job_posts: { title: string; company: string | null } | null;
};

export default function ConversationThread({
  conversation,
  initialMessages,
  userId,
}: {
  conversation: Conversation;
  initialMessages: Message[];
  userId: string;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [saveAsAnswer, setSaveAsAnswer] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Poll for new messages every 10s; pauses when tab is hidden
  useEffect(() => {
    if (conversation.status !== "open") return;

    const poll = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch(
          `/api/portal/conversations/${conversation.id}/messages`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const { messages: serverMessages } = await res.json() as { messages: Message[] };
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const incoming = serverMessages.filter((m) => !existingIds.has(m.id));
          if (incoming.length === 0) return prev;
          return [...prev, ...incoming].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        });
      } catch {
        // Ignore transient failures.
      }
    };

    const id = setInterval(poll, 10000);
    return () => clearInterval(id);
  }, [conversation.id, conversation.status]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const res = await fetch(
        `/api/portal/conversations/${conversation.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: newMessage.trim(),
            is_answer:
              saveAsAnswer &&
              conversation.conversation_type === "application_question",
          }),
        }
      );

      if (res.ok) {
        const { message } = await res.json();
        setMessages((prev) => [...prev, message]);
        setNewMessage("");
        setSaveAsAnswer(false);
      }
    } finally {
      setSending(false);
    }
  }

  async function handleMarkAsAnswer(messageId: string) {
    // Save existing message as an answer to application_question_answers
    const message = messages.find((m) => m.id === messageId);
    if (!message) return;

    const res = await fetch(
      `/api/portal/conversations/${conversation.id}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: message.content,
          is_answer: true,
        }),
      }
    );

    if (res.ok) {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, is_answer: true } : m))
      );
    }
  }

  async function handleTaskStatusUpdate(messageId: string, status: TaskStatus) {
    if (updatingTaskId) return;
    setUpdatingTaskId(messageId);
    try {
      const res = await fetch(
        `/api/portal/conversations/${conversation.id}/messages`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message_id: messageId,
            task_status: status,
          }),
        }
      );

      if (!res.ok) {
        return;
      }

      const data = await res.json();
      setMessages((prev) => {
        const next = prev.map((message) =>
          message.id === messageId ? (data.message as Message) : message
        );

        if (data.status_message) {
          next.push(data.status_message as Message);
          next.sort(
            (a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        }

        return next;
      });
    } finally {
      setUpdatingTaskId(null);
    }
  }

  const isApplicationQuestion =
    conversation.conversation_type === "application_question";
  const isTaskConversation = conversation.conversation_type === "task";

  return (
    <div className="flex flex-col h-[calc(100dvh-220px)]">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <Link
              href="/portal/conversations"
              className="text-sm text-violet-600 hover:text-violet-800"
            >
              &larr; Back to conversations
            </Link>
            <h2 className="text-lg font-semibold text-gray-900 mt-1">
              {conversation.subject}
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span
                className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                  isApplicationQuestion
                    ? "bg-purple-100 text-purple-700"
                    : isTaskConversation
                    ? "bg-amber-100 text-amber-700"
                    : "bg-violet-100 text-violet-700"
                }`}
              >
                {isApplicationQuestion
                  ? "Application Question"
                  : isTaskConversation
                  ? "Task"
                  : "General"}
              </span>
              {conversation.job_posts && (
                <span className="text-xs text-gray-500">
                  {conversation.job_posts.title}
                  {conversation.job_posts.company
                    ? ` at ${conversation.job_posts.company}`
                    : ""}
                </span>
              )}
            </div>
          </div>
          <div className="sm:text-right flex-shrink-0">
            <p className="text-sm text-gray-500">
              With: {conversation.account_managers?.name || "Account Manager"}
            </p>
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                conversation.status === "open"
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {conversation.status}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-white rounded-lg shadow p-4 space-y-4">
        {messages.length === 0 ? (
          <p className="text-center text-gray-400 py-8">
            No messages yet in this conversation.
          </p>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_type === "job_seeker";
            const task = getTaskAttachmentFromAttachments(msg.attachments);
            const hasTask = Boolean(task);
            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[70%] rounded-lg px-4 py-3 ${
                    isMe
                      ? "bg-violet-600 text-white"
                      : hasTask
                      ? "bg-amber-50 text-amber-900 border border-amber-200"
                      : "bg-gray-100 text-gray-900"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs font-medium ${
                        isMe ? "text-violet-100" : "text-gray-500"
                      }`}
                    >
                      {isMe
                        ? "You"
                        : conversation.account_managers?.name || "AM"}
                    </span>
                    <span
                      className={`text-xs ${
                        isMe ? "text-violet-200" : "text-gray-400"
                      }`}
                      title={new Date(msg.created_at).toLocaleString()}
                    >
                      {isToday(msg.created_at)
                        ? new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : new Date(msg.created_at).toLocaleDateString([], { month: "short", day: "numeric" }) +
                          " " +
                          new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  {task && (
                    <div className="mt-3 p-3 rounded-md bg-white/80 border border-amber-200">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-amber-900">
                          {task.title}
                        </p>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                          {formatTaskStatusLabel(task.status)}
                        </span>
                      </div>
                      {task.description && (
                        <p className="text-sm text-amber-800 mt-1 whitespace-pre-wrap">
                          {task.description}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-amber-800">
                        <span className="px-2 py-0.5 rounded bg-amber-100 capitalize">
                          {task.priority} priority
                        </span>
                        {task.due_date && (
                          <span>
                            Due: {new Date(task.due_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {!isMe && (
                        <div className="mt-3">
                          <label className="text-xs text-amber-900 font-medium">
                            Update task status
                          </label>
                          <select
                            value={task.status}
                            onChange={(event) =>
                              handleTaskStatusUpdate(
                                msg.id,
                                event.target.value as TaskStatus
                              )
                            }
                            disabled={updatingTaskId === msg.id}
                            className="mt-1 w-full rounded-md border border-amber-300 bg-white px-2 py-1 text-sm text-amber-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                          >
                            <option value="todo">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                  {msg.is_answer && (
                    <span className="inline-block mt-2 px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">
                      Saved as profile answer
                    </span>
                  )}
                  {isMe &&
                    isApplicationQuestion &&
                    !msg.is_answer &&
                    msg.sender_id === userId && (
                      <button
                        onClick={() => handleMarkAsAnswer(msg.id)}
                        className="mt-2 text-xs underline text-violet-200 hover:text-white"
                      >
                        Save as reusable answer
                      </button>
                    )}
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      {conversation.status === "open" && (
        <form
          onSubmit={handleSend}
          className="mt-4 bg-white rounded-lg shadow p-4"
        >
          {isApplicationQuestion && (
            <label className="flex items-center gap-2 text-sm text-gray-600 mb-2">
              <input
                type="checkbox"
                checked={saveAsAnswer}
                onChange={(e) => setSaveAsAnswer(e.target.checked)}
                className="rounded border-gray-300"
              />
              Save this response as a reusable answer on my profile
            </label>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={
                isTaskConversation
                  ? "Share a task update..."
                  : "Type your message..."
              }
              className="flex-1 min-w-0 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
            <button
              type="submit"
              disabled={sending || !newMessage.trim()}
              className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-md hover:bg-violet-700 disabled:opacity-50 transition-colors shrink-0"
            >
              {sending ? "..." : "Send"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
