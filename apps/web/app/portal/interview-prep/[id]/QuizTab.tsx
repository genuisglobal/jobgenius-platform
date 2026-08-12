"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast, ToastContainer } from "@/lib/use-toast";

type QuizQuestion = {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  user_answer: number | null;
  is_correct: boolean | null;
};

type Quiz = {
  id: string;
  title: string;
  quiz_type: string;
  questions: QuizQuestion[];
  total_questions: number;
  correct_count: number;
  score: number | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type QuizSummary = {
  id: string;
  title: string;
  quiz_type: string;
  total_questions: number;
  correct_count: number;
  score: number | null;
  status: string;
  created_at: string;
};

export default function QuizTab({ prepId }: { prepId: string }) {
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quizType, setQuizType] = useState("general");
  const { toasts, toast } = useToast();

  // Keyboard shortcuts for quiz navigation
  useEffect(() => {
    if (!activeQuiz) return;
    const question = activeQuiz.questions[currentQ];
    const isAnswered = question?.user_answer !== null;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" && currentQ > 0) {
        setCurrentQ((q) => q - 1);
        setSelectedAnswer(null);
      } else if (e.key === "ArrowRight" && currentQ < activeQuiz!.questions.length - 1) {
        setCurrentQ((q) => q + 1);
        setSelectedAnswer(null);
      } else if (e.key === "Enter" && selectedAnswer !== null && !isAnswered && !submitting) {
        e.preventDefault();
        submitAnswer();
      } else if (!isAnswered && e.key >= "1" && e.key <= "4") {
        const idx = parseInt(e.key) - 1;
        if (idx < (question?.options.length ?? 0)) {
          setSelectedAnswer(idx);
        }
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeQuiz, currentQ, selectedAnswer, submitting]);

  // Load quizzes on first render
  if (!loaded) {
    setLoaded(true);
    fetch(`/api/portal/interview-prep/${prepId}/quiz`)
      .then((res) => res.json())
      .then((data) => setQuizzes(data.quizzes ?? []))
      .catch((err) => console.error("[interview-prep] fetch quizzes failed:", err))
      .finally(() => setLoading(false));
  }

  async function generateQuiz() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/portal/interview-prep/${prepId}/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quiz_type: quizType, count: 10 }),
      });
      if (res.ok) {
        const { quiz } = await res.json();
        setActiveQuiz(quiz);
        setCurrentQ(0);
        setSelectedAnswer(null);
        setQuizzes((prev) => [
          {
            id: quiz.id,
            title: quiz.title,
            quiz_type: quiz.quiz_type,
            total_questions: quiz.total_questions,
            correct_count: 0,
            score: null,
            status: "not_started",
            created_at: quiz.created_at,
          },
          ...prev,
        ]);
      }
    } finally {
      setGenerating(false);
    }
  }

  async function loadQuiz(quizId: string) {
    const res = await fetch(`/api/portal/interview-prep/${prepId}/quiz/${quizId}`);
    if (res.ok) {
      const { quiz } = await res.json();
      setActiveQuiz(quiz);
      const firstUnanswered = quiz.questions.findIndex(
        (q: QuizQuestion) => q.user_answer === null
      );
      setCurrentQ(firstUnanswered >= 0 ? firstUnanswered : 0);
      setSelectedAnswer(null);
    }
  }

  async function submitAnswer() {
    if (!activeQuiz || selectedAnswer === null) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/portal/interview-prep/${prepId}/quiz/${activeQuiz.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question_index: currentQ,
            user_answer: selectedAnswer,
          }),
        }
      );
      if (res.ok) {
        const { quiz: updated } = await res.json();
        setActiveQuiz(updated);
        setSelectedAnswer(null);

        // Update summary list
        setQuizzes((prev) =>
          prev.map((q) =>
            q.id === updated.id
              ? {
                  ...q,
                  status: updated.status,
                  score: updated.score,
                  correct_count: updated.correct_count,
                }
              : q
          )
        );

        // Move to next unanswered
        if (updated.status === "completed") {
          toast(`Quiz complete! Score: ${updated.score}%`);
        } else {
          const isCorrect = updated.questions[currentQ]?.is_correct;
          toast(isCorrect ? "Correct!" : "Incorrect", isCorrect ? "success" : "error");
          const nextQ = updated.questions.findIndex(
            (q: QuizQuestion, i: number) => i > currentQ && q.user_answer === null
          );
          if (nextQ >= 0) setCurrentQ(nextQ);
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-8">Loading quizzes...</p>;
  }

  // Active quiz view
  if (activeQuiz) {
    const question = activeQuiz.questions[currentQ];
    const isAnswered = question?.user_answer !== null;
    const isCompleted = activeQuiz.status === "completed";
    const answeredCount = activeQuiz.questions.filter(
      (q) => q.user_answer !== null
    ).length;

    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setActiveQuiz(null)}
            className="text-sm text-violet-600 hover:text-violet-800"
          >
            &larr; Back to quizzes
          </button>
          <span className="text-sm text-gray-500">
            Question {currentQ + 1} of {activeQuiz.questions.length}
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 mb-6">
          <div
            className="bg-violet-600 h-2 rounded-full transition-all"
            style={{
              width: `${(answeredCount / activeQuiz.questions.length) * 100}%`,
            }}
          />
        </div>

        {/* Score if completed */}
        {isCompleted && activeQuiz.score !== null && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-center">
            <p className="text-lg font-bold text-green-700">
              Score: {activeQuiz.score}%
            </p>
            <p className="text-sm text-green-600">
              {activeQuiz.correct_count} of {activeQuiz.total_questions} correct
            </p>
          </div>
        )}

        {/* Question */}
        <div className="bg-white rounded-lg shadow p-4 sm:p-6 mb-4">
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            {question?.question}
          </h3>

          <div className="space-y-2.5 sm:space-y-2">
            {question?.options.map((option, i) => {
              let optionStyle = "border-gray-200 hover:border-violet-300";
              if (isAnswered) {
                if (i === question.correct_index) {
                  optionStyle = "border-green-500 bg-green-50";
                } else if (
                  i === question.user_answer &&
                  !question.is_correct
                ) {
                  optionStyle = "border-red-500 bg-red-50";
                }
              } else if (selectedAnswer === i) {
                optionStyle = "border-violet-500 bg-violet-50";
              }

              return (
                <button
                  key={i}
                  onClick={() => !isAnswered && setSelectedAnswer(i)}
                  disabled={isAnswered}
                  className={`w-full text-left p-3.5 sm:p-3 rounded-lg border-2 transition-colors min-h-[44px] ${optionStyle}`}
                >
                  <span className="text-sm text-gray-700">
                    <span className="font-medium mr-2">
                      {String.fromCharCode(65 + i)}.
                    </span>
                    {option}
                  </span>
                </button>
              );
            })}
          </div>

          {isAnswered && question?.explanation && (
            <div className="mt-4 p-3 bg-violet-50 rounded-lg">
              <p className="text-sm text-violet-700">
                <strong>Explanation:</strong> {question.explanation}
              </p>
            </div>
          )}

          {!isAnswered && (
            <div className="flex justify-end mt-4">
              <button
                onClick={submitAnswer}
                disabled={submitting || selectedAnswer === null}
                className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit Answer"}
              </button>
            </div>
          )}
        </div>

        {/* Question navigation */}
        <div className="flex justify-center gap-2 flex-wrap">
          {activeQuiz.questions.map((q, i) => (
            <button
              key={i}
              onClick={() => {
                setCurrentQ(i);
                setSelectedAnswer(null);
              }}
              className={`w-9 h-9 sm:w-8 sm:h-8 rounded-full text-xs font-medium ${
                i === currentQ
                  ? "bg-violet-600 text-white"
                  : q.is_correct === true
                  ? "bg-green-100 text-green-700"
                  : q.is_correct === false
                  ? "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <ToastContainer toasts={toasts} />
      </div>
    );
  }

  // Quiz list view
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h3 className="text-lg font-medium text-gray-900">Quizzes</h3>
        <div className="flex items-center gap-2">
          <select
            value={quizType}
            onChange={(e) => setQuizType(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-2 sm:py-1.5 text-sm text-gray-900 flex-1 sm:flex-initial"
          >
            <option value="general">General</option>
            <option value="technical">Technical</option>
            <option value="behavioral">Behavioral</option>
            <option value="company">Company</option>
          </select>
          <button
            onClick={generateQuiz}
            disabled={generating}
            className="px-4 py-2.5 sm:py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 whitespace-nowrap"
          >
            {generating ? "Generating..." : "Generate Quiz"}
          </button>
        </div>
      </div>

      {quizzes.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 mb-2">No quizzes yet.</p>
          <p className="text-sm text-gray-400">
            Generate a quiz to test your interview knowledge.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {quizzes.map((quiz) => (
            <div
              key={quiz.id}
              className="bg-white rounded-lg shadow p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div>
                <h4 className="text-sm font-medium text-gray-900">
                  {quiz.title}
                </h4>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      quiz.status === "completed"
                        ? "bg-green-100 text-green-700"
                        : quiz.status === "in_progress"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {quiz.status.replace("_", " ")}
                  </span>
                  {quiz.score !== null && (
                    <span className="text-sm font-bold text-gray-900">
                      {quiz.score}%
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    {quiz.total_questions} questions
                  </span>
                </div>
              </div>
              <button
                onClick={() => loadQuiz(quiz.id)}
                className="px-3 py-2 sm:py-1 text-sm bg-violet-50 text-violet-700 rounded-md hover:bg-violet-100 self-start sm:self-auto"
              >
                {quiz.status === "completed" ? "Review" : quiz.status === "in_progress" ? "Continue" : "Start"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
