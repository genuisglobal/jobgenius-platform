"use client";

import { useState } from "react";

const DEFAULT_QUESTIONS = [
  { key: "why_looking", text: "Why are you looking for a new role?" },
  { key: "about_yourself", text: "Tell us about yourself / professional summary" },
  { key: "salary_expectations", text: "What are your salary expectations?" },
  { key: "greatest_strength", text: "What is your greatest strength?" },
  { key: "greatest_weakness", text: "What is your greatest weakness?" },
  { key: "why_hire_you", text: "Why should we hire you?" },
  { key: "five_years", text: "Where do you see yourself in 5 years?" },
  { key: "challenging_project", text: "Describe a challenging project you worked on" },
  { key: "management_style", text: "What is your management style?" },
  { key: "work_authorization", text: "Are you authorized to work in this country?" },
  { key: "notice_period", text: "What is your notice period / availability?" },
  { key: "questions_for_us", text: "Do you have any questions for us?" },
];

interface Answer {
  id: string;
  question_key: string;
  question_text: string;
  answer: string;
}

export default function AnswersClient({
  initialAnswers,
}: {
  initialAnswers: Answer[];
}) {
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => {
    const map: Record<string, Answer> = {};
    initialAnswers.forEach((a) => {
      map[a.question_key] = a;
    });
    return map;
  });
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    initialAnswers.forEach((a) => {
      map[a.question_key] = a.answer;
    });
    return map;
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [customKey, setCustomKey] = useState("");
  const [customText, setCustomText] = useState("");

  // Merge default questions with any custom ones
  const allKeys = new Set([
    ...DEFAULT_QUESTIONS.map((q) => q.key),
    ...Object.keys(answers),
  ]);

  const questions = [
    ...DEFAULT_QUESTIONS,
    ...Object.values(answers)
      .filter((a) => !DEFAULT_QUESTIONS.some((q) => q.key === a.question_key))
      .map((a) => ({ key: a.question_key, text: a.question_text })),
  ];

  const saveAnswer = async (key: string, text: string) => {
    setSaving(key);
    setMessage(null);
    try {
      const res = await fetch("/api/portal/answers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_key: key,
          question_text: text,
          answer: drafts[key] || "",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "Failed to save." });
        return;
      }
      const { answer: saved } = await res.json();
      setAnswers((a) => ({ ...a, [key]: saved }));
      setMessage({ type: "success", text: "Answer saved!" });
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setSaving(null);
    }
  };

  const addCustomQuestion = () => {
    const key = customKey.trim().toLowerCase().replace(/\s+/g, "_");
    const text = customText.trim();
    if (!key || !text) return;
    if (allKeys.has(key)) {
      setMessage({ type: "error", text: "Question key already exists." });
      return;
    }
    setDrafts((d) => ({ ...d, [key]: "" }));
    setAnswers((a) => ({
      ...a,
      [key]: { id: "", question_key: key, question_text: text, answer: "" },
    }));
    setCustomKey("");
    setCustomText("");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Application Q&A</h2>
        <p className="text-gray-600 mt-1">
          Pre-write answers to common application questions. These can be reused across applications.
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

      {questions.map((q) => {
        const draft = drafts[q.key] ?? answers[q.key]?.answer ?? "";
        const isSaved = answers[q.key]?.answer === draft && answers[q.key]?.id;
        return (
          <div key={q.key} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-start justify-between gap-4 mb-3">
              <label className="text-sm font-medium text-gray-900">{q.text}</label>
              <button
                onClick={() => saveAnswer(q.key, q.text)}
                disabled={saving === q.key}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors flex-shrink-0 ${
                  isSaved
                    ? "bg-green-100 text-green-700"
                    : "bg-violet-600 text-white hover:bg-violet-700"
                } disabled:opacity-50`}
              >
                {saving === q.key ? "Saving..." : isSaved ? "Saved" : "Save"}
              </button>
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDrafts((d) => ({ ...d, [q.key]: e.target.value }))}
              rows={4}
              placeholder="Write your answer..."
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-sm"
            />
          </div>
        );
      })}

      {/* Add Custom Question */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Custom Question</h3>
        <div className="space-y-3">
          <input
            type="text"
            value={customKey}
            onChange={(e) => setCustomKey(e.target.value)}
            placeholder="Question key (e.g. remote_preference)"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
          />
          <input
            type="text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Question text (e.g. Do you prefer remote or hybrid work?)"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
          />
          <button
            onClick={addCustomQuestion}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            Add Question
          </button>
        </div>
      </div>
    </div>
  );
}
