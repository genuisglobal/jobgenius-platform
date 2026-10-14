"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Seeker = {
  id: string;
  full_name: string | null;
  email: string | null;
  location?: string | null;
};

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "technical", label: "Technical" },
  { value: "behavioral", label: "Behavioral" },
  { value: "industry", label: "Industry" },
  { value: "tools", label: "Tools" },
];

const CREATION_MODES = [
  {
    value: "blank",
    label: "Blank Track",
    description: "Start from scratch and add lessons manually or with AI later.",
  },
  {
    value: "job_gap_refresh",
    label: "Job Gap Refresh",
    description: "Create a refresh track around a target skill and optional job post context.",
  },
  {
    value: "manual_skill_refresh",
    label: "Manual Skill Refresh",
    description: "Create a focused refresher for a specific skill the seeker needs to revisit.",
  },
];

export default function CreateLearningTrackPage() {
  const router = useRouter();
  const [seekers, setSeekers] = useState<Seeker[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [seekerId, setSeekerId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [creationMode, setCreationMode] = useState("blank");
  const [targetSkill, setTargetSkill] = useState("");
  const [jobPostId, setJobPostId] = useState("");

  useEffect(() => {
    fetch("/api/am/jobseekers?pageSize=100")
      .then((res) => res.json())
      .then((data) => {
        if (data.job_seekers) setSeekers(data.job_seekers);
      })
      .catch((err) => console.error("[learning] fetch seekers failed:", err))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!seekerId || !title.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/learning/tracks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: seekerId,
          title: title.trim(),
          description: description.trim() || null,
          category,
          creation_mode: creationMode,
          target_skill:
            creationMode === "blank"
              ? null
              : targetSkill.trim() || null,
          focus_skills:
            creationMode === "blank" || !targetSkill.trim()
              ? []
              : [targetSkill.trim()],
          job_post_id:
            creationMode === "job_gap_refresh"
              ? jobPostId.trim() || null
              : null,
        }),
      });

      const data = await res.json();

      if (res.ok && data.track) {
        router.push(`/dashboard/learning/${data.track.id}`);
      } else {
        setError(data.error || "Failed to create track.");
      }
    } catch {
      setError("Failed to create track.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link
          href="/dashboard/learning"
          className="text-sm text-violet-600 hover:text-violet-800"
        >
          &larr; Back to Learning Tracks
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">
          Create Learning Track
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Job Seeker *
          </label>
          {loading ? (
            <p className="text-sm text-gray-400">Loading seekers...</p>
          ) : (
            <select
              value={seekerId}
              onChange={(e) => setSeekerId(e.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            >
              <option value="">Select a job seeker</option>
              {seekers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name || s.email || s.id}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Creation Mode
          </label>
          <select
            value={creationMode}
            onChange={(e) => setCreationMode(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
          >
            {CREATION_MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            {CREATION_MODES.find((mode) => mode.value === creationMode)?.description}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Track Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="e.g., React Fundamentals for Frontend Roles"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Brief description of what this track covers..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
          />
        </div>

        {creationMode !== "blank" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Target Skill {creationMode === "manual_skill_refresh" ? "*" : ""}
            </label>
            <input
              type="text"
              value={targetSkill}
              onChange={(e) => setTargetSkill(e.target.value)}
              placeholder="e.g., React, SQL, Project Management"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Use the main skill the learner needs to refresh first.
            </p>
          </div>
        )}

        {creationMode === "job_gap_refresh" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Job Post ID
            </label>
            <input
              type="text"
              value={jobPostId}
              onChange={(e) => setJobPostId(e.target.value)}
              placeholder="Optional job_post_id for role-specific refresh context"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Optional. Attach a job post when you want the refresh track tied to a specific role.
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={
              submitting ||
              !seekerId ||
              !title.trim() ||
              (creationMode === "manual_skill_refresh" && !targetSkill.trim()) ||
              (creationMode === "job_gap_refresh" && !targetSkill.trim() && !jobPostId.trim())
            }
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? "Creating..." : "Create Track"}
          </button>
          <Link
            href="/dashboard/learning"
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
