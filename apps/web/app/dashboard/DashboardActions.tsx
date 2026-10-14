"use client";

import { useState } from "react";

export function RunMatchingButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const runMatching = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/match/run-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ only_unscored: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult(data.error || "Matching failed.");
      } else {
        setResult(
          `Processed ${data.seekers_processed ?? 0} seekers, scored ${data.jobs_scored ?? 0} jobs.`
        );
      }
    } catch {
      setResult("Network error.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={runMatching}
        disabled={running}
        className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
      >
        {running ? "Running..." : "Run Matching"}
      </button>
      {result && (
        <span className="text-sm text-gray-600">{result}</span>
      )}
    </div>
  );
}

export function TopOppQueueButton({
  jobSeekerId,
  jobPostId,
  alreadyQueued,
}: {
  jobSeekerId: string;
  jobPostId: string;
  alreadyQueued: boolean;
}) {
  const [queued, setQueued] = useState(alreadyQueued);
  const [loading, setLoading] = useState(false);

  const queue = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/am/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_seeker_id: jobSeekerId, job_post_id: jobPostId }),
      });
      if (res.ok) {
        setQueued(true);
      }
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  };

  if (queued) {
    return (
      <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">
        Queued
      </span>
    );
  }

  return (
    <button
      onClick={queue}
      disabled={loading}
      className="px-3 py-1 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
    >
      {loading ? "..." : "Queue"}
    </button>
  );
}
