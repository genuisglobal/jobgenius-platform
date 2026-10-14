"use client";

import { useEffect, useState } from "react";

type TrackerApp = {
  queue_id: string;
  status: string;
  category: string | null;
  job: { id: string; title: string; company: string; location: string; url: string } | null;
  current_step: string | null;
  ats_type: string | null;
  attempt_count: number;
  timeline: { step: string; event: string; message: string; at: string }[];
  proof_screenshot: string | null;
  queued_at: string;
  updated_at: string;
};

type Summary = {
  total: number;
  queued: number;
  in_progress: number;
  applied: number;
  failed: number;
};

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  QUEUED: { color: "bg-yellow-100 text-yellow-800", label: "Queued", icon: "clock" },
  READY: { color: "bg-violet-100 text-violet-800", label: "Starting...", icon: "play" },
  RUNNING: { color: "bg-violet-100 text-violet-800", label: "In Progress", icon: "spinner" },
  RETRYING: { color: "bg-orange-100 text-orange-800", label: "Retrying", icon: "refresh" },
  APPLIED: { color: "bg-green-100 text-green-800", label: "Applied!", icon: "check" },
  FAILED: { color: "bg-red-100 text-red-800", label: "Failed", icon: "x" },
  NEEDS_ATTENTION: { color: "bg-orange-100 text-orange-800", label: "Needs Help", icon: "alert" },
  PAUSED: { color: "bg-gray-100 text-gray-600", label: "Paused", icon: "pause" },
};

const STEP_LABELS: Record<string, string> = {
  OPEN_JOB: "Opening job page",
  CLICK_EASY_APPLY: "Clicking apply",
  TRY_APPLY_ENTRY: "Finding apply button",
  START_APPLY: "Starting application",
  LOGIN_OR_CONTINUE: "Logging in",
  FILL_FORM: "Filling out form",
  FILL_KNOWN: "Entering your info",
  UPLOAD_RESUME: "Uploading resume",
  REVIEW: "Reviewing application",
  SUBMIT: "Submitting",
  CONFIRMATION: "Confirming submission",
};

export default function TrackerClient() {
  const [data, setData] = useState<{ summary: Summary; applications: TrackerApp[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  function load() {
    fetch("/api/portal/application-tracker")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000); // Auto-refresh every 15s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-200 rounded w-64 animate-pulse" />
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!data) return <p className="text-gray-500">Failed to load tracker</p>;

  const filtered = data.applications.filter((a) => {
    if (filter === "all") return true;
    if (filter === "active") return ["QUEUED", "READY", "RUNNING", "RETRYING"].includes(a.status);
    if (filter === "applied") return a.status === "APPLIED";
    if (filter === "failed") return ["FAILED", "NEEDS_ATTENTION"].includes(a.status);
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Application Tracker</h1>
        <p className="text-sm text-gray-500 mt-1">
          Real-time status of your job applications. Auto-refreshes every 15 seconds.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Total" value={data.summary.total} color="text-gray-900" />
        <SummaryCard label="In Progress" value={data.summary.in_progress + data.summary.queued} color="text-violet-600" />
        <SummaryCard label="Applied" value={data.summary.applied} color="text-green-600" />
        <SummaryCard label="Failed" value={data.summary.failed} color="text-red-600" />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b">
        {[
          { id: "all", label: "All" },
          { id: "active", label: "Active" },
          { id: "applied", label: "Applied" },
          { id: "failed", label: "Failed" },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              filter === f.id ? "border-violet-600 text-violet-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Application list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            {filter === "all" ? "No applications yet. Your AM is working on it!" : "No applications in this category."}
          </div>
        ) : (
          filtered.map((app) => {
            const config = STATUS_CONFIG[app.status] ?? STATUS_CONFIG.QUEUED;
            const isExpanded = expandedId === app.queue_id;
            const isActive = ["RUNNING", "READY", "RETRYING"].includes(app.status);

            return (
              <div key={app.queue_id} className={`bg-white rounded-xl border overflow-hidden ${isActive ? "border-violet-200 shadow-sm" : ""}`}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : app.queue_id)}
                  className="w-full px-5 py-4 flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    {/* Status indicator */}
                    <div className="relative">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}>
                        {config.label}
                      </span>
                      {isActive && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-violet-500 rounded-full animate-pulse" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {app.job?.title ?? "Unknown Position"}
                      </p>
                      <p className="text-sm text-gray-500 truncate">
                        {app.job?.company ?? "Unknown Company"}{app.job?.location ? ` — ${app.job.location}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {/* Current step for active applications */}
                    {isActive && app.current_step && (
                      <span className="hidden sm:inline text-xs text-violet-600 bg-violet-50 px-2 py-1 rounded">
                        {STEP_LABELS[app.current_step] ?? app.current_step}
                      </span>
                    )}

                    {app.attempt_count > 1 && (
                      <span className="text-xs text-gray-400">Attempt {app.attempt_count}</span>
                    )}

                    <span className="text-xs text-gray-400">
                      {timeAgo(app.updated_at)}
                    </span>

                    <span className="text-gray-400">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t px-5 py-4 space-y-4">
                    {/* Progress bar for active */}
                    {isActive && app.ats_type && (
                      <StepProgress atsType={app.ats_type} currentStep={app.current_step} />
                    )}

                    {/* Timeline */}
                    {app.timeline.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Activity</h4>
                        <div className="space-y-2">
                          {app.timeline.slice(0, 10).map((t, i) => (
                            <div key={i} className="flex items-start gap-3 text-sm">
                              <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                                t.event === "FAILED" ? "bg-red-400" :
                                t.event === "SUCCESS" ? "bg-green-400" : "bg-violet-400"
                              }`} />
                              <div>
                                <span className="text-gray-700">{STEP_LABELS[t.step] ?? t.step}</span>
                                {t.message && <span className="text-gray-400 ml-1">— {t.message}</span>}
                                <span className="text-xs text-gray-400 ml-2">
                                  {new Date(t.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Proof screenshot for completed */}
                    {app.status === "APPLIED" && app.proof_screenshot && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Submission Proof</h4>
                        <img
                          src={`/api/apply/screenshot/view?path=${encodeURIComponent(app.proof_screenshot)}`}
                          alt="Application confirmation"
                          className="rounded-lg border max-h-64 w-auto"
                          loading="lazy"
                        />
                      </div>
                    )}

                    {/* Job link */}
                    {app.job?.url && (
                      <a
                        href={app.job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-violet-600 hover:text-violet-800"
                      >
                        View job posting →
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

const ATS_STEPS: Record<string, string[]> = {
  LINKEDIN: ["OPEN_JOB", "CLICK_EASY_APPLY", "FILL_FORM", "UPLOAD_RESUME", "SUBMIT", "CONFIRMATION"],
  GREENHOUSE: ["OPEN_JOB", "FILL_FORM", "UPLOAD_RESUME", "SUBMIT", "CONFIRMATION"],
  WORKDAY: ["OPEN_JOB", "START_APPLY", "LOGIN_OR_CONTINUE", "FILL_FORM", "UPLOAD_RESUME", "REVIEW", "SUBMIT", "CONFIRMATION"],
  LEVER: ["OPEN_JOB", "TRY_APPLY_ENTRY", "FILL_FORM", "UPLOAD_RESUME", "SUBMIT", "CONFIRMATION"],
  SMARTRECRUITERS: ["OPEN_JOB", "TRY_APPLY_ENTRY", "FILL_FORM", "UPLOAD_RESUME", "SUBMIT", "CONFIRMATION"],
  GENERIC: ["OPEN_JOB", "TRY_APPLY_ENTRY", "FILL_FORM", "UPLOAD_RESUME", "SUBMIT", "CONFIRMATION"],
};

function StepProgress({ atsType, currentStep }: { atsType: string; currentStep: string | null }) {
  const steps = ATS_STEPS[atsType] ?? ATS_STEPS.GENERIC;
  const currentIdx = currentStep ? steps.indexOf(currentStep) : -1;

  return (
    <div className="flex items-center gap-1">
      {steps.map((step, i) => {
        const isDone = i < currentIdx;
        const isCurrent = i === currentIdx;

        return (
          <div key={step} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div className={`w-full h-1.5 rounded-full ${
                isDone ? "bg-green-400" : isCurrent ? "bg-violet-400 animate-pulse" : "bg-gray-200"
              }`} />
              <span className={`text-[9px] mt-1 ${
                isCurrent ? "text-violet-600 font-medium" : isDone ? "text-green-600" : "text-gray-400"
              }`}>
                {STEP_LABELS[step] ?? step}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
