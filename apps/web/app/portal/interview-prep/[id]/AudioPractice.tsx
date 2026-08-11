"use client";

import { useState, useEffect, useRef, useCallback } from "react";

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

type AudioPracticeProps = {
  prepId: string;
  session: Session;
  currentQ: number;
  onAnswerSubmitted: (updatedSession: Session) => void;
};

type RecordingState = "idle" | "recording" | "processing";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionConstructor = new () => any;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

const MAX_DURATION = 120;

export default function AudioPractice({
  prepId,
  session,
  currentQ,
  onAnswerSubmitted,
}: AudioPracticeProps) {
  const [state, setState] = useState<RecordingState>("idle");
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [timeLeft, setTimeLeft] = useState(MAX_DURATION);
  const [error, setError] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const SpeechRecognitionClass = getSpeechRecognition();
  const isSupported = !!SpeechRecognitionClass;
  const question = session.questions[currentQ];
  const isCompleted = session.status === "completed";

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  function startRecording() {
    if (!SpeechRecognitionClass) return;

    setTranscript("");
    setInterimText("");
    setTimeLeft(MAX_DURATION);
    setError(null);
    setState("recording");

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let finalText = "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript + " ";
          setTranscript(finalText.trim());
        } else {
          interim += result[0].transcript;
        }
      }
      setInterimText(interim);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      if (event.error !== "aborted") {
        setError(`Speech recognition error: ${event.error}`);
        setState("idle");
      }
    };

    recognition.onend = () => {
      if (state === "recording") {
        // Auto-stopped, not user-initiated
      }
    };

    recognitionRef.current = recognition;
    recognition.start();

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleStop(finalText);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleStop(overrideTranscript?: string) {
    stopRecording();
    const finalAnswer = (overrideTranscript || transcript).trim();

    if (!finalAnswer) {
      setState("idle");
      setError("No speech detected. Please try again.");
      return;
    }

    setState("processing");
    setTranscript(finalAnswer);
    setInterimText("");

    try {
      const updatedQuestions = [...session.questions];
      updatedQuestions[currentQ] = {
        ...updatedQuestions[currentQ],
        user_answer: finalAnswer,
      };

      const isLast = currentQ === session.questions.length - 1;

      const res = await fetch(
        `/api/portal/interview-prep/${prepId}/practice/${session.id}`,
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
        onAnswerSubmitted(updated);
      } else {
        setError("Failed to submit answer. Please try again.");
      }
    } catch {
      setError("Failed to submit answer. Please try again.");
    } finally {
      setState("idle");
    }
  }

  if (!isSupported) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <p className="text-yellow-800 font-medium mb-2">
          Speech recognition is not supported in this browser.
        </p>
        <p className="text-sm text-yellow-700">
          Use Chrome or Edge for audio practice, or switch to the Practice Q&A
          tab to type your answers.
        </p>
      </div>
    );
  }

  if (!question) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="space-y-4">
      {/* Question */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-2">
          {question.question}
        </h3>
        {question.expected_hint && (
          <p className="text-sm text-gray-500 italic">
            Hint: {question.expected_hint}
          </p>
        )}
      </div>

      {/* Already answered */}
      {question.user_answer && (
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-sm font-medium text-gray-500 mb-1">
            Your Answer:
          </p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {question.user_answer}
          </p>
          {question.score !== null && (
            <div className="mt-3 flex items-center gap-3">
              <span
                className={`text-lg font-bold ${
                  question.score >= 70
                    ? "text-green-700"
                    : question.score >= 50
                    ? "text-yellow-700"
                    : "text-red-700"
                }`}
              >
                Score: {question.score}%
              </span>
              {question.feedback && (
                <span className="text-sm text-gray-600">
                  {question.feedback}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Recording controls (only if not answered and not completed) */}
      {!question.user_answer && !isCompleted && (
        <div className="bg-white rounded-lg shadow p-6">
          {/* Timer */}
          <div className="text-center mb-4">
            <span
              className={`text-2xl font-mono font-bold ${
                timeLeft <= 30 ? "text-red-600" : "text-gray-700"
              }`}
            >
              {minutes}:{seconds.toString().padStart(2, "0")}
            </span>
          </div>

          {/* Recording indicator */}
          {state === "recording" && (
            <div className="flex justify-center mb-4">
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="w-1 bg-red-500 rounded-full animate-pulse"
                    style={{
                      height: `${12 + Math.random() * 20}px`,
                      animationDelay: `${i * 0.15}s`,
                      animationDuration: "0.6s",
                    }}
                  />
                ))}
                <span className="ml-2 text-sm text-red-600 font-medium">
                  Recording...
                </span>
              </div>
            </div>
          )}

          {/* Transcript preview */}
          {(transcript || interimText) && (
            <div className="bg-gray-50 rounded-lg p-3 mb-4 min-h-[60px]">
              <p className="text-sm text-gray-700">
                {transcript}
                {interimText && (
                  <span className="text-gray-400"> {interimText}</span>
                )}
              </p>
            </div>
          )}

          {/* Controls */}
          <div className="flex justify-center gap-3">
            {state === "idle" && (
              <button
                onClick={startRecording}
                className="px-6 py-3 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
              >
                <span className="w-3 h-3 bg-white rounded-full" />
                Start Recording
              </button>
            )}

            {state === "recording" && (
              <button
                onClick={() => handleStop()}
                className="px-6 py-3 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-900 transition-colors"
              >
                Stop & Submit
              </button>
            )}

            {state === "processing" && (
              <div className="px-6 py-3 bg-violet-100 text-violet-700 text-sm font-medium rounded-lg">
                Scoring your answer...
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 text-center mt-3">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
