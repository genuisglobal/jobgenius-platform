"use client";

import { useState, useEffect, useCallback } from "react";

interface JobPost {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  source: string | null;
  source_type: string | null;
  scraped_by_am_id: string | null;
  work_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  seniority_level: string | null;
  parsed_at: string | null;
  created_at: string;
}

interface Seeker {
  id: string;
  full_name: string | null;
  email: string;
}

interface Props {
  seekers: Seeker[];
  totalScraped: number;
  totalDiscovery: number;
  totalManual: number;
  totalParsed: number;
  totalMatched: number;
}

export default function GlobalJobsClient({
  seekers,
  totalScraped,
  totalDiscovery,
  totalManual,
  totalParsed,
  totalMatched,
}: Props) {
  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [runningMatchAll, setRunningMatchAll] = useState(false);
  const [matchAllResult, setMatchAllResult] = useState<string | null>(null);
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "25",
      });
      if (search) params.set("search", search);
      if (sourceFilter) params.set("source_type", sourceFilter);

      const response = await fetch(`/api/dashboard/global-jobs?${params}`);
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
      }
    } catch (e) {
      console.error("Failed to fetch jobs:", e);
    }
    setLoading(false);
  }, [page, search, sourceFilter]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleAssignToSeeker = async (jobPostId: string, jobSeekerId: string) => {
    try {
      await fetch("/api/dashboard/global-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_post_id: jobPostId,
          job_seeker_id: jobSeekerId,
          auto_queue: true,
        }),
      });
      fetchJobs();
    } catch (e) {
      console.error("Failed to assign job:", e);
    }
  };

  const handleBulkAssign = async (jobSeekerId: string) => {
    if (selectedJobs.size === 0) return;
    const jobIds = Array.from(selectedJobs);
    for (const jobId of jobIds) {
      await handleAssignToSeeker(jobId, jobSeekerId);
    }
    setSelectedJobs(new Set());
  };

  const runMatchAll = async () => {
    setRunningMatchAll(true);
    setMatchAllResult(null);
    try {
      const res = await fetch("/api/match/run-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ only_unscored: true }),
      });
      if (res.ok) {
        const data = await res.json();
        setMatchAllResult(
          `Sorting complete! ${data.seekers_processed} seekers x ${data.jobs_in_bank} jobs = ${data.jobs_scored} scores computed. ${data.jobs_parsed} jobs parsed.`
        );
      } else {
        setMatchAllResult("Failed to run sorting agent.");
      }
    } catch {
      setMatchAllResult("Network error.");
    }
    setRunningMatchAll(false);
  };

  const toggleJobSelection = (jobId: string) => {
    setSelectedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedJobs.size === jobs.length) {
      setSelectedJobs(new Set());
    } else {
      setSelectedJobs(new Set(jobs.map((j) => j.id)));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Job Bank</h1>
          <p className="text-gray-600">
            Central repository of all scraped and discovered jobs. The sorting agent matches these against seeker profiles.
          </p>
        </div>
        <button
          onClick={runMatchAll}
          disabled={runningMatchAll}
          className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 whitespace-nowrap"
        >
          {runningMatchAll ? "Running Sorting Agent..." : "Run Sorting Agent"}
        </button>
      </div>

      {matchAllResult && (
        <div className={`p-3 rounded-lg text-sm ${matchAllResult.includes("Failed") || matchAllResult.includes("error") ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>
          {matchAllResult}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Total Jobs" value={total} />
        <StatCard label="Extension Scraped" value={totalScraped} color="purple" />
        <StatCard label="Discovery" value={totalDiscovery} color="blue" />
        <StatCard label="Manual" value={totalManual} color="gray" />
        <StatCard label="Parsed" value={totalParsed} color="green" />
        <StatCard label="Match Scores" value={totalMatched} color="indigo" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search by title or company..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Sources</option>
            <option value="extension_scrape">Extension Scrape</option>
            <option value="discovery">Discovery</option>
            <option value="manual">Manual</option>
          </select>
          <button
            onClick={fetchJobs}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
          >
            Refresh
          </button>
        </div>

        {/* Bulk actions */}
        {selectedJobs.size > 0 && (
          <div className="mt-3 pt-3 border-t flex items-center gap-3">
            <span className="text-sm text-gray-600">{selectedJobs.size} selected</span>
            <BulkAssignDropdown seekers={seekers} onAssign={handleBulkAssign} />
            <button
              onClick={() => setSelectedJobs(new Set())}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear Selection
            </button>
          </div>
        )}
      </div>

      {/* Jobs Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedJobs.size === jobs.length && jobs.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    No jobs found. Scrape jobs from the extension or run a discovery search.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id} className={`hover:bg-gray-50 ${selectedJobs.has(job.id) ? "bg-violet-50" : ""}`}>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedJobs.has(job.id)}
                        onChange={() => toggleJobSelection(job.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-800 line-clamp-1"
                      >
                        {job.title}
                      </a>
                      {job.work_type && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded capitalize">
                          {job.work_type}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{job.company || "-"}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{job.location || "-"}</td>
                    <td className="px-4 py-3">
                      <SourceBadge type={job.source_type} />
                    </td>
                    <td className="px-4 py-3">
                      {job.parsed_at ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Parsed
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          Unparsed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(job.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <AssignDropdown
                        seekers={seekers}
                        onAssign={(seekerId) => handleAssignToSeeker(job.id, seekerId)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Page {page} of {totalPages} ({total} total jobs)
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  const colorClasses: Record<string, string> = {
    purple: "text-purple-600",
    blue: "text-violet-600",
    gray: "text-gray-600",
    green: "text-green-600",
    indigo: "text-indigo-600",
  };
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="text-sm font-medium text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color ? colorClasses[color] : "text-gray-900"}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function SourceBadge({ type }: { type: string | null }) {
  const colors: Record<string, string> = {
    extension_scrape: "bg-purple-100 text-purple-800",
    discovery: "bg-violet-100 text-violet-800",
    manual: "bg-gray-100 text-gray-800",
  };

  const labels: Record<string, string> = {
    extension_scrape: "Extension",
    discovery: "Discovery",
    manual: "Manual",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        colors[type || "manual"] || "bg-gray-100 text-gray-800"
      }`}
    >
      {labels[type || "manual"] || type || "Manual"}
    </span>
  );
}

function AssignDropdown({
  seekers,
  onAssign,
}: {
  seekers: Seeker[];
  onAssign: (seekerId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (seekers.length === 0) {
    return <span className="text-xs text-gray-400">No seekers</span>;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
      >
        Assign
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-6 z-20 w-48 bg-white rounded-lg shadow-lg border py-1">
            {seekers.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  onAssign(s.id);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
              >
                {s.full_name || s.email}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BulkAssignDropdown({
  seekers,
  onAssign,
}: {
  seekers: Seeker[];
  onAssign: (seekerId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (seekers.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-3 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
      >
        Assign Selected to Seeker
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-8 z-20 w-56 bg-white rounded-lg shadow-lg border py-1">
            {seekers.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  onAssign(s.id);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
              >
                {s.full_name || s.email}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
