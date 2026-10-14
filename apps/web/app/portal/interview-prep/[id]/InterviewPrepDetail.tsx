"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import AudioPractice from "./AudioPractice";
import QuizTab from "./QuizTab";
import QABankTab from "./QABankTab";
import VoiceSimulatorTab from "./VoiceSimulatorTab";

type PrepContent = {
  role_summary?: string;
  company_notes?: string[];
  likely_questions?: string[];
  answer_structure?: string[];
  technical_topics?: string[];
  behavioral_topics?: string[];
  checklist?: string[];
  thirty_sixty_ninety?: string[];
};

type Prep = {
  id: string;
  content: PrepContent;
  job_posts: { title: string; company: string | null } | null;
  updated_at: string;
};

type Video = {
  id: string;
  title: string;
  url: string;
  source: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  description: string | null;
  category: string | null;
};

type PracticeQuestion = {
  question: string;
  expected_hint: string;
  user_answer: string;
  score: number | null;
  feedback: string | null;
  star_score?: number | null;
  relevance_score?: number | null;
  specificity_score?: number | null;
  confidence_coaching?: string | null;
  rewrite_suggestions?: string[] | null;
};

type Session = {
  id: string;
  session_type: string;
  status: string;
  questions: PracticeQuestion[];
  overall_score: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type InterviewInfo = {
  scheduled_at: string | null;
  status: string;
};

type ProgressStats = {
  total_sessions: number;
  total_questions_answered: number;
  average_score: number;
  best_score: number;
  recent_average: number;
  older_average: number;
  streak_days: number;
  sessions_this_week: number;
  questions_this_week: number;
  score_trend: "improving" | "stable" | "declining";
};

const SUB_TABS = [
  { key: "notes", label: "Study Notes" },
  { key: "videos", label: "Videos" },
  { key: "practice", label: "Practice Q&A" },
  { key: "simulation", label: "Audio Simulation" },
  { key: "quiz", label: "Quiz" },
  { key: "qa-bank", label: "Q&A Bank" },
  { key: "voice-sim", label: "Voice Simulator" },
] as const;

export default function InterviewPrepDetail({
  prep,
  videos,
  sessions: initialSessions,
  interview,
  initialTab,
}: {
  prep: Prep;
  videos: Video[];
  sessions: Session[];
  interview?: InterviewInfo | null;
  initialTab?: string;
}) {
  const defaultTab = SUB_TABS.some((tab) => tab.key === initialTab)
    ? initialTab!
    : "notes";
  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<ProgressStats | null>(null);

  const content = prep.content ?? {};
  const jobPost = prep.job_posts;

  useEffect(() => {
    if (initialTab && SUB_TABS.some((tab) => tab.key === initialTab)) {
      setActiveTab(initialTab);
      setActiveSession(null);
    }
  }, [initialTab]);

  useEffect(() => {
    fetch("/api/portal/interview-prep/progress")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.progress) setProgress(data.progress);
      })
      .catch((err) => console.error("[interview-prep] fetch progress failed:", err));
  }, []);

  async function startNewPractice(sessionType: "qa" | "audio_simulation" = "qa") {
    setCreating(true);
    try {
      const res = await fetch(
        `/api/portal/interview-prep/${prep.id}/practice`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_type: sessionType }),
        }
      );
      if (res.ok) {
        const { session } = await res.json();
        setSessions((prev) => [session, ...prev]);
        setActiveSession(session);
        setCurrentQ(0);
        setUserAnswer("");

        await fetch(
          `/api/portal/interview-prep/${prep.id}/practice/${session.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "in_progress" }),
          }
        );
      }
    } finally {
      setCreating(false);
    }
  }

  async function submitAnswer() {
    if (!activeSession || !userAnswer.trim()) return;
    setSubmitting(true);

    const updatedQuestions = [...activeSession.questions];
    updatedQuestions[currentQ] = {
      ...updatedQuestions[currentQ],
      user_answer: userAnswer.trim(),
    };

    const isLast = currentQ === activeSession.questions.length - 1;

    try {
      const res = await fetch(
        `/api/portal/interview-prep/${prep.id}/practice/${activeSession.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questions: updatedQuestions,
            status: isLast ? "completed" : "in_progress",
          }),
        }
      );

      if (res.ok) {
        const { session: updated } = await res.json();
        setActiveSession(updated);
        setSessions((prev) =>
          prev.map((s) => (s.id === updated.id ? updated : s))
        );

        if (!isLast) {
          setCurrentQ(currentQ + 1);
          setUserAnswer("");
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  function resumeSession(session: Session) {
    setActiveSession(session);
    const firstUnanswered = session.questions.findIndex(
      (q) => !q.user_answer
    );
    setCurrentQ(firstUnanswered >= 0 ? firstUnanswered : 0);
    setUserAnswer("");
  }

  function handleAudioAnswerSubmitted(updatedSession: Session) {
    setActiveSession(updatedSession);
    setSessions((prev) =>
      prev.map((s) => (s.id === updatedSession.id ? updatedSession : s))
    );
    const nextUnanswered = updatedSession.questions.findIndex(
      (q) => !q.user_answer
    );
    if (nextUnanswered >= 0) {
      setCurrentQ(nextUnanswered);
    }
  }

  // Interview countdown
  const daysUntilInterview =
    interview?.scheduled_at
      ? Math.max(
          0,
          Math.ceil(
            (new Date(interview.scheduled_at).getTime() - Date.now()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : null;

  const readiness = progress?.average_score ?? 0;
  const questionsNeeded =
    readiness < 80 ? Math.ceil((80 - readiness) / 3) : 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/portal/interview-prep"
          className="text-sm text-violet-600 hover:text-violet-800"
        >
          &larr; Back to Interview Prep
        </Link>
        <h2 className="text-xl font-semibold text-gray-900 mt-1">
          {jobPost?.title || "Interview Preparation"}
        </h2>
        {jobPost?.company && (
          <p className="text-sm text-gray-500">{jobPost.company}</p>
        )}
      </div>

      {/* Interview Countdown Banner */}
      {daysUntilInterview !== null && daysUntilInterview >= 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-purple-800">
                Interview in {daysUntilInterview} day
                {daysUntilInterview !== 1 ? "s" : ""}
              </p>
              <p className="text-sm text-purple-700 mt-0.5">
                Readiness: {readiness}%
                {questionsNeeded > 0 &&
                  ` — Practice ${questionsNeeded} more question${questionsNeeded !== 1 ? "s" : ""} to reach 80%`}
              </p>
            </div>
            <div className="text-2xl font-bold text-purple-900">
              {daysUntilInterview}d
            </div>
          </div>
        </div>
      )}

      {/* Progress Banner */}
      {progress && progress.total_sessions > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm text-gray-700">
              {progress.questions_this_week > 0 ? (
                <>
                  You&apos;ve practiced{" "}
                  <span className="font-semibold">
                    {progress.questions_this_week} question
                    {progress.questions_this_week !== 1 ? "s" : ""}
                  </span>{" "}
                  this week. Average score:{" "}
                  <span className="font-semibold">{progress.average_score}%</span>
                  {progress.score_trend !== "stable" && (
                    <span
                      className={
                        progress.score_trend === "improving"
                          ? "text-green-700"
                          : "text-red-700"
                      }
                    >
                      {" "}
                      ({progress.score_trend})
                    </span>
                  )}
                </>
              ) : (
                <>
                  {progress.total_sessions} session
                  {progress.total_sessions !== 1 ? "s" : ""} completed.
                  Average score: {progress.average_score}%
                </>
              )}
            </div>
            {progress.streak_days > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-medium">
                {progress.streak_days}-day streak
              </span>
            )}
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mb-6">
        <div className="flex space-x-1 bg-gray-100 rounded-lg p-1 min-w-max sm:min-w-0">
          {SUB_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setActiveSession(null);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className={`flex-shrink-0 sm:flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Study Notes Tab */}
      {activeTab === "notes" && (
        <div className="space-y-6">
          <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 text-sm text-violet-700">
            Study notes generated from the job description and your resume.
            Review these before your interview.
          </div>

          {content.role_summary && (
            <Section title="Role Summary">
              <p className="text-sm text-gray-700">{content.role_summary}</p>
            </Section>
          )}

          {content.company_notes && content.company_notes.length > 0 && (
            <Section title="Company Research">
              <ul className="list-disc list-inside space-y-1">
                {content.company_notes.map((note, i) => (
                  <li key={i} className="text-sm text-gray-700">{note}</li>
                ))}
              </ul>
            </Section>
          )}

          {content.likely_questions && content.likely_questions.length > 0 && (
            <Section title="Likely Questions">
              <ol className="list-decimal list-inside space-y-2">
                {content.likely_questions.map((q, i) => (
                  <li key={i} className="text-sm text-gray-700">{q}</li>
                ))}
              </ol>
            </Section>
          )}

          {content.answer_structure && content.answer_structure.length > 0 && (
            <Section title="Answer Structure (STAR Method)">
              <ol className="list-decimal list-inside space-y-1">
                {content.answer_structure.map((step, i) => (
                  <li key={i} className="text-sm text-gray-700">{step}</li>
                ))}
              </ol>
            </Section>
          )}

          {content.technical_topics && content.technical_topics.length > 0 && (
            <Section title="Technical Topics">
              <ul className="list-disc list-inside space-y-1">
                {content.technical_topics.map((topic, i) => (
                  <li key={i} className="text-sm text-gray-700">{topic}</li>
                ))}
              </ul>
            </Section>
          )}

          {content.behavioral_topics && content.behavioral_topics.length > 0 && (
            <Section title="Behavioral Topics">
              <ul className="list-disc list-inside space-y-1">
                {content.behavioral_topics.map((topic, i) => (
                  <li key={i} className="text-sm text-gray-700">{topic}</li>
                ))}
              </ul>
            </Section>
          )}

          {content.checklist && content.checklist.length > 0 && (
            <Section title="Prep Checklist">
              <ul className="space-y-2">
                {content.checklist.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <input type="checkbox" className="mt-0.5 rounded border-gray-300" />
                    {item}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {content.thirty_sixty_ninety && content.thirty_sixty_ninety.length > 0 && (
            <Section title="30/60/90 Day Plan">
              <ul className="list-disc list-inside space-y-1">
                {content.thirty_sixty_ninety.map((item, i) => (
                  <li key={i} className="text-sm text-gray-700">{item}</li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}

      {/* Videos Tab */}
      {activeTab === "videos" && (
        <div>
          {videos.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <div className="text-4xl mb-4">🎥</div>
              <p className="text-gray-500">No videos added yet.</p>
              <p className="text-sm text-gray-400 mt-2">
                Your account manager will add recommended preparation videos
                here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {videos.map((video) => (
                <a
                  key={video.id}
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
                >
                  {video.thumbnail_url && (
                    <div className="w-full h-40 bg-gray-200 rounded-md mb-3 overflow-hidden">
                      <img
                        src={video.thumbnail_url}
                        alt={video.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <h4 className="text-sm font-semibold text-gray-900">
                    {video.title}
                  </h4>
                  {video.description && (
                    <p className="text-sm text-gray-600 mt-1">
                      {video.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                    {video.category && (
                      <span className="px-2 py-0.5 bg-gray-100 rounded">
                        {video.category}
                      </span>
                    )}
                    {video.duration_seconds && (
                      <span>
                        {Math.floor(video.duration_seconds / 60)} min
                      </span>
                    )}
                    {video.source && <span>{video.source}</span>}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Practice Q&A Tab */}
      {activeTab === "practice" && (
        <div>
          {activeSession ? (
            <PracticeSessionView
              session={activeSession}
              currentQ={currentQ}
              userAnswer={userAnswer}
              submitting={submitting}
              onAnswerChange={setUserAnswer}
              onSubmit={submitAnswer}
              onBack={() => setActiveSession(null)}
              onNavigate={(i) => {
                setCurrentQ(i);
                setUserAnswer(activeSession.questions[i]?.user_answer || "");
              }}
              prepId={prep.id}
            />
          ) : (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Practice Sessions
                </h3>
                <button
                  onClick={() => startNewPractice("qa")}
                  disabled={creating}
                  className="px-4 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors w-full sm:w-auto"
                >
                  {creating ? "Creating..." : "Start New Practice"}
                </button>
              </div>

              {sessions.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-8 text-center">
                  <div className="text-4xl mb-4">💬</div>
                  <p className="text-gray-500">No practice sessions yet.</p>
                  <p className="text-sm text-gray-400 mt-2">
                    Start a practice session to test your interview readiness.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sessions
                    .filter((s) => s.session_type === "qa")
                    .map((session) => (
                      <div
                        key={session.id}
                        className="bg-white rounded-lg shadow p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                session.status === "completed"
                                  ? "bg-green-100 text-green-700"
                                  : session.status === "in_progress"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {session.status.replace("_", " ")}
                            </span>
                            {session.overall_score !== null && (
                              <span className="text-sm font-bold text-gray-900">
                                Score: {session.overall_score}%
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            {session.questions.length} questions
                            {" - "}
                            {new Date(session.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={() => resumeSession(session)}
                          className="px-3 py-2 text-sm bg-violet-50 text-violet-700 rounded-md hover:bg-violet-100 sm:py-1 self-start sm:self-auto"
                        >
                          {session.status === "completed"
                            ? "Review"
                            : "Continue"}
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Audio Simulation Tab */}
      {activeTab === "simulation" && (
        <div>
          {activeSession ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setActiveSession(null)}
                  className="text-sm text-violet-600 hover:text-violet-800"
                >
                  &larr; Back to sessions
                </button>
                <span className="text-sm text-gray-500">
                  Question {currentQ + 1} of {activeSession.questions.length}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-gray-200 rounded-full h-2 mb-6">
                <div
                  className="bg-violet-600 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      (activeSession.questions.filter((q) => q.user_answer)
                        .length /
                        activeSession.questions.length) *
                      100
                    }%`,
                  }}
                />
              </div>

              {activeSession.status === "completed" &&
                activeSession.overall_score !== null && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-center">
                    <p className="text-lg font-bold text-green-700">
                      Overall Score: {activeSession.overall_score}%
                    </p>
                    <p className="text-sm text-green-600 mt-1">
                      Audio practice complete! Review your answers below.
                    </p>
                  </div>
                )}

              <AudioPractice
                prepId={prep.id}
                session={activeSession}
                currentQ={currentQ}
                onAnswerSubmitted={handleAudioAnswerSubmitted}
              />

              {/* Question navigation */}
              <div className="flex justify-center gap-2 mt-6 flex-wrap">
                {activeSession.questions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentQ(i)}
                    className={`w-9 h-9 sm:w-8 sm:h-8 rounded-full text-xs font-medium ${
                      i === currentQ
                        ? "bg-violet-600 text-white"
                        : q.user_answer
                        ? q.score !== null && q.score >= 70
                          ? "bg-green-100 text-green-700"
                          : q.score !== null
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-gray-200 text-gray-600"
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Audio Practice Sessions
                </h3>
                <button
                  onClick={() => startNewPractice("audio_simulation")}
                  disabled={creating}
                  className="px-4 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors w-full sm:w-auto"
                >
                  {creating ? "Creating..." : "Start Audio Practice"}
                </button>
              </div>

              {sessions.filter((s) => s.session_type === "audio_simulation")
                .length === 0 ? (
                <div className="bg-white rounded-lg shadow p-8 text-center">
                  <div className="text-4xl mb-4">🎙️</div>
                  <p className="text-gray-600 font-medium mb-2">
                    Practice answering interview questions out loud
                  </p>
                  <p className="text-sm text-gray-400 max-w-md mx-auto">
                    Your speech will be transcribed and scored with AI-powered
                    feedback. Use Chrome or Edge for the best experience.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sessions
                    .filter((s) => s.session_type === "audio_simulation")
                    .map((session) => (
                      <div
                        key={session.id}
                        className="bg-white rounded-lg shadow p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                session.status === "completed"
                                  ? "bg-green-100 text-green-700"
                                  : session.status === "in_progress"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {session.status.replace("_", " ")}
                            </span>
                            {session.overall_score !== null && (
                              <span className="text-sm font-bold text-gray-900">
                                Score: {session.overall_score}%
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            {session.questions.length} questions
                            {" - "}
                            {new Date(session.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={() => resumeSession(session)}
                          className="px-3 py-2 text-sm bg-violet-50 text-violet-700 rounded-md hover:bg-violet-100 sm:py-1 self-start sm:self-auto"
                        >
                          {session.status === "completed"
                            ? "Review"
                            : "Continue"}
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Quiz Tab */}
      {activeTab === "quiz" && <QuizTab prepId={prep.id} />}

      {/* Q&A Bank Tab */}
      {activeTab === "qa-bank" && <QABankTab prepId={prep.id} />}

      {/* Voice Simulator Tab */}
      {activeTab === "voice-sim" && <VoiceSimulatorTab prepId={prep.id} />}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-5">
      <h3 className="text-base font-semibold text-gray-900 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function ScorePill({ label, score }: { label: string; score?: number | null }) {
  if (score === null || score === undefined) return null;
  const tone =
    score >= 80
      ? "bg-green-50 text-green-700"
      : score >= 60
      ? "bg-yellow-50 text-yellow-700"
      : "bg-red-50 text-red-700";
  return (
    <div className={`rounded-lg px-3 py-2 ${tone}`}>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="text-lg font-semibold">{score}</div>
    </div>
  );
}

function PracticeSessionView({
  session,
  currentQ,
  userAnswer,
  submitting,
  onAnswerChange,
  onSubmit,
  onBack,
  onNavigate,
}: {
  session: Session;
  currentQ: number;
  userAnswer: string;
  submitting: boolean;
  onAnswerChange: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  onNavigate: (index: number) => void;
  prepId: string;
}) {
  const question = session.questions[currentQ];
  const isCompleted = session.status === "completed";
  const answeredCount = session.questions.filter(
    (q) => q.user_answer
  ).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="text-sm text-violet-600 hover:text-violet-800"
        >
          &larr; Back to sessions
        </button>
        <span className="text-sm text-gray-500">
          Question {currentQ + 1} of {session.questions.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2 mb-6">
        <div
          className="bg-violet-600 h-2 rounded-full transition-all duration-300"
          style={{
            width: `${(answeredCount / session.questions.length) * 100}%`,
          }}
        />
      </div>

      {isCompleted && session.overall_score !== null && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-center">
          <p className="text-lg font-bold text-green-700">
            Overall Score: {session.overall_score}%
          </p>
          <p className="text-sm text-green-600 mt-1">
            Practice session complete! Review your answers below.
          </p>
        </div>
      )}

      {/* Question */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">
          {question?.question}
        </h3>

        {question?.user_answer ? (
          <div>
            <div className="bg-gray-50 rounded-lg p-3 sm:p-4 mb-3">
              <p className="text-sm font-medium text-gray-500 mb-1">
                Your Answer:
              </p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {question.user_answer}
              </p>
            </div>
            {question.score !== null && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <ScorePill label="Overall" score={question.score} />
                <ScorePill label="STAR" score={question.star_score} />
                <ScorePill label="Relevance" score={question.relevance_score} />
                <ScorePill label="Specificity" score={question.specificity_score} />
              </div>
            )}
            {question.feedback && (
              <p className="text-sm text-gray-700 mb-2">
                <span className="font-semibold">Coach feedback:</span>{" "}
                {question.feedback}
              </p>
            )}
            {question.confidence_coaching && (
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 mb-2">
                <p className="text-sm text-violet-700">
                  <span className="font-semibold">Confidence coaching:</span>{" "}
                  {question.confidence_coaching}
                </p>
              </div>
            )}
            {question.rewrite_suggestions &&
              question.rewrite_suggestions.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg p-3">
                  <p className="text-sm font-semibold text-gray-900 mb-2">
                    Rewrite suggestions
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                    {question.rewrite_suggestions.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
          </div>
        ) : (
          <div>
            <textarea
              value={userAnswer}
              onChange={(e) => onAnswerChange(e.target.value)}
              rows={6}
              placeholder="Type your answer here... Use the STAR method (Situation, Task, Action, Result) for behavioral questions."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
            <div className="flex justify-end mt-3">
              <button
                onClick={onSubmit}
                disabled={submitting || !userAnswer.trim()}
                className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {submitting
                  ? "Submitting..."
                  : currentQ === session.questions.length - 1
                  ? "Submit & Finish"
                  : "Submit & Next"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Question navigation */}
      <div className="flex justify-center gap-2 mt-6 flex-wrap">
        {session.questions.map((q, i) => (
          <button
            key={i}
            onClick={() => onNavigate(i)}
            className={`w-9 h-9 sm:w-8 sm:h-8 rounded-full text-xs font-medium ${
              i === currentQ
                ? "bg-violet-600 text-white"
                : q.user_answer
                ? q.score !== null && q.score >= 70
                  ? "bg-green-100 text-green-700"
                  : q.score !== null
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-gray-200 text-gray-600"
                : "bg-gray-100 text-gray-400"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
