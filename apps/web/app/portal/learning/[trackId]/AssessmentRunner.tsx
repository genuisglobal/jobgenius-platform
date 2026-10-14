"use client";

import { useEffect, useState } from "react";

import type { AssessmentQuestion } from "@/lib/learning/assessment";

type AssessmentRunnerResult = {
  answers: Array<number | null>;
  questions: AssessmentQuestion[];
  score: number;
  correctCount: number;
  totalQuestions: number;
};

export default function AssessmentRunner({
  title,
  description,
  questions,
  ctaLabel = "Finish Assessment",
  busy = false,
  onBack,
  onComplete,
}: {
  title: string;
  description?: string | null;
  questions: AssessmentQuestion[];
  ctaLabel?: string;
  busy?: boolean;
  onBack?: () => void;
  onComplete: (result: AssessmentRunnerResult) => Promise<void> | void;
}) {
  const [items, setItems] = useState<AssessmentQuestion[]>(questions);
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);

  useEffect(() => {
    setItems(questions);
    setCurrentQ(0);
    setSelectedAnswer(null);
  }, [questions]);

  useEffect(() => {
    const currentQuestion = items[currentQ];
    setSelectedAnswer(currentQuestion?.user_answer ?? null);
  }, [currentQ, items]);

  const answeredCount = items.filter((question) => question.user_answer !== null).length;
  const allAnswered = items.length > 0 && answeredCount === items.length;
  const currentQuestion = items[currentQ];
  const isAnswered = currentQuestion?.user_answer !== null;
  const correctCount = items.filter((question) => question.is_correct === true).length;
  const score = items.length > 0 ? Math.round((correctCount / items.length) * 100) : 0;

  function submitAnswer() {
    if (!currentQuestion || selectedAnswer === null || isAnswered) {
      return;
    }

    const updated = items.map((question, index) => {
      if (index !== currentQ) {
        return question;
      }

      return {
        ...question,
        user_answer: selectedAnswer,
        is_correct: selectedAnswer === question.correct_index,
      };
    });

    setItems(updated);

    if (currentQ < items.length - 1) {
      setCurrentQ((prev) => prev + 1);
    }
  }

  async function finishAssessment() {
    if (!allAnswered || busy) {
      return;
    }

    await onComplete({
      answers: items.map((question) => question.user_answer),
      questions: items,
      score,
      correctCount,
      totalQuestions: items.length,
    });
  }

  if (!currentQuestion) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center">
        <p className="text-sm text-gray-500">No assessment questions available.</p>
        {onBack && (
          <button
            onClick={onBack}
            className="mt-4 text-sm text-violet-600 hover:text-violet-800"
          >
            Go Back
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        {onBack ? (
          <button
            onClick={onBack}
            className="text-sm text-violet-600 hover:text-violet-800"
          >
            &larr; Back
          </button>
        ) : (
          <span />
        )}
        <span className="text-sm text-gray-500">
          Question {currentQ + 1} of {items.length}
        </span>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-2 mb-6">
        <div
          className="bg-violet-600 h-2 rounded-full transition-all"
          style={{ width: `${(answeredCount / items.length) * 100}%` }}
        />
      </div>

      <div className="bg-white rounded-lg shadow p-4 sm:p-6 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        )}

        {allAnswered && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-lg font-bold text-green-700">Score: {score}%</p>
            <p className="text-sm text-green-600">
              {correctCount} of {items.length} correct
            </p>
          </div>
        )}

        <div className="mt-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            {currentQuestion.question}
          </h3>

          <div className="space-y-2">
            {currentQuestion.options.map((option, index) => {
              let optionStyle = "border-gray-200 hover:border-violet-300";
              if (isAnswered) {
                if (index === currentQuestion.correct_index) {
                  optionStyle = "border-green-500 bg-green-50";
                } else if (index === currentQuestion.user_answer && currentQuestion.is_correct === false) {
                  optionStyle = "border-red-500 bg-red-50";
                }
              } else if (selectedAnswer === index) {
                optionStyle = "border-violet-500 bg-violet-50";
              }

              return (
                <button
                  key={index}
                  type="button"
                  disabled={isAnswered}
                  onClick={() => setSelectedAnswer(index)}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-colors min-h-[44px] ${optionStyle}`}
                >
                  <span className="text-sm text-gray-700">
                    <span className="font-medium mr-2">{String.fromCharCode(65 + index)}.</span>
                    {option}
                  </span>
                </button>
              );
            })}
          </div>

          {isAnswered && currentQuestion.explanation && (
            <div className="mt-4 p-3 bg-violet-50 rounded-lg">
              <p className="text-sm text-violet-700">
                <strong>Explanation:</strong> {currentQuestion.explanation}
              </p>
            </div>
          )}

          {!isAnswered && (
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={submitAnswer}
                disabled={selectedAnswer === null}
                className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
              >
                Submit Answer
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {items.map((question, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setCurrentQ(index)}
              className={`w-9 h-9 rounded-full text-xs font-medium ${
                index === currentQ
                  ? "bg-violet-600 text-white"
                  : question.is_correct === true
                  ? "bg-green-100 text-green-700"
                  : question.is_correct === false
                  ? "bg-red-100 text-red-700"
                  : question.user_answer !== null
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {index + 1}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={finishAssessment}
          disabled={!allAnswered || busy}
          className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "Saving..." : ctaLabel}
        </button>
      </div>
    </div>
  );
}
