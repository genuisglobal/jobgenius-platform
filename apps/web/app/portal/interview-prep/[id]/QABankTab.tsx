"use client";

import { useState, useEffect } from "react";
import { useToast, ToastContainer } from "@/lib/use-toast";

type QAResponse = {
  qa_card_id: string;
  user_answer: string;
  ai_feedback: string | null;
  score: number | null;
  is_starred: boolean;
};

type QACard = {
  id: string;
  category: string;
  question: string;
  model_answer: string;
  key_points: string[];
  tips: string | null;
  difficulty: string;
  sort_order: number;
  response: QAResponse | null;
};

const CATEGORIES = ["all", "behavioral", "technical", "situational", "company", "general"];
const DIFFICULTIES = ["all", "easy", "medium", "hard"];

export default function QABankTab({ prepId }: { prepId: string }) {
  const [cards, setCards] = useState<QACard[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [userAnswer, setUserAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterDifficulty, setFilterDifficulty] = useState("all");
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const { toasts, toast } = useToast();

  useEffect(() => {
    fetch(`/api/portal/interview-prep/${prepId}/qa-cards`)
      .then((res) => res.json())
      .then((data) => setCards(data.cards ?? []))
      .catch((err) => console.error("[interview-prep] fetch QA cards failed:", err))
      .finally(() => setLoading(false));
  }, [prepId]);

  const filteredCards = cards.filter((card) => {
    if (filterCategory !== "all" && card.category !== filterCategory) return false;
    if (filterDifficulty !== "all" && card.difficulty !== filterDifficulty) return false;
    if (showStarredOnly && !card.response?.is_starred) return false;
    return true;
  });

  async function submitResponse(cardId: string) {
    if (!userAnswer.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/portal/interview-prep/${prepId}/qa-cards/${cardId}/respond`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_answer: userAnswer.trim() }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        setCards((prev) =>
          prev.map((c) =>
            c.id === cardId
              ? { ...c, response: data.response }
              : c
          )
        );
        setUserAnswer("");
        const score = data.response?.score;
        toast(score != null ? `Scored ${score}%` : "Answer submitted");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-8">Loading Q&A cards...</p>;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h3 className="text-lg font-medium text-gray-900">
          Q&A Bank ({cards.length} cards)
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-2 sm:py-1 text-sm text-gray-900 flex-1 sm:flex-initial"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "All Categories" : c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
          <select
            value={filterDifficulty}
            onChange={(e) => setFilterDifficulty(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-2 sm:py-1 text-sm text-gray-900"
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d === "all" ? "All Levels" : d.charAt(0).toUpperCase() + d.slice(1)}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowStarredOnly(!showStarredOnly)}
            className={`px-3 py-2 sm:px-2 sm:py-1 text-sm rounded-md border ${
              showStarredOnly
                ? "border-yellow-400 bg-yellow-50 text-yellow-700"
                : "border-gray-300 text-gray-500"
            }`}
          >
            Starred
          </button>
        </div>
      </div>

      {filteredCards.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 mb-2">
            {cards.length === 0
              ? "No Q&A cards yet."
              : "No cards match your filters."}
          </p>
          {cards.length === 0 && (
            <p className="text-sm text-gray-400">
              Your account manager will generate Q&A cards for you.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCards.map((card) => {
            const isExpanded = expandedCard === card.id;

            return (
              <div
                key={card.id}
                className="bg-white rounded-lg shadow overflow-hidden"
              >
                <button
                  onClick={() => {
                    setExpandedCard(isExpanded ? null : card.id);
                    setUserAnswer(card.response?.user_answer ?? "");
                  }}
                  className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-gray-900">
                        {card.question}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400 px-1.5 py-0.5 bg-gray-100 rounded">
                          {card.category}
                        </span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            card.difficulty === "hard"
                              ? "bg-red-100 text-red-600"
                              : card.difficulty === "easy"
                              ? "bg-green-100 text-green-600"
                              : "bg-yellow-100 text-yellow-600"
                          }`}
                        >
                          {card.difficulty}
                        </span>
                        {card.response?.score !== null && card.response?.score !== undefined && (
                          <span
                            className={`text-xs font-medium ${
                              card.response.score >= 70
                                ? "text-green-600"
                                : card.response.score >= 50
                                ? "text-yellow-600"
                                : "text-red-600"
                            }`}
                          >
                            Score: {card.response.score}%
                          </span>
                        )}
                        {card.response?.is_starred && (
                          <span className="text-yellow-500 text-xs">Starred</span>
                        )}
                      </div>
                    </div>
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-100 p-3 sm:p-4">
                    {/* Model answer */}
                    <div className="mb-4">
                      <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Model Answer
                      </h5>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">
                        {card.model_answer}
                      </p>
                    </div>

                    {/* Key points */}
                    {card.key_points.length > 0 && (
                      <div className="mb-4">
                        <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Key Points
                        </h5>
                        <ul className="list-disc list-inside space-y-1">
                          {card.key_points.map((point, i) => (
                            <li key={i} className="text-sm text-gray-600">
                              {point}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Tips */}
                    {card.tips && (
                      <div className="mb-4 p-3 bg-violet-50 rounded-lg">
                        <p className="text-sm text-violet-700">
                          <strong>Tip:</strong> {card.tips}
                        </p>
                      </div>
                    )}

                    {/* User's response */}
                    {card.response ? (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Your Answer
                        </h5>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap mb-2">
                          {card.response.user_answer}
                        </p>
                        {card.response.ai_feedback && (
                          <p className="text-sm text-gray-600">
                            <strong>Feedback:</strong> {card.response.ai_feedback}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Write Your Answer
                        </h5>
                        <textarea
                          value={userAnswer}
                          onChange={(e) => setUserAnswer(e.target.value)}
                          rows={4}
                          placeholder="Type your answer here..."
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                        />
                        <div className="flex justify-end mt-2">
                          <button
                            onClick={() => submitResponse(card.id)}
                            disabled={submitting || !userAnswer.trim()}
                            className="px-4 py-2.5 sm:py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 w-full sm:w-auto"
                          >
                            {submitting ? "Submitting..." : "Submit Answer"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <ToastContainer toasts={toasts} />
    </div>
  );
}
