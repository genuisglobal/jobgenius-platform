"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AccountManager {
  id: string;
  name: string | null;
  email: string;
  role: string;
  assignmentCount: number;
}

interface Assignment {
  id: string;
  created_at: string;
  job_seekers: {
    id: string;
    full_name: string | null;
    email: string;
    location: string | null;
    seniority: string | null;
    profile_completion: number | null;
  } | null;
  account_managers: {
    id: string;
    name: string | null;
    email: string;
  } | null;
}

interface UnassignedSeeker {
  id: string;
  full_name: string | null;
  email: string;
  location: string | null;
  seniority: string | null;
  profile_completion: number | null;
}

export default function AssignmentsClient({
  accountManagers,
  assignments,
  unassignedSeekers,
}: {
  accountManagers: AccountManager[];
  assignments: Assignment[];
  unassignedSeekers: UnassignedSeeker[];
}) {
  const router = useRouter();
  const [selectedAM, setSelectedAM] = useState<string>("all");
  const [selectedSeekers, setSelectedSeekers] = useState<Set<string>>(new Set());
  const [targetAM, setTargetAM] = useState<string>("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [processing, setProcessing] = useState(false);

  // Filter assignments by selected AM
  const filteredAssignments = selectedAM === "all"
    ? assignments
    : assignments.filter((a) => a.account_managers?.id === selectedAM);

  const toggleSeeker = (id: string) => {
    setSelectedSeekers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllUnassigned = () => {
    setSelectedSeekers(new Set(unassignedSeekers.map((s) => s.id)));
  };

  const clearSelection = () => {
    setSelectedSeekers(new Set());
  };

  const bulkAssign = async () => {
    if (selectedSeekers.size === 0 || !targetAM) {
      setMessage({ type: "error", text: "Select seekers and an account manager." });
      return;
    }

    setProcessing(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/assignments/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_ids: Array.from(selectedSeekers),
          account_manager_id: targetAM,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to assign." });
        return;
      }

      setMessage({ type: "success", text: `Assigned ${data.count} job seekers.` });
      setSelectedSeekers(new Set());
      setTargetAM("");
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setProcessing(false);
    }
  };

  const reassign = async (seekerId: string, newAmId: string) => {
    setProcessing(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: seekerId,
          account_manager_id: newAmId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "Failed to reassign." });
        return;
      }

      setMessage({ type: "success", text: "Reassigned successfully." });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setProcessing(false);
    }
  };

  const unassign = async (seekerId: string) => {
    setProcessing(true);
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

      setMessage({ type: "success", text: "Unassigned successfully." });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Manage Assignments</h1>
        <p className="text-gray-600">
          {assignments.length} assigned, {unassignedSeekers.length} unassigned
        </p>
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

      {/* AM Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <button
          onClick={() => setSelectedAM("all")}
          className={`p-3 rounded-lg text-left transition-colors ${
            selectedAM === "all"
              ? "bg-purple-100 border-2 border-purple-500"
              : "bg-white border border-gray-200 hover:border-purple-300"
          }`}
        >
          <p className="font-medium text-gray-900">All</p>
          <p className="text-2xl font-bold text-purple-600">{assignments.length}</p>
        </button>
        {accountManagers.map((am) => (
          <button
            key={am.id}
            onClick={() => setSelectedAM(am.id)}
            className={`p-3 rounded-lg text-left transition-colors ${
              selectedAM === am.id
                ? "bg-purple-100 border-2 border-purple-500"
                : "bg-white border border-gray-200 hover:border-purple-300"
            }`}
          >
            <p className="font-medium text-gray-900 truncate">{am.name || am.email.split("@")[0]}</p>
            <p className="text-2xl font-bold text-purple-600">{am.assignmentCount}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Unassigned Seekers */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">
              Unassigned Job Seekers ({unassignedSeekers.length})
            </h2>
            <div className="flex gap-2">
              <button
                onClick={selectAllUnassigned}
                className="text-xs text-violet-600 hover:text-violet-800"
              >
                Select All
              </button>
              <button
                onClick={clearSelection}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Bulk assign controls */}
          {selectedSeekers.size > 0 && (
            <div className="px-5 py-3 bg-purple-50 border-b flex items-center gap-3">
              <span className="text-sm text-purple-800">
                {selectedSeekers.size} selected
              </span>
              <select
                value={targetAM}
                onChange={(e) => setTargetAM(e.target.value)}
                className="text-sm border rounded px-2 py-1"
              >
                <option value="">Assign to...</option>
                {accountManagers.map((am) => (
                  <option key={am.id} value={am.id}>
                    {am.name || am.email} ({am.assignmentCount})
                  </option>
                ))}
              </select>
              <button
                onClick={bulkAssign}
                disabled={!targetAM || processing}
                className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 disabled:opacity-50"
              >
                Assign
              </button>
            </div>
          )}

          <div className="max-h-[400px] overflow-y-auto divide-y">
            {unassignedSeekers.length === 0 ? (
              <p className="px-5 py-8 text-center text-gray-500">All job seekers are assigned!</p>
            ) : (
              unassignedSeekers.map((seeker) => (
                <div
                  key={seeker.id}
                  className={`px-5 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 ${
                    selectedSeekers.has(seeker.id) ? "bg-purple-50" : ""
                  }`}
                  onClick={() => toggleSeeker(seeker.id)}
                >
                  <input
                    type="checkbox"
                    checked={selectedSeekers.has(seeker.id)}
                    onChange={() => toggleSeeker(seeker.id)}
                    className="h-4 w-4 text-purple-600 rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {seeker.full_name || "Unnamed"}
                    </p>
                    <p className="text-sm text-gray-500 truncate">{seeker.email}</p>
                  </div>
                  {seeker.location && (
                    <span className="text-xs text-gray-400">{seeker.location}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Current Assignments */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-5 py-4 border-b">
            <h2 className="font-semibold text-gray-900">
              Current Assignments
              {selectedAM !== "all" && (
                <span className="text-gray-500 font-normal">
                  {" "}— {accountManagers.find((am) => am.id === selectedAM)?.name || "Unknown"}
                </span>
              )}
            </h2>
          </div>
          <div className="max-h-[500px] overflow-y-auto divide-y">
            {filteredAssignments.length === 0 ? (
              <p className="px-5 py-8 text-center text-gray-500">No assignments</p>
            ) : (
              filteredAssignments.map((assignment) => {
                const seeker = assignment.job_seekers;
                const am = assignment.account_managers;
                if (!seeker) return null;

                return (
                  <div key={assignment.id} className="px-5 py-3">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 truncate">
                          {seeker.full_name || "Unnamed"}
                        </p>
                        <p className="text-sm text-gray-500 truncate">{seeker.email}</p>
                        {selectedAM === "all" && am && (
                          <p className="text-xs text-purple-600 mt-1">
                            → {am.name || am.email}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <select
                          value={am?.id || ""}
                          onChange={(e) => reassign(seeker.id, e.target.value)}
                          disabled={processing}
                          className="text-xs border rounded px-1 py-0.5"
                        >
                          {accountManagers.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name || a.email.split("@")[0]}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => unassign(seeker.id)}
                          disabled={processing}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
