"use client";

import { useMemo, useState } from "react";
import { isManualQueueCategory } from "@/lib/queue-categories";

type QueueItem = {
  job_post_id: string;
  title: string;
  company: string | null;
  location: string | null;
  score: number;
  reasons: Record<string, number> | null;
  decision: string | null;
  created_at: string | null;
  queue_id: string | null;
  queue_status: string | null;
  queue_category: string | null;
  last_error: string | null;
  run_id: string | null;
  ats_type: string | null;
  run_status: string | null;
  current_step: string | null;
  step_attempts: number | null;
  total_attempts: number | null;
  max_step_retries: number | null;
  run_last_error: string | null;
  last_error_code: string | null;
  last_seen_url: string | null;
  needs_attention_reason: string | null;
  events: Array<{
    step: string;
    event_type: string;
    message: string | null;
    created_at: string;
  }>;
};

type QueueClientProps = {
  jobSeekerId: string;
  matchThreshold: number;
  items: QueueItem[];
};

const tabs = [
  "Matched",
  "Below Threshold",
  "Manual",
  "In Progress",
  "Applied",
  "Needs Attention",
  "Failed",
] as const;

type TabKey = (typeof tabs)[number];

const scoreLabels: Record<string, string> = {
  skills: "Skills",
  title_similarity: "Title similarity",
  location: "Location",
  seniority: "Seniority",
  work_type: "Work type",
  salary: "Salary",
};

function formatScore(value: number) {
  return `${Math.round(value)}%`;
}

function getCategory(item: QueueItem, threshold: number) {
  if (item.run_status === "NEEDS_ATTENTION") return "Needs Attention";
  if (item.run_status === "FAILED") return "Failed";
  if (item.run_status === "APPLIED" || item.run_status === "COMPLETED") {
    return "Applied";
  }
  if (
    item.run_status === "RUNNING" ||
    item.run_status === "RETRYING" ||
    item.run_status === "READY"
  ) {
    return "In Progress";
  }
  if (isManualQueueCategory(item.queue_category) || item.decision === "OVERRIDDEN_IN") {
    return "Manual";
  }
  if (item.score >= threshold && item.decision !== "OVERRIDDEN_OUT") {
    return "Matched";
  }
  return "Below Threshold";
}

export default function QueueClient({
  jobSeekerId,
  matchThreshold,
  items,
}: QueueClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("Matched");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [thresholdInput, setThresholdInput] = useState(matchThreshold.toString());
  const [manualJobId, setManualJobId] = useState("");

  const grouped = useMemo(() => {
    const groups: Record<TabKey, QueueItem[]> = {
      Matched: [],
      "Below Threshold": [],
      Manual: [],
      "In Progress": [],
      Applied: [],
      "Needs Attention": [],
      Failed: [],
    };

    for (const item of items) {
      const category = getCategory(item, matchThreshold) as TabKey;
      groups[category].push(item);
    }

    return groups;
  }, [items, matchThreshold]);

  const list = grouped[activeTab];

  async function handleOverride(jobPostId: string, decision: string) {
    setBusyId(jobPostId);
    try {
      const response = await fetch("/api/routing/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: jobSeekerId,
          job_post_id: jobPostId,
          decision,
        }),
      });

      if (!response.ok) {
        console.error("Override failed.");
        return;
      }

      window.location.reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handleEnqueue(jobPostId: string) {
    setBusyId(jobPostId);
    try {
      const response = await fetch("/api/queue/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: jobSeekerId,
          job_post_id: jobPostId,
          category: "manual",
        }),
      });

      if (!response.ok) {
        console.error("Enqueue failed.");
        return;
      }

      window.location.reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handleManualEnqueue() {
    if (!manualJobId.trim()) {
      return;
    }
    setBusyId("manual-enqueue");
    try {
      const response = await fetch("/api/queue/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: jobSeekerId,
          job_post_id: manualJobId.trim(),
          category: "manual",
        }),
      });

      if (!response.ok) {
        console.error("Manual enqueue failed.");
        return;
      }

      window.location.reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handleStart(queueId: string) {
    setBusyId(queueId);
    try {
      const response = await fetch("/api/apply/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queue_id: queueId }),
      });

      if (!response.ok) {
        console.error("Start failed.");
        return;
      }

      const data = await response.json();
      if (data.blocked) {
        console.error("Blocked:", data.reason);
      }

      window.location.reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handlePause(runId: string) {
    const reason = window.prompt("Reason for attention (CAPTCHA/OTP_REQUIRED/etc)?", "CAPTCHA");
    setBusyId(runId);
    try {
      const response = await fetch("/api/apply/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId, reason }),
      });

      if (!response.ok) {
        console.error("Pause failed.");
        return;
      }

      window.location.reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handleRetry(runId: string) {
    setBusyId(runId);
    try {
      const response = await fetch("/api/apply/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId }),
      });

      if (!response.ok) {
        console.error("Retry failed.");
        return;
      }

      window.location.reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handleResume(runId: string) {
    setBusyId(runId);
    try {
      const response = await fetch("/api/apply/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId }),
      });

      if (!response.ok) {
        console.error("Resume failed.");
        return;
      }

      window.location.reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handleMark(runId: string, status: "FAILED" | "CANCELLED") {
    setBusyId(runId);
    try {
      const endpoint =
        status === "FAILED" ? "/api/apply/fail" : "/api/apply/fail";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_id: runId,
          reason: status === "FAILED" ? "FAILED" : "CANCELLED",
        }),
      });

      if (!response.ok) {
        console.error("Mark failed.");
        return;
      }

      window.location.reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handleApplied(runId: string) {
    setBusyId(runId);
    try {
      const response = await fetch("/api/apply/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId }),
      });

      if (!response.ok) {
        console.error("Complete failed.");
        return;
      }

      window.location.reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handleThresholdUpdate() {
    const nextValue = Number(thresholdInput);
    if (Number.isNaN(nextValue) || nextValue < 0 || nextValue > 100) {
      console.error("Invalid threshold.");
      return;
    }
    setBusyId("threshold");
    try {
      const response = await fetch(`/api/jobseekers/${jobSeekerId}/threshold`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_threshold: nextValue }),
      });

      if (!response.ok) {
        console.error("Threshold update failed.");
        return;
      }

      window.location.reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <div style={{ display: "grid", gap: "8px", marginBottom: "16px" }}>
        <div>
          <strong>Match threshold</strong>{" "}
          <input
            type="number"
            min={0}
            max={100}
            value={thresholdInput}
            onChange={(event) => setThresholdInput(event.target.value)}
            style={{ width: "80px", marginLeft: "8px" }}
          />
          <button
            type="button"
            onClick={handleThresholdUpdate}
            disabled={busyId === "threshold"}
            style={{ marginLeft: "8px" }}
          >
            Update threshold
          </button>
        </div>
        <div>
          <strong>Manual enqueue</strong>{" "}
          <input
            type="text"
            value={manualJobId}
            onChange={(event) => setManualJobId(event.target.value)}
            placeholder="Job post ID"
            style={{ width: "260px", marginLeft: "8px" }}
          />
          <button
            type="button"
            onClick={handleManualEnqueue}
            disabled={busyId === "manual-enqueue"}
            style={{ marginLeft: "8px" }}
          >
            Enqueue job
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        {tabs.map((tab) => (
          <button key={tab} type="button" onClick={() => setActiveTab(tab)}>
            {tab} ({grouped[tab].length})
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p>No jobs in this category.</p>
      ) : (
        <ul style={{ display: "grid", gap: "12px" }}>
          {list.map((item) => (
            <li
              key={item.job_post_id}
              style={{
                border: "1px solid #e5e7eb",
                padding: "12px",
                borderRadius: "8px",
              }}
            >
              <strong>{item.title}</strong>
              {item.company ? ` - ${item.company}` : ""}
              {item.location ? ` (${item.location})` : ""}
              <div>
                Category: {getCategory(item, matchThreshold)}
              </div>
              <div>ATS: {item.ats_type ?? "Unknown"}</div>
              <div>Score: {item.score}</div>
              <div>Decision: {item.decision ?? "NONE"}</div>
              {item.reasons ? (
                <div>
                  Score breakdown:
                  <ul>
                    {Object.entries(item.reasons).map(([key, value]) => (
                      <li key={key}>
                        {scoreLabels[key] ?? key}: {formatScore(value)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div>
                Status: {item.run_status ?? item.queue_status ?? "NOT_QUEUED"}
              </div>
              <div>Step: {item.current_step ?? "N/A"}</div>
              <div>
                Retries: {item.step_attempts ?? 0}/
                {item.max_step_retries ?? 0} (total {item.total_attempts ?? 0})
              </div>
              {item.last_error_code ? (
                <div style={{ color: "#b91c1c" }}>
                  Error code: {item.last_error_code}
                </div>
              ) : null}
              {item.needs_attention_reason ? (
                <div style={{ color: "#b91c1c" }}>
                  Needs attention: {item.needs_attention_reason}
                </div>
              ) : null}
              {item.run_last_error ? (
                <div style={{ color: "#b91c1c" }}>
                  Run error: {item.run_last_error}
                </div>
              ) : null}
              {item.last_seen_url ? (
                <div>Last URL: {item.last_seen_url}</div>
              ) : null}
              <div>
                Created:{" "}
                {item.created_at
                  ? new Date(item.created_at).toLocaleString()
                  : "-"}
              </div>
              {item.last_error ? (
                <div style={{ color: "#b91c1c" }}>
                  Queue error: {item.last_error}
                </div>
              ) : null}
              {item.events.length > 0 ? (
                <div>
                  Recent events:
                  <ul>
                    {item.events.map((event) => (
                      <li key={`${item.job_post_id}-${event.created_at}`}>
                        {event.event_type} {event.step}{" "}
                        {event.message ? `- ${event.message}` : ""} (
                        {new Date(event.created_at).toLocaleString()})
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() =>
                    handleOverride(item.job_post_id, "OVERRIDDEN_IN")
                  }
                  disabled={busyId === item.job_post_id}
                >
                  Override In
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleOverride(item.job_post_id, "OVERRIDDEN_OUT")
                  }
                  disabled={busyId === item.job_post_id}
                >
                  Override Out
                </button>
                <button
                  type="button"
                  onClick={() => handleEnqueue(item.job_post_id)}
                  disabled={busyId === item.job_post_id}
                >
                  Enqueue Application
                </button>
                {item.queue_id ? (
                  <button
                    type="button"
                    onClick={() => handleStart(item.queue_id as string)}
                    disabled={busyId === item.queue_id}
                  >
                    Start
                  </button>
                ) : null}
                {item.run_id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handlePause(item.run_id as string)}
                      disabled={busyId === item.run_id}
                    >
                      Pause
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRetry(item.run_id as string)}
                      disabled={busyId === item.run_id}
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplied(item.run_id as string)}
                      disabled={busyId === item.run_id}
                    >
                      Mark Applied
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResume(item.run_id as string)}
                      disabled={busyId === item.run_id}
                    >
                      Resolve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMark(item.run_id as string, "FAILED")}
                      disabled={busyId === item.run_id}
                    >
                      Mark Failed
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleMark(item.run_id as string, "CANCELLED")
                      }
                      disabled={busyId === item.run_id}
                    >
                      Dismiss
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
