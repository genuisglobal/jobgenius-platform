"use client";

import { useState } from "react";

type InterviewRow = {
  id: string;
  job_post_id: string;
  job_seeker_id: string;
  account_manager_id: string;
  scheduled_at: string | null;
  duration_min: number;
  interview_type: string;
  meeting_link: string | null;
  status: string;
  candidate_token: string;
  created_at: string;
  job_posts:
    | { title: string; company: string | null }
    | Array<{ title: string; company: string | null }>
    | null;
  job_seekers:
    | { full_name: string | null; email: string | null }
    | Array<{ full_name: string | null; email: string | null }>
    | null;
};

type Props = {
  interviews: InterviewRow[];
};

type Tab = "upcoming" | "past" | "cancelled";

const statusColors: Record<string, string> = {
  pending_candidate: "#f59e0b",
  confirmed: "#7c3aed",
  completed: "#16a34a",
  cancelled: "#dc2626",
  no_show: "#9333ea",
};

export default function InterviewsClient({ interviews }: Props) {
  const [tab, setTab] = useState<Tab>("upcoming");
  const [busyId, setBusyId] = useState<string | null>(null);

  const now = new Date();

  const filtered = interviews.filter((i) => {
    if (tab === "upcoming") {
      return (
        (i.status === "pending_candidate" || i.status === "confirmed") &&
        (!i.scheduled_at || new Date(i.scheduled_at) >= now)
      );
    }
    if (tab === "past") {
      return (
        i.status === "completed" ||
        i.status === "no_show" ||
        (i.status === "confirmed" && i.scheduled_at && new Date(i.scheduled_at) < now)
      );
    }
    return i.status === "cancelled";
  });

  async function handleAction(interviewId: string, action: string) {
    setBusyId(interviewId);
    try {
      if (action === "cancel") {
        await fetch(`/api/interviews/${interviewId}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cancelled_by: "recruiter" }),
        });
      } else {
        await fetch(`/api/interviews/${interviewId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: action }),
        });
      }
      window.location.reload();
    } finally {
      setBusyId(null);
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "upcoming", label: "Upcoming" },
    { key: "past", label: "Past" },
    { key: "cancelled", label: "Cancelled" },
  ];

  return (
    <div>
      <nav style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "8px 16px",
              border: tab === t.key ? "2px solid #7c3aed" : "1px solid #e5e7eb",
              borderRadius: 8,
              background: tab === t.key ? "#eff6ff" : "#fff",
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {filtered.length === 0 ? (
        <p>No interviews in this category.</p>
      ) : (
        <ul style={{ display: "grid", gap: 12, listStyle: "none", padding: 0 }}>
          {filtered.map((i) => {
            const post = Array.isArray(i.job_posts) ? i.job_posts[0] : i.job_posts;
            const seeker = Array.isArray(i.job_seekers) ? i.job_seekers[0] : i.job_seekers;
            const dateStr = i.scheduled_at
              ? new Date(i.scheduled_at).toLocaleString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "Pending";

            return (
              <li
                key={i.id}
                style={{
                  border: "1px solid #e5e7eb",
                  padding: 12,
                  borderRadius: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>{post?.title ?? "Untitled"}</strong>
                  <span
                    style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: statusColors[i.status] ?? "#6b7280",
                      color: "#fff",
                    }}
                  >
                    {i.status.replace("_", " ")}
                  </span>
                </div>
                {post?.company && <div>{post.company}</div>}
                <div>
                  Candidate: {seeker?.full_name ?? "Unknown"}{" "}
                  {seeker?.email ? `(${seeker.email})` : ""}
                </div>
                <div>{dateStr} &middot; {i.duration_min} min &middot; {i.interview_type.replace("_", "-")}</div>
                {i.meeting_link && (
                  <div>
                    <a href={i.meeting_link} target="_blank" rel="noopener noreferrer">
                      Meeting Link
                    </a>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  {(i.status === "pending_candidate" || i.status === "confirmed") && (
                    <button
                      onClick={() => handleAction(i.id, "cancel")}
                      disabled={busyId === i.id}
                      style={{ padding: "4px 12px", borderRadius: 4, border: "1px solid #dc2626", color: "#dc2626", background: "#fff", cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                  )}
                  {i.status === "confirmed" && i.scheduled_at && new Date(i.scheduled_at) < now && (
                    <>
                      <button
                        onClick={() => handleAction(i.id, "completed")}
                        disabled={busyId === i.id}
                        style={{ padding: "4px 12px", borderRadius: 4, border: "1px solid #16a34a", color: "#16a34a", background: "#fff", cursor: "pointer" }}
                      >
                        Mark Complete
                      </button>
                      <button
                        onClick={() => handleAction(i.id, "no_show")}
                        disabled={busyId === i.id}
                        style={{ padding: "4px 12px", borderRadius: 4, border: "1px solid #9333ea", color: "#9333ea", background: "#fff", cursor: "pointer" }}
                      >
                        No-Show
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
