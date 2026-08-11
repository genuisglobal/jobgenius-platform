"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Lesson = {
  id: string;
  title: string;
  content_type: string;
  content: Record<string, unknown>;
  sort_order: number;
  estimated_minutes: number;
  skill_slug: string | null;
  learning_objective: string | null;
  difficulty: "easy" | "medium" | "hard";
  is_ai_generated: boolean;
  created_at: string;
};

type Track = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  creation_mode: string;
  target_skill: string | null;
  focus_skills: string[] | null;
  job_seekers: { id: string; full_name: string | null; email: string | null; skills: string[] | null; seniority: string | null } | null;
  job_posts: { id: string; title: string; company: string | null } | null;
  learning_lessons: Lesson[];
};

const CONTENT_TYPES = [
  { value: "article", label: "Article" },
  { value: "video", label: "Video" },
  { value: "exercise", label: "Exercise" },
  { value: "quiz", label: "Quiz" },
  { value: "resource_link", label: "Resource Link" },
];

export default function LearningTrackEditor({ track: initialTrack }: { track: Track }) {
  const router = useRouter();
  const [track, setTrack] = useState(initialTrack);
  const [lessons, setLessons] = useState<Lesson[]>(initialTrack.learning_lessons);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAddLesson, setShowAddLesson] = useState(false);
  const [editingLesson, setEditingLesson] = useState<string | null>(null);

  // New lesson form
  const [newTitle, setNewTitle] = useState("");
  const [newContentType, setNewContentType] = useState("article");
  const [newBody, setNewBody] = useState("");
  const [newMinutes, setNewMinutes] = useState(10);
  const [showPreview, setShowPreview] = useState(false);

  const seeker = track.job_seekers;
  const jobPost = track.job_posts;

  async function updateTrackStatus(status: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/learning/tracks/${track.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const { track: updated } = await res.json();
        setTrack((prev) => ({ ...prev, ...updated }));
      }
    } finally {
      setSaving(false);
    }
  }

  async function addLesson() {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const content: Record<string, unknown> = {};
      if (newContentType === "article") {
        content.body = newBody;
        content.summary = "";
      } else if (newContentType === "video") {
        content.url = newBody;
        content.description = "";
      } else if (newContentType === "resource_link") {
        content.url = newBody;
        content.description = "";
      }

      const res = await fetch(`/api/learning/tracks/${track.id}/lessons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          content_type: newContentType,
          content,
          estimated_minutes: newMinutes,
        }),
      });

      if (res.ok) {
        const { lesson } = await res.json();
        setLessons((prev) => [...prev, lesson]);
        setNewTitle("");
        setNewBody("");
        setNewMinutes(10);
        setShowAddLesson(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteLesson(lessonId: string) {
    const res = await fetch(`/api/learning/tracks/${track.id}/lessons/${lessonId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setLessons((prev) => prev.filter((l) => l.id !== lessonId));
    }
  }

  async function generateLessons() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/learning/tracks/${track.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lesson_count: 5 }),
      });
      if (res.ok) {
        const { lessons: newLessons } = await res.json();
        setLessons((prev) => [...prev, ...newLessons]);
      }
    } finally {
      setGenerating(false);
    }
  }

  async function deleteTrack() {
    if (!confirm("Delete this track and all its lessons?")) return;
    setDeleting(true);
    const res = await fetch(`/api/learning/tracks/${track.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/dashboard/learning");
    }
    setDeleting(false);
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/dashboard/learning"
          className="text-sm text-violet-600 hover:text-violet-800"
        >
          &larr; Back to Learning Tracks
        </Link>
      </div>

      {/* Track header */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900">{track.title}</h1>
            {track.description && (
              <p className="text-sm text-gray-500 mt-1">{track.description}</p>
            )}
            <div className="flex items-center gap-2 sm:gap-3 mt-2 text-sm text-gray-500 flex-wrap">
              <span className="truncate max-w-[200px]">Seeker: {seeker?.full_name || seeker?.email}</span>
              <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{track.category}</span>
              <span className="px-2 py-0.5 bg-violet-50 text-violet-700 rounded text-xs">
                {track.creation_mode.replace(/_/g, " ")}
              </span>
              {track.target_skill && (
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-xs">
                  Focus: {track.target_skill}
                </span>
              )}
              {jobPost && (
                <span className="truncate max-w-[200px]">{jobPost.title}{jobPost.company ? ` @ ${jobPost.company}` : ""}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 self-start">
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              track.status === "published"
                ? "bg-green-100 text-green-700"
                : track.status === "archived"
                ? "bg-gray-100 text-gray-500"
                : "bg-yellow-100 text-yellow-700"
            }`}>
              {track.status}
            </span>
          </div>
        </div>

        <div className="flex gap-2 mt-4 flex-wrap">
          {track.status === "draft" && (
            <button
              onClick={() => updateTrackStatus("published")}
              disabled={saving || lessons.length === 0}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              Publish
            </button>
          )}
          {track.status === "published" && (
            <button
              onClick={() => updateTrackStatus("archived")}
              disabled={saving}
              className="px-3 py-1.5 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-700 disabled:opacity-50"
            >
              Archive
            </button>
          )}
          {track.status === "archived" && (
            <button
              onClick={() => updateTrackStatus("published")}
              disabled={saving}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              Re-publish
            </button>
          )}
          <button
            onClick={deleteTrack}
            disabled={deleting}
            className="px-3 py-1.5 bg-red-50 text-red-700 text-sm rounded-md hover:bg-red-100 disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete Track"}
          </button>
        </div>
      </div>

      {/* Lessons */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Lessons ({lessons.length})
          </h2>
          <div className="flex gap-2">
            <button
              onClick={generateLessons}
              disabled={generating}
              className="px-3 py-2 sm:py-1.5 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 disabled:opacity-50 flex-1 sm:flex-initial whitespace-nowrap"
            >
              {generating ? "Generating..." : "AI Generate"}
            </button>
            <button
              onClick={() => setShowAddLesson(true)}
              className="px-3 py-2 sm:py-1.5 bg-violet-600 text-white text-sm rounded-md hover:bg-violet-700 flex-1 sm:flex-initial whitespace-nowrap"
            >
              Add Lesson
            </button>
          </div>
        </div>

        {lessons.length === 0 && !showAddLesson ? (
          <p className="text-sm text-gray-400 text-center py-8">
            No lessons yet. Add lessons manually or use AI to generate them.
          </p>
        ) : (
          <div className="space-y-3">
            {lessons.map((lesson, index) => (
              <div
                key={lesson.id}
                className="border border-gray-200 rounded-lg p-3 sm:p-4"
              >
                <div className="flex items-start sm:items-center justify-between gap-2">
                  <div className="flex items-start sm:items-center gap-2 sm:gap-3 min-w-0">
                    <span className="text-sm font-medium text-gray-400 w-6 flex-shrink-0 mt-0.5 sm:mt-0">
                      {index + 1}.
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium text-gray-900 truncate">
                        {lesson.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-gray-400 px-1.5 py-0.5 bg-gray-100 rounded">
                          {lesson.content_type}
                        </span>
                        {lesson.difficulty && (
                          <span className="text-xs text-gray-500 px-1.5 py-0.5 bg-gray-50 rounded">
                            {lesson.difficulty}
                          </span>
                        )}
                        {lesson.skill_slug && (
                          <span className="text-xs text-violet-600 px-1.5 py-0.5 bg-violet-50 rounded">
                            {lesson.skill_slug.replace(/-/g, " ")}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          ~{lesson.estimated_minutes} min
                        </span>
                        {lesson.is_ai_generated && (
                          <span className="text-xs text-purple-500">AI</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() =>
                        setEditingLesson(
                          editingLesson === lesson.id ? null : lesson.id
                        )
                      }
                      className="px-2 py-1.5 sm:py-1 text-xs text-violet-600 hover:bg-violet-50 rounded"
                    >
                      {editingLesson === lesson.id ? "Close" : "Edit"}
                    </button>
                    <button
                      onClick={() => deleteLesson(lesson.id)}
                      className="px-2 py-1.5 sm:py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {editingLesson === lesson.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    {lesson.learning_objective && (
                      <div className="mb-3 p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Learning Objective
                        </p>
                        <p className="text-sm text-gray-700 mt-1">
                          {lesson.learning_objective}
                        </p>
                      </div>
                    )}
                    {lesson.content_type === "article" && typeof lesson.content.body === "string" ? (
                      <div className="bg-white rounded p-3 border border-gray-200 max-h-60 overflow-auto prose prose-sm max-w-none">
                        <div
                          className="whitespace-pre-wrap text-sm text-gray-700"
                          dangerouslySetInnerHTML={{ __html: simpleMarkdown(lesson.content.body as string) }}
                        />
                        {typeof lesson.content.summary === "string" && lesson.content.summary && (
                          <div className="mt-3 p-2 bg-violet-50 rounded text-sm text-violet-700">
                            <strong>Summary:</strong> {lesson.content.summary}
                          </div>
                        )}
                      </div>
                    ) : (
                      <pre className="text-xs text-gray-600 bg-gray-50 rounded p-3 overflow-auto max-h-60">
                        {JSON.stringify(lesson.content, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add Lesson Form */}
        {showAddLesson && (
          <div className="mt-4 border border-violet-200 rounded-lg p-4 bg-violet-50">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Add New Lesson</h3>
            <div className="space-y-3">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Lesson title"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={newContentType}
                  onChange={(e) => setNewContentType(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 w-full sm:w-auto"
                >
                  {CONTENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={newMinutes}
                    onChange={(e) => setNewMinutes(Number(e.target.value))}
                    min={1}
                    max={120}
                    className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
                  />
                  <span className="text-sm text-gray-500">minutes</span>
                </div>
              </div>
              {newContentType === "article" && (
                <div className="flex gap-1 border-b border-gray-200 pb-1">
                  <button
                    type="button"
                    onClick={() => setShowPreview(false)}
                    className={`px-3 py-1 text-xs font-medium rounded-t-md ${
                      !showPreview ? "bg-white text-gray-900 border border-b-white -mb-px" : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Write
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPreview(true)}
                    className={`px-3 py-1 text-xs font-medium rounded-t-md ${
                      showPreview ? "bg-white text-gray-900 border border-b-white -mb-px" : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Preview
                  </button>
                </div>
              )}
              {showPreview && newContentType === "article" ? (
                <div className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 bg-white min-h-[140px] prose prose-sm max-w-none">
                  {newBody.trim() ? (
                    <div
                      className="whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ __html: simpleMarkdown(newBody) }}
                    />
                  ) : (
                    <p className="text-gray-400 italic">Nothing to preview</p>
                  )}
                </div>
              ) : (
                <textarea
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  rows={5}
                  placeholder={
                    newContentType === "article"
                      ? "Markdown content... (supports # headings, **bold**, *italic*, - lists)"
                      : newContentType === "video" || newContentType === "resource_link"
                      ? "URL..."
                      : "Content..."
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
              )}
              <div className="flex gap-2">
                <button
                  onClick={addLesson}
                  disabled={saving || !newTitle.trim()}
                  className="px-3 py-1.5 bg-violet-600 text-white text-sm rounded-md hover:bg-violet-700 disabled:opacity-50"
                >
                  {saving ? "Adding..." : "Add Lesson"}
                </button>
                <button
                  onClick={() => setShowAddLesson(false)}
                  className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function simpleMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-gray-900 mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold text-gray-900 mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-gray-900 mt-6 mb-3">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n\n/g, "<br/><br/>");
}
