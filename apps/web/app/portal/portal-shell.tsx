"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "./logout-button";

const NAV_ITEMS = [
  { href: "/portal", label: "Dashboard", icon: "home" },
  { href: "/portal/profile", label: "Profile", icon: "user" },
  { href: "/portal/resumes", label: "Resumes", icon: "academic" },
  { href: "/portal/billing", label: "Billing", icon: "credit-card" },
  { href: "/portal/agreement", label: "Agreement", icon: "book" },
  { href: "/portal/conversations", label: "Questions & Tasks", icon: "chat" },
  { href: "/portal/references", label: "References", icon: "users" },
  { href: "/portal/applications", label: "Applications", icon: "briefcase" },
  { href: "/portal/tracker", label: "Live Tracker", icon: "bolt" },
  { href: "/portal/inbox", label: "Inbox", icon: "inbox" },
  { href: "/portal/contacts", label: "Contacts", icon: "contacts" },
  { href: "/portal/availability", label: "Availability", icon: "clock" },
  { href: "/portal/interviews", label: "Interviews", icon: "calendar" },
  { href: "/portal/interview-prep", label: "Interview Prep", icon: "book" },
  { href: "/portal/learning", label: "Learning", icon: "academic" },
  { href: "/portal/performance", label: "Performance", icon: "trophy" },
  { href: "/portal/progress", label: "Progress", icon: "star" },
  { href: "/portal/referrals", label: "Referrals", icon: "gift" },
];

function NavIcon({ icon, className }: { icon: string; className?: string }) {
  const cls = className || "w-5 h-5";
  switch (icon) {
    case "home":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
        </svg>
      );
    case "user":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
    case "chat":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      );
    case "users":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case "contacts":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
    case "briefcase":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
    case "clock":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "calendar":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case "trophy":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3h14M9 3v2a3 3 0 003 3v0a3 3 0 003-3V3M5 3a2 2 0 00-2 2v1a4 4 0 004 4h0M19 3a2 2 0 012 2v1a4 4 0 01-4 4h0M12 14v3m-4 4h8a1 1 0 001-1v-1a4 4 0 00-4-4h-2a4 4 0 00-4 4v1a1 1 0 001 1z" />
        </svg>
      );
    case "book":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      );
    case "star":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      );
    case "credit-card":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      );
    case "inbox":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      );
    case "academic":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" />
        </svg>
      );
    case "gift":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
        </svg>
      );
    case "bolt":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      );
    default:
      return null;
  }
}

type RecentUnread = {
  conversation_id: string;
  subject: string;
  preview: string;
  conversation_type: string;
  updated_at: string;
};

type AnnouncementItem = {
  id: string;
  subject: string;
  body: string;
  sent_at: string;
};

type NotificationState = {
  unread_messages: number;
  open_tasks: number;
  recent_unread: RecentUnread[];
  unread_announcements: AnnouncementItem[];
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function PortalShell({
  userName,
  showBillingNav,
  children,
}: {
  userName: string;
  showBillingNav: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationState | null>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  // Close bell panel when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadNotifications() {
      try {
        const res = await fetch("/api/portal/notifications", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) {
          setNotifications({
            unread_messages: Number(data.unread_messages ?? 0),
            open_tasks: Number(data.open_tasks ?? 0),
            recent_unread: (data.recent_unread ?? []) as RecentUnread[],
            unread_announcements: (data.unread_announcements ?? []) as AnnouncementItem[],
          });
        }
      } catch {
        // Ignore transient polling failures.
      }
    }

    loadNotifications();
    const intervalId = setInterval(loadNotifications, 20000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  async function dismissAnnouncement(id: string) {
    setNotifications((prev) =>
      prev
        ? { ...prev, unread_announcements: prev.unread_announcements.filter((a) => a.id !== id) }
        : prev
    );
    await fetch("/api/portal/announcements/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ announcement_id: id }),
    }).catch((err) => console.error("[portal] mark announcement read failed:", err));
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white shadow-lg transform transition-transform lg:translate-x-0 lg:static lg:z-auto ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between h-16 px-6 border-b">
          <Link href="/portal" className="text-xl font-bold text-gray-900">
            JobGenius
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 rounded hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="p-4 space-y-1">
          {NAV_ITEMS.filter((item) => showBillingNav || item.href !== "/portal/billing").map((item) => {
            const isActive =
              item.href === "/portal"
                ? pathname === "/portal"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-violet-50 text-violet-700"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <NavIcon icon={item.icon} />
                {item.label}
                {item.href === "/portal/conversations" &&
                  ((notifications?.unread_messages ?? 0) > 0 ||
                    (notifications?.open_tasks ?? 0) > 0) && (
                    <span className="ml-auto flex items-center gap-1">
                      {(notifications?.open_tasks ?? 0) > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">
                          {notifications?.open_tasks ?? 0}T
                        </span>
                      )}
                      {(notifications?.unread_messages ?? 0) > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700">
                          {notifications?.unread_messages ?? 0}
                        </span>
                      )}
                    </span>
                  )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white shadow-sm h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-md hover:bg-gray-100"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex items-center gap-3 ml-auto">
            {/* Notification bell */}
            <div ref={bellRef} className="relative">
              <button
                onClick={() => setBellOpen((o) => !o)}
                className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                aria-label="Notifications"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {(notifications?.unread_messages ?? 0) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {(notifications?.unread_messages ?? 0) > 9 ? "9+" : notifications?.unread_messages}
                  </span>
                )}
              </button>

              {/* Dropdown panel */}
              {bellOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <span className="text-sm font-semibold text-gray-900">Notifications</span>
                    {(notifications?.unread_messages ?? 0) > 0 && (
                      <span className="text-xs text-gray-500">
                        {notifications?.unread_messages} unread
                      </span>
                    )}
                  </div>

                  {(notifications?.recent_unread ?? []).length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-gray-400">
                      No new messages
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {(notifications?.recent_unread ?? []).map((item) => (
                        <Link
                          key={item.conversation_id}
                          href={`/portal/conversations/${item.conversation_id}`}
                          onClick={() => setBellOpen(false)}
                          className="block px-4 py-3 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`flex-shrink-0 inline-block w-1.5 h-1.5 rounded-full ${
                                item.conversation_type === "task"
                                  ? "bg-amber-400"
                                  : item.conversation_type === "application_question"
                                  ? "bg-purple-400"
                                  : "bg-violet-400"
                              }`} />
                              <p className="text-sm font-medium text-gray-900 truncate">{item.subject}</p>
                            </div>
                            <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(item.updated_at)}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-gray-500 line-clamp-2 pl-3">{item.preview}</p>
                        </Link>
                      ))}
                    </div>
                  )}

                  <div className="px-4 py-2.5 border-t border-gray-100">
                    <Link
                      href="/portal/conversations"
                      onClick={() => setBellOpen(false)}
                      className="text-xs font-medium text-violet-600 hover:text-violet-700"
                    >
                      View all conversations →
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <span className="text-sm text-gray-600 hidden sm:block">{userName}</span>
            <LogoutButton />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
          {/* Announcement banners from superadmin */}
          {(notifications?.unread_announcements ?? []).map((ann) => (
            <div
              key={ann.id}
              className="mb-4 bg-violet-600 text-white rounded-xl px-5 py-4 flex items-start justify-between gap-4 shadow-sm"
            >
              <div className="flex items-start gap-3 min-w-0">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                </svg>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{ann.subject}</p>
                  <p className="text-sm text-violet-100 mt-0.5 whitespace-pre-line">{ann.body}</p>
                </div>
              </div>
              <button
                onClick={() => dismissAnnouncement(ann.id)}
                className="flex-shrink-0 p-1 rounded hover:bg-violet-500 transition-colors"
                aria-label="Dismiss"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          {children}
        </main>
      </div>
    </div>
  );
}
