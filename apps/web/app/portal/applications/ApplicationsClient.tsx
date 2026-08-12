"use client";

import { useState, useMemo } from "react";

interface JobPost {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  url: string | null;
  work_type: string | null;
}

interface QueuedApp {
  id: string;
  job_post_id?: string;
  status: string;
  category?: string;
  created_at: string;
  updated_at?: string;
  job_posts?: JobPost | JobPost[] | null;
  // Legacy fields (fallback if no join)
  job_url?: string;
  company_name?: string;
  role_title?: string;
}

interface AppRun {
  id: string;
  job_post_id?: string;
  status: string;
  created_at: string;
  updated_at?: string;
  error_message?: string;
  resume_url_used?: string | null;
  resume_source?: string | null;
  job_posts?: JobPost | JobPost[] | null;
  // Legacy fields
  job_url?: string;
  company_name?: string;
  role_title?: string;
}

const STATUS_COLORS: Record<string, string> = {
  QUEUED: "bg-yellow-100 text-yellow-800",
  IN_PROGRESS: "bg-violet-100 text-violet-800",
  RUNNING: "bg-violet-100 text-violet-800",
  READY: "bg-violet-100 text-violet-800",
  RETRYING: "bg-violet-100 text-violet-800",
  APPLIED: "bg-green-100 text-green-800",
  COMPLETED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-600",
  NEEDS_ATTENTION: "bg-orange-100 text-orange-800",
  PAUSED: "bg-gray-100 text-gray-600",
};

const STATUS_ICONS: Record<string, string> = {
  QUEUED: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  IN_PROGRESS: "M13 10V3L4 14h7v7l9-11h-7z",
  RUNNING: "M13 10V3L4 14h7v7l9-11h-7z",
  APPLIED: "M5 13l4 4L19 7",
  COMPLETED: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  FAILED: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z",
  NEEDS_ATTENTION: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
};

export default function ApplicationsClient({
  initialQueued,
  initialRuns,
}: {
  initialQueued: QueuedApp[];
  initialRuns: AppRun[];
}) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Helper to extract job post from Supabase join (may be array or single object)
  function getJobPost(jp: JobPost | JobPost[] | null | undefined): JobPost | null {
    if (!jp) return null;
    if (Array.isArray(jp)) return jp[0] || null;
    return jp;
  }

  // Combine into a single list with enriched data
  const allApps = useMemo(() => {
    const items = [
      ...initialQueued.map((q) => {
        const jp = getJobPost(q.job_posts);
        return {
          id: q.id,
          company: jp?.company || q.company_name || "Unknown",
          role: jp?.title || q.role_title || "Unknown Role",
          location: jp?.location || null,
          workType: jp?.work_type || null,
          status: q.status,
          date: q.created_at,
          url: jp?.url || q.job_url || null,
          type: "queued" as const,
          category: q.category || null,
          error: null as string | null,
          resumeUrl: null as string | null,
          resumeSource: null as string | null,
        };
      }),
      ...initialRuns.map((r) => {
        const jp = getJobPost(r.job_posts);
        return {
          id: r.id,
          company: jp?.company || r.company_name || "Unknown",
          role: jp?.title || r.role_title || "Unknown Role",
          location: jp?.location || null,
          workType: jp?.work_type || null,
          status: r.status,
          date: r.updated_at || r.created_at,
          url: jp?.url || r.job_url || null,
          type: "run" as const,
          error: r.error_message || null,
          category: null as string | null,
          resumeUrl: r.resume_url_used ?? null,
          resumeSource: r.resume_source ?? null,
        };
      }),
    ];
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  }, [initialQueued, initialRuns]);

  const filtered = useMemo(() => {
    return allApps.filter((app) => {
      if (filter !== "all" && app.status !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          app.company.toLowerCase().includes(q) ||
          app.role.toLowerCase().includes(q) ||
          (app.location?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [allApps, filter, search]);

  const statuses = useMemo(
    () => Array.from(new Set(allApps.map((a) => a.status))),
    [allApps]
  );

  // Compute stats
  const stats = useMemo(() => {
    const queued = allApps.filter((a) => a.status === "QUEUED").length;
    const inProgress = allApps.filter((a) =>
      ["IN_PROGRESS", "RUNNING", "READY", "RETRYING"].includes(a.status)
    ).length;
    const applied = allApps.filter((a) =>
      ["APPLIED", "COMPLETED"].includes(a.status)
    ).length;
    const failed = allApps.filter((a) =>
      ["FAILED", "NEEDS_ATTENTION"].includes(a.status)
    ).length;
    return { queued, inProgress, applied, failed };
  }, [allApps]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Applications</h1>
        <p className="text-gray-600">
          Track the status of your job applications managed by your account manager.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-2xl font-bold text-yellow-600">{stats.queued}</div>
          <div className="text-xs text-gray-500 mt-1">Queued</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-2xl font-bold text-violet-600">{stats.inProgress}</div>
          <div className="text-xs text-gray-500 mt-1">In Progress</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{stats.applied}</div>
          <div className="text-xs text-gray-500 mt-1">Applied</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
          <div className="text-xs text-gray-500 mt-1">Needs Attention</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by company, role, or location..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          >
            <option value="all">All Statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Showing {filtered.length} of {allApps.length} applications
        </div>
      </div>

      {/* Application List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          <svg
            className="w-12 h-12 mx-auto mb-4 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <p className="font-medium">No applications found</p>
          <p className="text-sm mt-1">
            {search || filter !== "all"
              ? "Try adjusting your search or filter."
              : "Your account manager will start queuing applications for you soon."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((app) => (
            <div
              key={`${app.type}-${app.id}`}
              className="bg-white rounded-lg shadow p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {/* Status icon */}
                  <div
                    className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                      STATUS_COLORS[app.status]?.replace("text-", "bg-").split(" ")[0] ||
                      "bg-gray-100"
                    }`}
                  >
                    <svg
                      className={`w-5 h-5 ${
                        STATUS_COLORS[app.status]?.split(" ")[1] || "text-gray-600"
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d={STATUS_ICONS[app.status] || "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"}
                      />
                    </svg>
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-900 text-sm truncate">
                      {app.role}
                    </h3>
                    <p className="text-sm text-gray-600 truncate">{app.company}</p>

                    {/* Location + Work Type */}
                    <div className="flex items-center gap-3 mt-1">
                      {app.location && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {app.location}
                        </span>
                      )}
                      {app.workType && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                          {app.workType}
                        </span>
                      )}
                    </div>

                    {/* Job link */}
                    {app.url && (
                      <a
                        href={app.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-violet-600 hover:underline mt-1"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        View Job Posting
                      </a>
                    )}
                    {app.resumeUrl && (
                      <a
                        href={app.resumeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-purple-700 hover:underline mt-1"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 2v6h6" />
                        </svg>
                        Resume Used{app.resumeSource ? ` (${app.resumeSource === "TAILORED" ? "Tailored" : "Base"})` : ""}
                      </a>
                    )}
                  </div>
                </div>

                {/* Status + Date */}
                <div className="flex-shrink-0 text-right">
                  <span
                    className={`inline-block px-2.5 py-0.5 text-xs font-medium rounded-full ${
                      STATUS_COLORS[app.status] || "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {app.status.replace(/_/g, " ")}
                  </span>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(app.date).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Error message */}
              {app.error && (
                <div className="mt-3 p-2 bg-red-50 rounded text-sm text-red-700 flex items-start gap-2">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  {app.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
