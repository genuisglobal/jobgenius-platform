"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface NotificationRow {
  id: string;
  category: string;
  subject: string | null;
  body: string | null;
  link_url: string | null;
  channel: string;
  status: string;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
}

const CATEGORY_STYLES: Record<string, string> = {
  payslip_issued: "bg-violet-100 text-violet-700",
  payslip_awaiting_sign: "bg-violet-100 text-violet-700",
  payslip_paid: "bg-green-100 text-green-700",
  application_paused: "bg-amber-100 text-amber-700",
  interview_confirmed: "bg-purple-100 text-purple-700",
  contract_sent: "bg-indigo-100 text-indigo-700",
  ai_output_rejected: "bg-red-100 text-red-700",
};

function fmtAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationsClient({
  initialRows,
}: {
  initialRows: NotificationRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [filter, setFilter] = useState<"all" | "unread">("unread");
  const [busy, setBusy] = useState(false);

  const visible = useMemo(
    () => (filter === "unread" ? rows.filter((r) => r.status !== "read") : rows),
    [rows, filter]
  );

  const unreadCount = useMemo(
    () => rows.filter((r) => r.status !== "read").length,
    [rows]
  );

  async function markRead(row: NotificationRow) {
    if (row.status === "read") return;
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id ? { ...r, status: "read", read_at: new Date().toISOString() } : r
      )
    );
    await fetch(`/api/me/notifications/${row.id}/read`, { method: "POST" }).catch(
      () => {}
    );
  }

  async function markAllRead() {
    if (unreadCount === 0) return;
    setBusy(true);
    const ok = await fetch("/api/me/notifications/read-all", { method: "POST" })
      .then((r) => r.ok)
      .catch(() => false);
    setBusy(false);
    if (ok) {
      setRows((prev) =>
        prev.map((r) => ({
          ...r,
          status: "read",
          read_at: r.read_at ?? new Date().toISOString(),
        }))
      );
      router.refresh();
    }
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center text-sm text-gray-400">
        No notifications yet.
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter("unread")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${
              filter === "unread"
                ? "bg-violet-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            Unread{unreadCount > 0 ? ` · ${unreadCount}` : ""}
          </button>
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${
              filter === "all"
                ? "bg-violet-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            All
          </button>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            disabled={busy}
            className="text-xs text-violet-600 hover:text-violet-700 disabled:opacity-50"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="space-y-2">
        {visible.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
            No {filter === "unread" ? "unread " : ""}notifications.
          </div>
        ) : (
          visible.map((row) => {
            const isUnread = row.status !== "read";
            return (
              <div
                key={row.id}
                className={`rounded-xl border p-4 flex items-start gap-3 ${
                  isUnread ? "bg-white border-violet-200" : "bg-gray-50 border-gray-200"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                        CATEGORY_STYLES[row.category] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {row.category.replace(/_/g, " ")}
                    </span>
                    <span className="text-[11px] text-gray-400">{fmtAgo(row.created_at)}</span>
                    {isUnread && (
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-600" aria-hidden />
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-900">{row.subject ?? "—"}</p>
                  {row.body && (
                    <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{row.body}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {row.link_url && (
                    <Link
                      href={row.link_url}
                      onClick={() => markRead(row)}
                      className="px-3 py-1.5 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700"
                    >
                      Open
                    </Link>
                  )}
                  {isUnread && (
                    <button
                      onClick={() => markRead(row)}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
