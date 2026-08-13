"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  isAdminRole,
  isFinanceRole,
  isPeopleManagerRole,
  normalizeAMRole,
} from "@/lib/auth/roles";
import AttendanceClock from "./AttendanceClock";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
  adminOnly?: boolean;
}

const BASE_NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "home", exact: true },
      { href: "/dashboard/copilot", label: "Control Center", icon: "chart", exact: true },
      { href: "/dashboard/today", label: "Today", icon: "inbox", exact: true },
      { href: "/dashboard/notifications", label: "Notifications", icon: "alert", exact: true },
    ],
  },
  {
    title: "Job Seekers",
    items: [
      { href: "/dashboard/delivery", label: "Delivery Board", icon: "briefcase" },
      { href: "/dashboard/seekers", label: "My Seekers", icon: "users" },
    ],
  },
  {
    title: "Pipeline",
    items: [
      { href: "/dashboard/pipeline", label: "Job Hub", icon: "briefcase" },
      { href: "/dashboard/attention", label: "Needs Attention", icon: "alert" },
      { href: "/dashboard/apply-health", label: "Apply Health", icon: "chart" },
    ],
  },
  {
    title: "Outreach",
    items: [
      { href: "/dashboard/network", label: "Network Hub", icon: "network" },
      { href: "/dashboard/outreach", label: "Outreach CRM", icon: "mail" },
      { href: "/dashboard/outreach/scheduling", label: "Scheduling Links", icon: "calendar" },
    ],
  },
  {
    title: "Interviews",
    items: [
      { href: "/dashboard/interviews", label: "All Interviews", icon: "calendar" },
      { href: "/dashboard/interview-prep", label: "Interview Prep", icon: "book" },
      { href: "/dashboard/interview-slots", label: "Manage Slots", icon: "clock" },
    ],
  },
  {
    title: "Messaging",
    items: [
      { href: "/dashboard/inbox", label: "Inbox", icon: "inbox" },
      { href: "/dashboard/client-reports", label: "Client Reports", icon: "document" },
      { href: "/dashboard/follow-ups", label: "Follow-ups", icon: "mail" },
    ],
  },
  {
    title: "Performance",
    items: [
      { href: "/dashboard/performance", label: "My Performance", icon: "chart" },
      { href: "/dashboard/me/payslips", label: "My Payslips", icon: "credit-card" },
    ],
  },
  {
    title: "Reporting",
    items: [
      { href: "/dashboard/activity-sheet", label: "Activity Sheet", icon: "chart" },
      { href: "/dashboard/attendance", label: "Attendance", icon: "clock" },
    ],
  },
  {
    title: "My Work",
    items: [
      { href: "/dashboard/me/work", label: "Employee Hub", icon: "briefcase" },
      { href: "/dashboard/me/onboarding", label: "Onboarding", icon: "check" },
      { href: "/dashboard/me/permissions", label: "Permissions", icon: "calendar" },
      { href: "/dashboard/me/performance", label: "Scorecards", icon: "chart" },
      { href: "/dashboard/me/probation", label: "Probation", icon: "clock" },
      { href: "/dashboard/me/career", label: "Career Path", icon: "academic" },
      { href: "/dashboard/me/bonuses", label: "Bonuses", icon: "gift" },
      { href: "/dashboard/me/social", label: "Social Fund", icon: "calendar" },
    ],
  },
  {
    title: "Learning",
    items: [
      { href: "/dashboard/learning", label: "Learning Tracks", icon: "academic" },
    ],
  },
];

const ADMIN_NAV_SECTION: NavSection = {
  title: "Administration",
  adminOnly: true,
  items: [
    { href: "/dashboard/admin", label: "Admin Overview", icon: "shield", exact: true },
    { href: "/dashboard/admin/accounts", label: "User Accounts", icon: "user-cog" },
    { href: "/dashboard/admin/job-seekers", label: "All Job Seekers", icon: "users-all" },
    { href: "/dashboard/admin/leads", label: "Lead Queue", icon: "phone" },
    { href: "/dashboard/admin/hiring-partners", label: "Hiring Requests", icon: "briefcase" },
    { href: "/dashboard/admin/intake", label: "Intake Queue", icon: "queue" },
    { href: "/dashboard/admin/capacity", label: "AM Capacity", icon: "chart" },
    { href: "/dashboard/admin/assignments", label: "Assignments", icon: "link" },
    { href: "/dashboard/admin/broadcast", label: "Broadcast", icon: "megaphone" },
    { href: "/dashboard/admin/analytics", label: "Analytics", icon: "analytics" },
    { href: "/dashboard/admin/outcomes", label: "Outcomes", icon: "analytics" },
    { href: "/dashboard/admin/notifications", label: "Internal Notifications", icon: "alert" },
    { href: "/dashboard/admin/application-analytics", label: "App Analytics", icon: "analytics" },
    { href: "/dashboard/admin/adapter-health", label: "Adapter Health", icon: "analytics" },
    { href: "/dashboard/admin/qa", label: "QA Review", icon: "check" },
    { href: "/dashboard/admin/automation", label: "Kill Switches", icon: "alert" },
    { href: "/dashboard/admin/ai-usage", label: "AI Usage", icon: "analytics" },
    { href: "/dashboard/admin/ai-outputs", label: "AI Outputs", icon: "check" },
    { href: "/dashboard/admin/audit", label: "Audit Log", icon: "document" },
    { href: "/dashboard/admin/career-pages", label: "Career Pages", icon: "globe" },
    { href: "/dashboard/admin/host-rules", label: "Host Rules", icon: "globe" },
    { href: "/dashboard/admin/failure-diagnoses", label: "Failure Diagnoses", icon: "alert" },
    { href: "/dashboard/admin/canaries", label: "Canaries", icon: "check" },
    { href: "/dashboard/admin/drift", label: "Drift Center", icon: "alert" },
    { href: "/dashboard/admin/ranker", label: "Learned Ranker", icon: "analytics" },
    { href: "/dashboard/admin/runners", label: "Runner Fleet", icon: "chart" },
    { href: "/dashboard/admin/voice", label: "Voice Automation", icon: "phone" },
    { href: "/dashboard/admin/reports", label: "Report Settings", icon: "document" },
    { href: "/dashboard/admin/referrals", label: "Referrals", icon: "gift" },
    { href: "/dashboard/admin/payroll", label: "Payroll", icon: "credit-card", exact: true },
    { href: "/dashboard/admin/payroll/periods", label: "Pay Periods", icon: "calendar" },
    { href: "/dashboard/billing", label: "Billing", icon: "credit-card" },
  ],
};

const PEOPLE_NAV_SECTION: NavSection = {
  title: "People Ops",
  items: [
    { href: "/dashboard/people", label: "People Overview", icon: "users-all", exact: true },
    { href: "/dashboard/people/employees", label: "Employees", icon: "users" },
    { href: "/dashboard/people/onboarding", label: "Onboarding Queue", icon: "queue" },
    { href: "/dashboard/people/permissions", label: "Permissions", icon: "calendar" },
    { href: "/dashboard/people/scorecards", label: "Scorecards", icon: "chart" },
    { href: "/dashboard/people/probation", label: "Probation", icon: "clock" },
    { href: "/dashboard/people/discipline", label: "Discipline", icon: "alert" },
    { href: "/dashboard/people/leadership", label: "Leadership", icon: "academic" },
    { href: "/dashboard/people/social-leads", label: "Social Leads", icon: "calendar" },
  ],
};

const FINANCE_NAV_SECTION: NavSection = {
  title: "Finance",
  items: [
    { href: "/dashboard/finance", label: "Finance Overview", icon: "credit-card", exact: true },
    { href: "/dashboard/finance/bonuses", label: "Bonuses", icon: "gift" },
    { href: "/dashboard/finance/social-fund", label: "Social Fund", icon: "calendar" },
  ],
};

type AMRecentUnread = {
  conversation_id: string;
  seeker_id: string;
  subject: string;
  seeker_name: string | null;
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

type AMNotificationState = {
  unread_messages: number;
  recent_unread: AMRecentUnread[];
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

function NavIcon({ icon, className }: { icon: string; className?: string }) {
  const cls = className || "w-5 h-5";
  switch (icon) {
    case "home":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
        </svg>
      );
    case "users":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case "users-all":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      );
    case "queue":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      );
    case "alert":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      );
    case "check":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "mail":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
    case "calendar":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case "book":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      );
    case "clock":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "shield":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      );
    case "user-cog":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case "link":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      );
    case "globe":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
      );
    case "briefcase":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
    case "academic":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" />
        </svg>
      );
    case "network":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
    case "credit-card":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      );
    case "phone":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a2 2 0 011.99 1.753l.416 3.328a2 2 0 01-.577 1.694l-1.57 1.57a16 16 0 006.364 6.364l1.57-1.57a2 2 0 011.694-.577l3.327.416A2 2 0 0121 15.72V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
      );
    case "document":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 4H7a2 2 0 01-2-2V6a2 2 0 012-2h5l5 5v9a2 2 0 01-2 2z" />
        </svg>
      );
    case "megaphone":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
        </svg>
      );
    case "inbox":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      );
    case "chart":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      );
    case "analytics":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case "gift":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
        </svg>
      );
    default:
      return null;
  }
}

export default function DashboardShell({
  userName,
  userRole,
  children,
}: {
  userName: string;
  userRole: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [amNotifications, setAmNotifications] = useState<AMNotificationState | null>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  const isAdmin = isAdminRole(userRole);
  const canAccessPeople = isPeopleManagerRole(userRole);
  const canAccessFinance = isFinanceRole(userRole) || canAccessPeople;

  // Close bell panel on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Poll for unread seeker messages every 20s
  useEffect(() => {
    let cancelled = false;

    async function loadNotifications() {
      try {
        const res = await fetch("/api/am/notifications", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) {
          setAmNotifications({
            unread_messages: Number(data.unread_messages ?? 0),
            recent_unread: (data.recent_unread ?? []) as AMRecentUnread[],
            unread_announcements: (data.unread_announcements ?? []) as AnnouncementItem[],
          });
        }
      } catch {
        // Ignore transient failures.
      }
    }

    loadNotifications();
    const id = setInterval(loadNotifications, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const navSections = useMemo(() => {
    if (isAdmin) {
      const [overviewSection, ...remainingSections] = BASE_NAV_SECTIONS;
      return [
        overviewSection,
        ADMIN_NAV_SECTION,
        FINANCE_NAV_SECTION,
        PEOPLE_NAV_SECTION,
        ...remainingSections,
      ];
    }
    if (canAccessPeople) {
      const [overviewSection, ...remainingSections] = BASE_NAV_SECTIONS;
      return [overviewSection, PEOPLE_NAV_SECTION, FINANCE_NAV_SECTION, ...remainingSections];
    }
    if (canAccessFinance) {
      return BASE_NAV_SECTIONS.filter((section) =>
        ["Overview", "My Work", "Performance"].includes(section.title)
      ).flatMap((section, index) =>
        index === 0 ? [section, FINANCE_NAV_SECTION] : [section]
      );
    }
    return BASE_NAV_SECTIONS;
  }, [canAccessFinance, canAccessPeople, isAdmin]);

  async function dismissAnnouncement(id: string) {
    setAmNotifications((prev) =>
      prev
        ? { ...prev, unread_announcements: prev.unread_announcements.filter((a) => a.id !== id) }
        : prev
    );
    await fetch("/api/am/announcements/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ announcement_id: id }),
    }).catch((err) => console.error("[am-dashboard] mark announcement read failed:", err));
  }

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  const normalizedRole = normalizeAMRole(userRole);
  const roleLabel =
    normalizedRole === "superadmin"
      ? "Super Admin"
      : normalizedRole === "admin"
      ? "Admin"
      : normalizedRole === "ops_manager"
      ? "Operations Manager"
      : normalizedRole === "accountant"
      ? "Accountant"
      : "Account Manager";

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-gray-900 text-white transform transition-transform lg:translate-x-0 lg:static lg:z-auto ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-800">
          <Link href="/dashboard" className="text-xl font-bold">
            JobGenius
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 rounded hover:bg-gray-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="p-3 space-y-6 overflow-y-auto h-[calc(100vh-4rem)]">
          {navSections.map((section) => (
            <div key={section.title}>
              <h3 className={`px-3 text-xs font-semibold uppercase tracking-wider mb-2 ${
                section.adminOnly ? "text-purple-400" : "text-gray-400"
              }`}>
                {section.title}
              </h3>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const active = isActive(item.href, item.exact);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        active
                          ? section.adminOnly
                            ? "bg-purple-600 text-white"
                            : "bg-violet-600 text-white"
                          : "text-gray-300 hover:bg-gray-800 hover:text-white"
                      }`}
                    >
                      <NavIcon icon={item.icon} />
                      <span className="flex-1">{item.label}</span>
                      {item.href === "/dashboard/inbox" && (amNotifications?.unread_messages ?? 0) > 0 && (
                        <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-red-500 text-white rounded-full">
                          {(amNotifications?.unread_messages ?? 0) > 9 ? "9+" : amNotifications?.unread_messages}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white shadow-sm h-16 flex items-center justify-between px-4 sm:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-md hover:bg-gray-100"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex items-center gap-3 ml-auto">
            {/* Attendance clock — in the header on every page so signing out
                never depends on remembering to navigate somewhere. */}
            <AttendanceClock />

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
                {(amNotifications?.unread_messages ?? 0) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {(amNotifications?.unread_messages ?? 0) > 9 ? "9+" : amNotifications?.unread_messages}
                  </span>
                )}
              </button>

              {bellOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <span className="text-sm font-semibold text-gray-900">Seeker Replies</span>
                    {(amNotifications?.unread_messages ?? 0) > 0 && (
                      <span className="text-xs text-gray-500">
                        {amNotifications?.unread_messages} unread
                      </span>
                    )}
                  </div>

                  {(amNotifications?.recent_unread ?? []).length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-gray-400">
                      No unread replies
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {(amNotifications?.recent_unread ?? []).map((item) => (
                        <Link
                          key={item.conversation_id}
                          href={`/dashboard/seekers/${item.seeker_id}?tab=messages&conversation=${item.conversation_id}`}
                          onClick={() => setBellOpen(false)}
                          className="block px-4 py-3 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              {item.seeker_name && (
                                <p className="text-xs font-semibold text-violet-600 truncate">{item.seeker_name}</p>
                              )}
                              <p className="text-sm font-medium text-gray-900 truncate">{item.subject}</p>
                            </div>
                            <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">{timeAgo(item.updated_at)}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{item.preview}</p>
                        </Link>
                      ))}
                    </div>
                  )}

                  <div className="px-4 py-2.5 border-t border-gray-100">
                    <Link
                      href="/dashboard/seekers"
                      onClick={() => setBellOpen(false)}
                      className="text-xs font-medium text-violet-600 hover:text-violet-700"
                    >
                      View all seekers →
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-900">{userName}</p>
              <p className={`text-xs ${isAdmin ? "text-purple-600 font-medium" : "text-gray-500"}`}>
                {roleLabel}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6 overflow-auto">
          {/* Announcement banners */}
          {(amNotifications?.unread_announcements ?? []).map((ann) => (
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
