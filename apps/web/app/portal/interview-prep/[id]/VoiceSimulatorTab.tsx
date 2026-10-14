"use client";

import { useEffect, useRef, useState } from "react";
import { RealtimeAgent, RealtimeSession } from "@openai/agents-realtime";
import type { RealtimeItem } from "@openai/agents-realtime";

type Turn = {
  id: string;
  turn_number: number;
  speaker: string;
  content: string;
  score: number | null;
  feedback: string | null;
  star_score?: number | null;
  relevance_score?: number | null;
  specificity_score?: number | null;
  confidence_coaching?: string | null;
  rewrite_suggestions?: string[] | null;
};

type FeedbackReport = {
  summary?: string;
  strengths?: string[];
  weaknesses?: string[];
  star_breakdown?: {
    situation?: string;
    task?: string;
    action?: string;
    result?: string;
  };
  improvement_plan?: string[];
  competencies?: {
    communication?: number;
    relevance?: number;
    star?: number;
  };
};

type VoiceSession = {
  id: string;
  interviewer_persona: string;
  status: string;
  total_turns: number;
  overall_score: number | null;
  overall_feedback: string | null;
  star_score?: number | null;
  communication_score?: number | null;
  relevance_score?: number | null;
  scored_by?: string | null;
  feedback_report?: FeedbackReport | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

const PERSONAS = [
  { value: "professional", label: "Professional (HR)" },
  { value: "technical", label: "Technical (Engineer)" },
  { value: "behavioral", label: "Behavioral (Hiring Manager)" },
  { value: "stress", label: "Stress (Challenging)" },
] as const;

const KICKOFF_PROMPT = "Please start the interview with an opening question.";
const CONSENT_STORAGE_KEY = "jobgenius_voice_consent";

type JobContext = {
  title: string;
  company: string | null;
  description: string | null;
};

function extractMessageText(item: RealtimeItem): string | null {
  if (item.type !== "message") return null;
  if (item.role === "system") return null;
  const status = "status" in item ? (item as { status?: string }).status : undefined;
  if (status && status !== "completed") return null;
  const parts: string[] = [];
  for (const chunk of item.content ?? []) {
    if (chunk.type === "input_text" && chunk.text) {
      parts.push(chunk.text);
    }
    if (chunk.type === "input_audio" && chunk.transcript) {
      parts.push(chunk.transcript);
    }
    if (chunk.type === "output_text" && chunk.text) {
      parts.push(chunk.text);
    }
    if (chunk.type === "output_audio" && chunk.transcript) {
      parts.push(chunk.transcript);
    }
  }
  const text = parts.join(" ").trim();
  return text.length > 0 ? text : null;
}

function historyToTurns(history: RealtimeItem[]): Turn[] {
  const turns: Turn[] = [];
  for (const item of history) {
    if (item.type !== "message") continue;
    if (item.role !== "user" && item.role !== "assistant") continue;
    const text = extractMessageText(item);
    if (!text) continue;
    if (item.role === "user" && text === KICKOFF_PROMPT) continue;
    turns.push({
      id: item.itemId,
      turn_number: turns.length,
      speaker: item.role === "user" ? "candidate" : "interviewer",
      content: text,
      score: null,
      feedback: null,
    });
  }
  return turns;
}

function buildInstructions(persona: string, context: JobContext | null) {
  const personaDescriptions: Record<string, string> = {
    professional: "a friendly but thorough HR interviewer",
    technical: "a senior engineer conducting a technical screen",
    behavioral: "a hiring manager focused on culture fit and leadership",
    stress: "a direct, challenging interviewer who pushes back on vague answers",
  };
  const personaText = personaDescriptions[persona] || personaDescriptions.professional;
  const jobTitle = context?.title || "the role";
  const company = context?.company ? ` at ${context.company}` : "";
  const description = context?.description
    ? `\nContext: ${context.description.slice(0, 1200)}`
    : "";
  return `You are ${personaText}. You are conducting a mock interview for the position of ${jobTitle}${company}.\n\nRules:\n- Ask one question at a time\n- Keep questions concise and role-specific\n- Use relevant follow-up questions\n- After 6-8 exchanges, wrap up and ask if the candidate has questions\n- Do not mention you are AI${description}`;
}

function CompetencyBar({ label, value }: { label: string; value: number | null }) {
  if (typeof value !== "number") return null;
  const pct = Math.min(Math.max(value, 0), 100);
  const color = pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-violet-500" : "bg-amber-500";
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-600 mb-1">
        <span>{label}</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FeedbackReportCard({
  report,
  starScore,
  communicationScore,
  relevanceScore,
}: {
  report: FeedbackReport;
  starScore: number | null;
  communicationScore: number | null;
  relevanceScore: number | null;
}) {
  const star = report.competencies?.star ?? starScore;
  const communication = report.competencies?.communication ?? communicationScore;
  const relevance = report.competencies?.relevance ?? relevanceScore;
  const star_breakdown = report.star_breakdown ?? {};

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 space-y-4">
      <h4 className="text-sm font-semibold text-gray-900">Feedback Report</h4>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <CompetencyBar label="STAR structure" value={star} />
        <CompetencyBar label="Communication" value={communication} />
        <CompetencyBar label="Relevance" value={relevance} />
      </div>

      {(report.strengths?.length || report.weaknesses?.length) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {report.strengths && report.strengths.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-green-700 mb-1">Strengths</p>
              <ul className="text-xs text-gray-700 list-disc list-inside space-y-0.5">
                {report.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {report.weaknesses && report.weaknesses.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-700 mb-1">Areas to improve</p>
              <ul className="text-xs text-gray-700 list-disc list-inside space-y-0.5">
                {report.weaknesses.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {(star_breakdown.situation ||
        star_breakdown.task ||
        star_breakdown.action ||
        star_breakdown.result) && (
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-1">STAR breakdown</p>
          <dl className="text-xs text-gray-700 space-y-0.5">
            {star_breakdown.situation && (
              <div>
                <dt className="inline font-medium">Situation: </dt>
                <dd className="inline">{star_breakdown.situation}</dd>
              </div>
            )}
            {star_breakdown.task && (
              <div>
                <dt className="inline font-medium">Task: </dt>
                <dd className="inline">{star_breakdown.task}</dd>
              </div>
            )}
            {star_breakdown.action && (
              <div>
                <dt className="inline font-medium">Action: </dt>
                <dd className="inline">{star_breakdown.action}</dd>
              </div>
            )}
            {star_breakdown.result && (
              <div>
                <dt className="inline font-medium">Result: </dt>
                <dd className="inline">{star_breakdown.result}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {report.improvement_plan && report.improvement_plan.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-1">Improvement plan</p>
          <ol className="text-xs text-gray-700 list-decimal list-inside space-y-0.5">
            {report.improvement_plan.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export default function VoiceSimulatorTab({ prepId }: { prepId: string }) {
  const [sessions, setSessions] = useState<VoiceSession[]>([]);
  const [activeSession, setActiveSession] = useState<VoiceSession | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [persona, setPersona] = useState("professional");
  const [creating, setCreating] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [jobContext, setJobContext] = useState<JobContext | null>(null);
  const [pendingStart, setPendingStart] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<RealtimeSession | null>(null);

  useEffect(() => {
    if (loaded) return;
    setLoaded(true);
    fetch(`/api/portal/interview-prep/${prepId}/voice-session`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.sessions) setSessions(data.sessions);
      })
      .catch((err) => console.error("[voice-sim] fetch sessions failed:", err));
  }, [loaded, prepId]);

  useEffect(() => {
    fetch(`/api/portal/interview-prep/${prepId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const post = Array.isArray(data?.prep?.job_posts)
          ? data?.prep?.job_posts[0]
          : data?.prep?.job_posts;
        if (post) {
          setJobContext({
            title: post.title || "Role",
            company: post.company ?? null,
            description: post.description_text ?? null,
          });
        }
      })
      .catch((err) => console.error("[voice-sim] fetch job context failed:", err));
  }, [prepId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (stored === "true") setConsentAccepted(true);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        sessionRef.current.close();
        sessionRef.current = null;
      }
    };
  }, []);

  async function connectRealtime() {
    setConnecting(true);
    setError(null);
    try {
      const tokenRes = await fetch(`/api/portal/interview-prep/${prepId}/realtime-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona }),
      });
      if (!tokenRes.ok) {
        const msg = await tokenRes.text();
        throw new Error(msg || "Failed to fetch realtime token.");
      }
      const tokenData = await tokenRes.json();
      const token = tokenData?.token;
      if (!token) {
        throw new Error("Realtime token missing.");
      }

      const agent = new RealtimeAgent({
        name: "JobGenius Interviewer",
        instructions:
          typeof tokenData?.instructions === "string" && tokenData.instructions
            ? tokenData.instructions
            : buildInstructions(persona, jobContext),
      });

      const session = new RealtimeSession(agent, {
        transport: "webrtc",
        historyStoreAudio: false,
      });

      session.on("history_updated", (history) => {
        setTurns(historyToTurns(history));
      });

      session.on("error", () => {
        setError("Realtime session error. Please try again.");
      });

      await session.connect({ apiKey: token });
      sessionRef.current = session;
      session.sendMessage(KICKOFF_PROMPT);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start realtime session.";
      setError(message);
    } finally {
      setConnecting(false);
    }
  }

  async function beginSession() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/interview-prep/${prepId}/voice-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona, mode: "realtime" }),
      });
      if (!res.ok) {
        throw new Error("Failed to start session.");
      }
      const { session } = await res.json();
      if (session) {
        setSessions((prev) => [session, ...prev]);
        setActiveSession(session);
        setTurns([]);
        await connectRealtime();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start session.";
      setError(message);
    } finally {
      setCreating(false);
    }
  }

  function requestConsent() {
    setPendingStart(true);
    setConsentOpen(true);
  }

  async function startSession() {
    if (!consentAccepted) {
      requestConsent();
      return;
    }
    await beginSession();
  }

  function handleConsent(accepted: boolean) {
    setConsentOpen(false);
    if (!accepted) {
      setPendingStart(false);
      return;
    }
    setConsentAccepted(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, "true");
    }
    if (pendingStart) {
      setPendingStart(false);
      beginSession();
    }
  }

  async function loadSession(sessionId: string) {
    const res = await fetch(`/api/portal/interview-prep/${prepId}/voice-session/${sessionId}`);
    if (res.ok) {
      const { session, turns: sessionTurns } = await res.json();
      setActiveSession(session);
      setTurns(sessionTurns ?? []);
    }
  }

  async function completeSession() {
    if (!activeSession) return;
    sessionRef.current?.close();
    sessionRef.current = null;
    const payload = {
      turns: turns.map((t) => ({ speaker: t.speaker, content: t.content })),
    };
    const res = await fetch(
      `/api/portal/interview-prep/${prepId}/voice-session/${activeSession.id}/complete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    if (res.ok) {
      const data = await res.json();
      setActiveSession(data.session);
      setTurns(data.turns ?? []);
      setSessions((prev) =>
        prev.map((s) => (s.id === data.session.id ? data.session : s))
      );
    } else {
      setError("Failed to save transcript.");
    }
  }

  function handleBack() {
    if (activeSession && activeSession.status !== "completed") {
      completeSession();
    }
    setActiveSession(null);
    setTurns([]);
  }

  if (activeSession) {
    const isCompleted = activeSession.status === "completed";
    return (
      <div>
        <div className="flex items-center justify-between gap-2 mb-4">
          <button
            onClick={handleBack}
            className="text-sm text-violet-600 hover:text-violet-800 flex-shrink-0"
          >
            &larr; Back
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 px-2 py-1 bg-gray-100 rounded whitespace-nowrap">
              {PERSONAS.find((p) => p.value === activeSession.interviewer_persona)?.label}
            </span>
            {!isCompleted && (
              <button
                onClick={completeSession}
                className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 whitespace-nowrap"
              >
                End Interview
              </button>
            )}
          </div>
        </div>

        {connecting && (
          <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-sm text-violet-700 mb-4">
            Connecting live voice session...
          </div>
        )}

        {isCompleted && activeSession.overall_score !== null && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4 text-center">
            <p className="text-lg font-bold text-green-700">
              Session Score: {activeSession.overall_score}%
            </p>
            {activeSession.overall_feedback && (
              <p className="text-sm text-green-600 mt-1">
                {activeSession.overall_feedback}
              </p>
            )}
            {activeSession.scored_by === "heuristic" && (
              <p className="text-[11px] text-green-600/70 mt-1">
                AI coaching was unavailable — scored with the built-in rubric.
              </p>
            )}
          </div>
        )}

        {isCompleted && activeSession.feedback_report && (
          <FeedbackReportCard
            report={activeSession.feedback_report}
            starScore={activeSession.star_score ?? null}
            communicationScore={activeSession.communication_score ?? null}
            relevanceScore={activeSession.relevance_score ?? null}
          />
        )}

        <div className="bg-white rounded-lg shadow p-3 sm:p-4 mb-4 max-h-[60vh] sm:max-h-96 overflow-y-auto">
          <div className="space-y-3 sm:space-y-4">
            {turns.map((turn) => (
              <div
                key={turn.id}
                className={`flex ${
                  turn.speaker === "candidate" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[80%] rounded-lg p-3 ${
                    turn.speaker === "candidate"
                      ? "bg-violet-600 text-white"
                      : "bg-gray-100 text-gray-900"
                  }`}
                >
                  <p className="text-sm">{turn.content}</p>
                  {turn.speaker === "candidate" && turn.score !== null && (
                    <div className="mt-2 pt-2 border-t border-violet-500">
                      <span className="text-xs text-violet-200">
                        Score: {turn.score}%
                        {typeof turn.star_score === "number"
                          ? ` · STAR ${turn.star_score}`
                          : ""}
                        {typeof turn.relevance_score === "number"
                          ? ` · Relevance ${turn.relevance_score}`
                          : ""}
                      </span>
                      {turn.feedback && (
                        <p className="text-xs text-violet-200 mt-0.5">
                          {turn.feedback}
                        </p>
                      )}
                      {turn.confidence_coaching && (
                        <p className="text-xs text-violet-200/90 mt-1">
                          Coaching: {turn.confidence_coaching}
                        </p>
                      )}
                      {Array.isArray(turn.rewrite_suggestions) &&
                        turn.rewrite_suggestions.length > 0 && (
                          <ul className="text-xs text-violet-200/90 mt-1 list-disc list-inside space-y-0.5">
                            {turn.rewrite_suggestions.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        </div>

        {!isCompleted && (
          <div className="bg-white rounded-lg shadow p-4 text-sm text-gray-600">
            Speak naturally. The interviewer will respond automatically.
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 text-center mt-3">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        Live Voice Interview
      </h3>

      <div className="bg-white rounded-lg shadow p-4 sm:p-6 text-center">
        <p className="text-gray-600 mb-4 text-sm sm:text-base">
          Practice with a live voice interviewer powered by OpenAI Realtime. Select a persona and start.
        </p>

        <div className="grid grid-cols-2 sm:flex sm:justify-center gap-2 mb-6">
          {PERSONAS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPersona(p.value)}
              className={`px-3 py-2.5 sm:py-2 text-sm rounded-lg border-2 transition-colors ${
                persona === p.value
                  ? "border-violet-500 bg-violet-50 text-violet-700"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <button
          onClick={startSession}
          disabled={creating}
          className="px-6 py-3 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors w-full sm:w-auto"
        >
          {creating ? "Starting..." : "Start Live Interview"}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 text-center mt-3">{error}</p>
      )}

      {sessions.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Past Sessions</h4>
          <div className="space-y-2">
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => loadSession(s.id)}
                className="w-full text-left bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        s.status === "completed"
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}>
                        {s.status === "completed" ? "completed" : "in progress"}
                      </span>
                      <span className="text-xs text-gray-400">
                        {PERSONAS.find((p) => p.value === s.interviewer_persona)?.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {s.total_turns} turn{s.total_turns !== 1 ? "s" : ""}
                      {" - "}
                      {new Date(s.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {s.overall_score !== null && (
                    <span className="text-sm font-bold text-gray-900">
                      {s.overall_score}%
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {consentOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
            <h4 className="text-lg font-semibold text-gray-900 mb-2">Voice Interview Consent</h4>
            <p className="text-sm text-gray-600 mb-4">
              We will access your microphone and send audio to our AI provider to run the live interview.
              We store text transcripts for 90 days and do not store audio. You can end anytime.
            </p>
            <div className="flex items-center gap-2 mb-4">
              <input
                id="voice-consent"
                type="checkbox"
                className="rounded border-gray-300"
                checked={consentAccepted}
                onChange={(e) => setConsentAccepted(e.target.checked)}
              />
              <label htmlFor="voice-consent" className="text-sm text-gray-700">
                I agree to the voice interview consent.
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => handleConsent(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConsent(consentAccepted)}
                disabled={!consentAccepted}
                className="px-4 py-2 text-sm bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:opacity-50"
              >
                Agree & Start
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
