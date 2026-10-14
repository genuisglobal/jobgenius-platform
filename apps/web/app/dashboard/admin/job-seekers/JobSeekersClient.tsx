"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface JobSeeker {
  id: string;
  full_name: string | null;
  email: string;
  location: string | null;
  seniority: string | null;
  status: string | null;
  profile_completion: number | null;
  created_at: string;
  assignedAM: { id: string; name: string | null; email: string } | null;
}

interface AccountManager {
  id: string;
  name: string | null;
  email: string;
}

export default function JobSeekersClient({
  jobSeekers,
  accountManagers,
}: {
  jobSeekers: JobSeeker[];
  accountManagers: AccountManager[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "assigned" | "unassigned">("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);

  const filtered = jobSeekers.filter((s) => {
    if (filter === "assigned" && !s.assignedAM) return false;
    if (filter === "unassigned" && s.assignedAM) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (s.full_name || "").toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        (s.location || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const assignedCount = jobSeekers.filter((s) => s.assignedAM).length;
  const unassignedCount = jobSeekers.filter((s) => !s.assignedAM).length;

  const assignSeeker = async (seekerId: string, amId: string) => {
    setAssigning(seekerId);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_seeker_id: seekerId, account_manager_id: amId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to assign." });
        return;
      }

      setMessage({ type: "success", text: "Assignment updated!" });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setAssigning(null);
    }
  };

  const unassignSeeker = async (seekerId: string) => {
    setAssigning(seekerId);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/assignments?job_seeker_id=${seekerId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "Failed to unassign." });
        return;
      }

      setMessage({ type: "success", text: "Assignment removed." });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setAssigning(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">All Job Seekers</h1>
        <p className="text-gray-600">{jobSeekers.length} total</p>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or location..."
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-2 text-sm rounded-lg ${
                filter === "all" ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              All ({jobSeekers.length})
            </button>
            <button
              onClick={() => setFilter("assigned")}
              className={`px-3 py-2 text-sm rounded-lg ${
                filter === "assigned" ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              Assigned ({assignedCount})
            </button>
            <button
              onClick={() => setFilter("unassigned")}
              className={`px-3 py-2 text-sm rounded-lg ${
                filter === "unassigned" ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              Unassigned ({unassignedCount})
            </button>
          </div>
        </div>
      </div>

      {/* Job Seekers Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase hidden md:table-cell">Location</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase hidden sm:table-cell">Profile</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Assigned To</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No job seekers found
                </td>
              </tr>
            ) : (
              filtered.map((seeker) => (
                <tr key={seeker.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{seeker.full_name || "Unnamed"}</p>
                    <p className="text-sm text-gray-500">{seeker.email}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">
                    {seeker.location || "-"}
                  </td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell">
                    <span className={`text-sm font-medium ${
                      (seeker.profile_completion ?? 0) >= 80 ? "text-green-600" :
                      (seeker.profile_completion ?? 0) >= 50 ? "text-yellow-600" :
                      "text-gray-400"
                    }`}>
                      {seeker.profile_completion ?? 0}%
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {assigning === seeker.id ? (
                      <span className="text-sm text-gray-500">Updating...</span>
                    ) : seeker.assignedAM ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-900">
                          {seeker.assignedAM.name || seeker.assignedAM.email}
                        </span>
                        <button
                          onClick={() => unassignSeeker(seeker.id)}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            assignSeeker(seeker.id, e.target.value);
                          }
                        }}
                        className="text-sm border rounded px-2 py-1 w-full max-w-[200px]"
                        defaultValue=""
                      >
                        <option value="">Assign to...</option>
                        {accountManagers.map((am) => (
                          <option key={am.id} value={am.id}>
                            {am.name || am.email}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/admin/job-seekers/${seeker.id}`}
                      className="text-sm text-violet-600 hover:text-violet-800"
                    >
                      View &amp; Manage
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
