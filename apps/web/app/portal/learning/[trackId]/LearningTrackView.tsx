"use client";

import { useState } from "react";
import Link from "next/link";
import { useToast, ToastContainer } from "@/lib/use-toast";
import type { AssessmentQuestion } from "@/lib/learning/assessment";
import AssessmentRunner from "./AssessmentRunner";
import LessonViewer from "./LessonViewer";

type Lesson = {
  id: string;
  title: string;
  content_type: string;
  content: Record<string, unknown>;
  sort_order: number;
  estimated_minutes: number;
  is_ai_generated: boolean;
  progress: {
    status: string;
    completed_at: string | null;
    time_spent_seconds: number;
    mastery_score?: number | null;
    next_review_at?: string | null;
  } | null;
  is_bookmarked: boolean;
  is_due_for_review?: boolean;
};

type Track = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  job_post_id?: string | null;
  creation_mode?: string | null;
  target_skill?: string | null;
  job_posts: { title: string; company: string | null } | null;
  learning_lessons: Lesson[];
};

type Diagnostic = {
  id: string;
  title: string;
  prompt: string | null;
  score: number | null;
  status: string;
  completed_at: string | null;
  questions: AssessmentQuestion[];
};

type InterviewPrepLink = {
  id: string;
  job_posts: { title: string; company: string | null } | null;
};

export default function LearningTrackView({
  track,
  diagnostic: initialDiagnostic,
  initialLessonId,
  interviewPrep,
}: {
  track: Track;
  diagnostic: Diagnostic | null;
  initialLessonId?: string | null;
  interviewPrep?: InterviewPrepLink | null;
}) {
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(
    () => track.learning_lessons.find((lesson) => lesson.id === initialLessonId) ?? null
  );
  const [lessons, setLessons] = useState<Lesson[]>(track.learning_lessons);
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(initialDiagnostic);
  const [activeDiagnostic, setActiveDiagnostic] = useState<Diagnostic | null>(null);
  const [diagnosticSaving, setDiagnosticSaving] = useState(false);
  const { toasts, toast } = useToast();

  const completedCount = lessons.filter(
    (l) => l.progress?.status === "completed"
  ).length;
  const pct =
    lessons.length > 0
      ? Math.round((completedCount / lessons.length) * 100)
      : 0;
  const dueReviewCount = lessons.filter((lesson) => lesson.is_due_for_review).length;
  const masteryScores = lessons
    .map((lesson) => lesson.progress?.mastery_score)
    .filter((score): score is number => typeof score === "number" && score > 0);
  const masteryAverage =
    masteryScores.length > 0
      ? Math.round(
          masteryScores.reduce((sum, score) => sum + score, 0) / masteryScores.length
        )
      : null;
  const readyForInterviewPractice = Boolean(
    interviewPrep &&
      ((lessons.length > 0 && completedCount === lessons.length) ||
        (masteryAverage !== null && masteryAverage >= 70))
  );

  function handleLessonUpdated(updatedLesson: Partial<Lesson> & { id: string }) {
    setLessons((prev) =>
      prev.map((l) =>
        l.id === updatedLesson.id ? { ...l, ...updatedLesson } : l
      )
    );
    if (activeLesson?.id === updatedLesson.id) {
      setActiveLesson((prev) => (prev ? { ...prev, ...updatedLesson } : prev));
    }
  }

  async function startDiagnostic(restart = false) {
    setDiagnosticSaving(true);
    try {
      const res = await fetch(`/api/portal/learning/${track.id}/diagnostic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restart }),
      });

      if (!res.ok) {
        toast("Failed to start diagnostic", "error");
        return;
      }

      const data = await res.json();
      setDiagnostic(data.diagnostic ?? null);
      setActiveDiagnostic(data.diagnostic ?? null);
    } finally {
      setDiagnosticSaving(false);
    }
  }

  async function submitDiagnostic(result: {
    answers: Array<number | null>;
    score: number;
    correctCount: number;
    totalQuestions: number;
  }) {
    if (!activeDiagnostic) {
      return;
    }

    setDiagnosticSaving(true);
    try {
      const res = await fetch(`/api/portal/learning/${track.id}/diagnostic`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assessment_id: activeDiagnostic.id,
          answers: result.answers,
        }),
      });

      if (!res.ok) {
        toast("Failed to save diagnostic", "error");
        return;
      }

      const data = await res.json();
      setDiagnostic(data.diagnostic ?? null);
      setActiveDiagnostic(null);
      toast(`Diagnostic complete: ${result.score}%`, "success");
    } finally {
      setDiagnosticSaving(false);
    }
  }

  if (activeLesson) {
    return (
      <LessonViewer
        trackId={track.id}
        lesson={activeLesson}
        onBack={() => setActiveLesson(null)}
        onLessonUpdated={handleLessonUpdated}
        totalLessons={lessons.length}
        currentIndex={lessons.findIndex((l) => l.id === activeLesson.id)}
        onNavigate={(index) => setActiveLesson(lessons[index])}
      />
    );
  }

  if (activeDiagnostic) {
    return (
      <>
        <AssessmentRunner
          title={activeDiagnostic.title}
          description={activeDiagnostic.prompt}
          questions={activeDiagnostic.questions}
          busy={diagnosticSaving}
          ctaLabel="Save Diagnostic"
          onBack={() => setActiveDiagnostic(null)}
          onComplete={submitDiagnostic}
        />
        <ToastContainer toasts={toasts} />
      </>
    );
  }

  const shouldShowDiagnostic = Boolean(
    diagnostic || track.creation_mode === "job_gap_refresh" || track.creation_mode === "manual_skill_refresh" || track.target_skill
  );

  return (
    <>
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/portal/learning"
            className="text-sm text-violet-600 hover:text-violet-800"
          >
            &larr; Back to Learning
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/portal/learning/review"
              className="text-sm text-violet-600 hover:text-violet-800"
            >
              Review Queue
            </Link>
            <Link
              href="/portal/learning/bookmarks"
              className="text-sm text-violet-600 hover:text-violet-800"
            >
              Bookmarks
            </Link>
          </div>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mt-2">
          {track.title}
        </h1>
        {track.description && (
          <p className="text-sm text-gray-500 mt-1">{track.description}</p>
        )}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="text-xs text-gray-400 px-2 py-0.5 bg-gray-100 rounded">
            {track.category}
          </span>
          {track.target_skill && (
            <span className="text-xs text-violet-600 px-2 py-0.5 bg-violet-50 rounded">
              Focus: {track.target_skill}
            </span>
          )}
          {track.job_posts && (
            <span className="text-xs text-gray-400">
              {track.job_posts.title}
            </span>
          )}
        </div>
      </div>

      {shouldShowDiagnostic && (
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Skill Diagnostic</h2>
              <p className="text-sm text-gray-500 mt-1">
                Start with a short assessment to measure what you still remember before you work through the track.
              </p>
              {diagnostic?.status === "completed" && diagnostic.score !== null && (
                <p className="text-sm text-emerald-700 mt-2">
                  Last score: {diagnostic.score}%{diagnostic.completed_at ? ` on ${new Date(diagnostic.completed_at).toLocaleDateString()}` : ""}
                </p>
              )}
              {diagnostic?.status === "in_progress" && (
                <p className="text-sm text-yellow-700 mt-2">
                  You have an in-progress diagnostic ready to resume.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {diagnostic?.status === "completed" ? (
                <button
                  onClick={() => startDiagnostic(true)}
                  disabled={diagnosticSaving}
                  className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
                >
                  {diagnosticSaving ? "Starting..." : "Retake Diagnostic"}
                </button>
              ) : (
                <button
                  onClick={() => startDiagnostic(false)}
                  disabled={diagnosticSaving}
                  className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
                >
                  {diagnosticSaving ? "Starting..." : diagnostic ? "Resume Diagnostic" : "Start Diagnostic"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {readyForInterviewPractice && interviewPrep && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-emerald-900">
                Move Into Interview Practice
              </h2>
              <p className="text-sm text-emerald-700 mt-1">
                You&apos;ve built enough mastery on this track to practice against the real role context.
              </p>
              <p className="text-xs text-emerald-700 mt-2">
                {interviewPrep.job_posts?.title || track.job_posts?.title || "Interview prep"}
                {interviewPrep.job_posts?.company
                  ? ` @ ${interviewPrep.job_posts.company}`
                  : ""}
                {masteryAverage !== null ? ` - Mastery ${masteryAverage}%` : ""}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Link
                href={`/portal/interview-prep/${interviewPrep.id}?tab=quiz`}
                className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700"
              >
                Practice Quiz
              </Link>
              <Link
                href={`/portal/interview-prep/${interviewPrep.id}?tab=voice-sim`}
                className="px-4 py-2 bg-white text-emerald-700 text-sm font-medium rounded-lg border border-emerald-300 hover:bg-emerald-100"
              >
                Live Voice Practice
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Progress</span>
          <div className="flex items-center gap-2">
            {dueReviewCount > 0 && (
              <span className="text-xs text-amber-700 px-2 py-0.5 bg-amber-50 rounded">
                {dueReviewCount} due review{dueReviewCount !== 1 ? "s" : ""}
              </span>
            )}
            {masteryAverage !== null && (
              <span className="text-xs text-emerald-700 px-2 py-0.5 bg-emerald-50 rounded">
                Mastery {masteryAverage}%
              </span>
            )}
            <span className="text-sm font-bold text-gray-900">{pct}%</span>
          </div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-violet-600 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {completedCount} of {lessons.length} lessons completed
        </p>
      </div>

      {/* Lesson list */}
      <div className="space-y-2">
        {lessons.map((lesson, index) => {
          const isCompleted = lesson.progress?.status === "completed";
          const isInProgress = lesson.progress?.status === "in_progress";
          const masteryScore =
            typeof lesson.progress?.mastery_score === "number"
              ? lesson.progress.mastery_score
              : null;

          return (
            <button
              key={lesson.id}
              onClick={() => setActiveLesson(lesson)}
              className="w-full text-left bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    isCompleted
                      ? "bg-green-100 text-green-700"
                      : isInProgress
                      ? "bg-violet-100 text-violet-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {isCompleted ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-gray-900 truncate">
                    {lesson.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">
                      {lesson.content_type}
                    </span>
                    <span className="text-xs text-gray-400">
                      ~{lesson.estimated_minutes} min
                    </span>
                    {lesson.is_due_for_review && (
                      <span className="text-xs text-amber-700 px-1.5 py-0.5 bg-amber-50 rounded">
                        Due review
                      </span>
                    )}
                    {masteryScore !== null && (
                      <span className="text-xs text-emerald-700 px-1.5 py-0.5 bg-emerald-50 rounded">
                        Mastery {masteryScore}%
                      </span>
                    )}
                    {lesson.is_bookmarked && (
                      <span className="text-xs text-yellow-500">Bookmarked</span>
                    )}
                  </div>
                </div>
                <svg
                  className="w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </button>
          );
        })}
      </div>
    </div>
    <ToastContainer toasts={toasts} />
    </>
  );
}
