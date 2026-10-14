"use client";

import { useState, useEffect, useRef } from "react";
import {
  normalizeAssessmentQuestions,
  type AssessmentQuestion,
} from "@/lib/learning/assessment";
import { useToast, ToastContainer } from "@/lib/use-toast";
import AssessmentRunner from "./AssessmentRunner";

type Lesson = {
  id: string;
  title: string;
  content_type: string;
  content: Record<string, unknown>;
  estimated_minutes: number;
  progress: {
    status: string;
    completed_at: string | null;
    time_spent_seconds: number;
    quiz_score?: number | null;
    mastery_score?: number | null;
  } | null;
  is_bookmarked: boolean;
};

type Note = {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export default function LessonViewer({
  trackId,
  lesson,
  onBack,
  onLessonUpdated,
  totalLessons,
  currentIndex,
  onNavigate,
}: {
  trackId: string;
  lesson: Lesson;
  onBack: () => void;
  onLessonUpdated: (lesson: Partial<Lesson> & { id: string }) => void;
  totalLessons: number;
  currentIndex: number;
  onNavigate: (index: number) => void;
}) {
  const [bookmarked, setBookmarked] = useState(lesson.is_bookmarked);
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const startTimeRef = useRef(Date.now());
  const { toasts, toast } = useToast();

  const isCompleted = lesson.progress?.status === "completed";

  // Mark as in_progress on mount
  useEffect(() => {
    if (!isCompleted && lesson.progress?.status !== "in_progress") {
      fetch(
        `/api/portal/learning/${trackId}/lessons/${lesson.id}/progress`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "in_progress" }),
        }
      ).catch((err) => console.error("[learning] update lesson progress failed:", err));
    }
    startTimeRef.current = Date.now();
  }, [lesson.id, trackId, isCompleted, lesson.progress?.status]);

  // Load notes when panel opens
  useEffect(() => {
    if (showNotes) {
      fetch(`/api/portal/learning/${trackId}/lessons/${lesson.id}/notes`)
        .then((res) => res.json())
        .then((data) => setNotes(data.notes ?? []))
        .catch((err) => console.error("[learning] fetch notes failed:", err));
    }
  }, [showNotes, trackId, lesson.id]);

  async function toggleBookmark() {
    const res = await fetch(
      `/api/portal/learning/${trackId}/lessons/${lesson.id}/bookmark`,
      { method: "POST" }
    );
    if (res.ok) {
      const data = await res.json();
      setBookmarked(data.bookmarked);
      onLessonUpdated({ id: lesson.id, is_bookmarked: data.bookmarked });
      toast(data.bookmarked ? "Bookmarked" : "Bookmark removed");
    }
  }

  async function markComplete() {
    const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/portal/learning/${trackId}/lessons/${lesson.id}/progress`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "completed",
            time_spent_seconds: timeSpent,
          }),
        }
      );
      if (res.ok) {
        const { progress } = await res.json();
        onLessonUpdated({
          id: lesson.id,
          progress,
        });
        toast("Lesson completed!");
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveNote() {
    if (!newNote.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/portal/learning/${trackId}/lessons/${lesson.id}/notes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: newNote.trim() }),
        }
      );
      if (res.ok) {
        const { note } = await res.json();
        setNotes((prev) => [note, ...prev]);
        setNewNote("");
        toast("Note saved");
      }
    } finally {
      setSaving(false);
    }
  }

  async function completeQuiz(result: {
    answers: Array<number | null>;
    score: number;
    correctCount: number;
    totalQuestions: number;
  }) {
    const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/portal/learning/${trackId}/lessons/${lesson.id}/progress`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "completed",
            time_spent_seconds: timeSpent,
            quiz_score: result.score,
          }),
        }
      );

      if (res.ok) {
        const { progress } = await res.json();
        onLessonUpdated({
          id: lesson.id,
          progress,
        });

        if (progress?.status === "completed") {
          toast(`Quiz completed: ${result.score}%`, "success");
        } else {
          toast(`Quiz saved: ${result.score}%`, "success");
        }
      } else {
        const data = await res.json().catch(() => ({}));
        toast(data.error || "Failed to save quiz progress", "error");
      }
    } finally {
      setSaving(false);
    }
  }

  const content = lesson.content as {
    body?: string;
    summary?: string;
    url?: string;
    description?: string;
    instructions?: string;
    starter_code?: string;
    resource_type?: string;
    questions?: AssessmentQuestion[];
  };
  const quizQuestions = normalizeAssessmentQuestions(content.questions ?? []);
  const showManualComplete = lesson.content_type !== "quiz";

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="text-sm text-violet-600 hover:text-violet-800"
        >
          &larr; Back to track
        </button>
        <span className="text-sm text-gray-500">
          Lesson {currentIndex + 1} of {totalLessons}
        </span>
      </div>

      {/* Lesson content */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {lesson.title}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-gray-400 px-2 py-0.5 bg-gray-100 rounded">
                {lesson.content_type}
              </span>
              <span className="text-xs text-gray-400">
                ~{lesson.estimated_minutes} min
              </span>
              {isCompleted && (
                <span className="text-xs text-green-600 font-medium">Completed</span>
              )}
            </div>
          </div>
          <button
            onClick={toggleBookmark}
            className={`p-2 rounded-md transition-colors ${
              bookmarked
                ? "text-yellow-500 bg-yellow-50 hover:bg-yellow-100"
                : "text-gray-400 hover:bg-gray-100"
            }`}
            title={bookmarked ? "Remove bookmark" : "Bookmark"}
          >
            <svg
              className="w-5 h-5"
              fill={bookmarked ? "currentColor" : "none"}
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
              />
            </svg>
          </button>
        </div>

        {/* Render content by type */}
        {lesson.content_type === "article" && (
          <div className="prose prose-sm max-w-none text-gray-700">
            {content.body ? (
              <div
                className="whitespace-pre-wrap"
                dangerouslySetInnerHTML={{
                  __html: simpleMarkdown(content.body),
                }}
              />
            ) : (
              <p className="text-gray-400">No content available.</p>
            )}
            {content.summary && (
              <div className="mt-4 p-3 bg-violet-50 rounded-lg">
                <p className="text-sm text-violet-700">
                  <strong>Summary:</strong> {content.summary}
                </p>
              </div>
            )}
          </div>
        )}

        {lesson.content_type === "video" && (
          <div>
            {content.url ? (
              <div>
                <a
                  href={content.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-violet-50 text-violet-700 rounded-lg hover:bg-violet-100 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Watch Video
                </a>
                {content.description && (
                  <p className="mt-3 text-sm text-gray-600">{content.description}</p>
                )}
              </div>
            ) : (
              <p className="text-gray-400">Video URL not available.</p>
            )}
          </div>
        )}

        {lesson.content_type === "exercise" && (
          <div className="space-y-4">
            {content.instructions && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Instructions</h3>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {content.instructions}
                </p>
              </div>
            )}
            {content.starter_code && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Starter Code</h3>
                <pre className="bg-gray-900 text-gray-100 rounded-lg p-3 sm:p-4 overflow-auto text-sm">
                  {content.starter_code}
                </pre>
              </div>
            )}
          </div>
        )}

        {lesson.content_type === "resource_link" && content.url && (
          <a
            href={content.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-violet-600 hover:text-violet-800"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Open Resource
          </a>
        )}

        {lesson.content_type === "quiz" && (
          <div>
            {lesson.progress?.quiz_score !== undefined && lesson.progress?.quiz_score !== null && (
              <div className="mb-4 p-3 bg-violet-50 rounded-lg">
                <p className="text-sm text-violet-700">
                  <strong>Latest Score:</strong> {lesson.progress.quiz_score}%
                </p>
              </div>
            )}
            {quizQuestions.length > 0 ? (
              <AssessmentRunner
                title={lesson.title}
                description="Answer every question to complete this quiz lesson. A passing result records mastery and schedules review."
                questions={quizQuestions}
                busy={saving}
                ctaLabel="Save Quiz Result"
                onComplete={completeQuiz}
              />
            ) : (
              <p className="text-gray-400">Quiz questions are not available.</p>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex gap-2">
          {!isCompleted && showManualComplete && (
            <button
              onClick={markComplete}
              disabled={saving}
              className="px-4 py-2.5 sm:py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors flex-1 sm:flex-initial"
            >
              {saving ? "Saving..." : "Mark as Complete"}
            </button>
          )}
          <button
            onClick={() => setShowNotes(!showNotes)}
            className="px-4 py-2.5 sm:py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            {showNotes ? "Hide Notes" : "Notes"}
          </button>
        </div>

        <div className="flex gap-2">
          {currentIndex > 0 && (
            <button
              onClick={() => onNavigate(currentIndex - 1)}
              className="px-3 py-2.5 sm:py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 flex-1 sm:flex-initial"
            >
              Previous
            </button>
          )}
          {currentIndex < totalLessons - 1 && (
            <button
              onClick={() => onNavigate(currentIndex + 1)}
              className="px-3 py-2.5 sm:py-2 text-sm text-violet-600 bg-violet-50 rounded-lg hover:bg-violet-100 flex-1 sm:flex-initial"
            >
              Next
            </button>
          )}
        </div>
      </div>

      {/* Notes panel */}
      {showNotes && (
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Your Notes</h3>

          <div className="mb-4">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={3}
              placeholder="Add a note..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={saveNote}
                disabled={saving || !newNote.trim()}
                className="px-3 py-1.5 bg-violet-600 text-white text-sm rounded-md hover:bg-violet-700 disabled:opacity-50"
              >
                Save Note
              </button>
            </div>
          </div>

          {notes.length > 0 && (
            <div className="space-y-3">
              {notes.map((note) => (
                <div key={note.id} className="border-l-2 border-violet-300 pl-3 py-1">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {note.content}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(note.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <ToastContainer toasts={toasts} />
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
