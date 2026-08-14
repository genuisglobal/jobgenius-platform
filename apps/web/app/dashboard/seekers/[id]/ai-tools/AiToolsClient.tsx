"use client";

import { useState } from "react";

export interface JobOption {
  id: string;
  title: string;
  company: string;
  score: number | null;
}

export interface InterviewOption {
  id: string;
  company: string | null;
  role: string | null;
  scheduled_at: string | null;
}

interface Draft {
  subject?: string;
  body?: string;
  ai_output_id: string | null;
}

interface NextActionPanelResult {
  summary: string;
  actions: Array<{
    title: string;
    why: string;
    priority: "high" | "medium" | "low";
    suggested_link: string | null;
  }>;
  aiOutputId: string | null;
}

const INPUT =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-violet-600 focus:ring-1 focus:ring-violet-600";

const PRIORITY_STYLES = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-gray-100 text-gray-600",
} as const;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export default function AiToolsClient({
  seekerId,
  jobOptions,
  interviewOptions,
}: {
  seekerId: string;
  jobOptions: JobOption[];
  interviewOptions: InterviewOption[];
}) {
  // ─── Cover letter ─────────────────────────────────────────
  const [clJobId, setClJobId] = useState<string>(jobOptions[0]?.id ?? "");
  const [clTone, setClTone] = useState<"professional" | "warm" | "enthusiastic">("professional");
  const [clRecruiter, setClRecruiter] = useState("");
  const [clGuidance, setClGuidance] = useState("");
  const [clBusy, setClBusy] = useState(false);
  const [clDraft, setClDraft] = useState<Draft | null>(null);
  const [clError, setClError] = useState<string | null>(null);

  async function generateCoverLetter() {
    if (!clJobId) return;
    setClBusy(true);
    setClError(null);
    setClDraft(null);
    try {
      const res = await fetch("/api/am/cover-letter/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: seekerId,
          job_post_id: clJobId,
          tone: clTone,
          recruiter_name: clRecruiter || null,
          guidance: clGuidance || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setClError(data.error || "Failed.");
        return;
      }
      setClDraft({
        subject: data.subject,
        body: data.body,
        ai_output_id: data.ai_output_id,
      });
    } catch {
      setClError("Network error.");
    } finally {
      setClBusy(false);
    }
  }

  // ─── Interview follow-up ──────────────────────────────────
  const [ifInterviewId, setIfInterviewId] = useState<string>(
    interviewOptions[0]?.id ?? ""
  );
  const [ifGuidance, setIfGuidance] = useState("");
  const [ifBusy, setIfBusy] = useState(false);
  const [ifDraft, setIfDraft] = useState<Draft | null>(null);
  const [ifError, setIfError] = useState<string | null>(null);

  async function generateFollowup() {
    if (!ifInterviewId) return;
    setIfBusy(true);
    setIfError(null);
    setIfDraft(null);
    try {
      const res = await fetch("/api/am/interview-followup/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interview_id: ifInterviewId,
          guidance: ifGuidance || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setIfError(data.error || "Failed.");
        return;
      }
      setIfDraft({
        subject: data.subject,
        body: data.body,
        ai_output_id: data.ai_output_id,
      });
    } catch {
      setIfError("Network error.");
    } finally {
      setIfBusy(false);
    }
  }

  // ─── Next best action ─────────────────────────────────────
  const [nbaBusy, setNbaBusy] = useState(false);
  const [nbaResult, setNbaResult] = useState<NextActionPanelResult | null>(null);
  const [nbaError, setNbaError] = useState<string | null>(null);

  async function suggestNextAction() {
    setNbaBusy(true);
    setNbaError(null);
    setNbaResult(null);
    try {
      const res = await fetch(`/api/am/seekers/${seekerId}/next-action`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setNbaError(data.error || "Suggestion failed.");
        return;
      }
      setNbaResult(data as NextActionPanelResult);
    } catch {
      setNbaError("Network error.");
    } finally {
      setNbaBusy(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Browsers without clipboard API — fall back silently.
    }
  }

  return (
    <div className="space-y-6">
      {/* Cover letter */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Cover letter</h2>
        <p className="text-xs text-gray-500 mb-4">
          Pick one of the seeker&apos;s matched jobs. The draft persists as a
          pending AI output for review.
        </p>

        {jobOptions.length === 0 ? (
          <div className="text-xs text-gray-400">
            No job matches on file for this seeker yet — run matching first.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 mb-1">Job</span>
                <select
                  className={INPUT}
                  value={clJobId}
                  onChange={(e) => setClJobId(e.target.value)}
                >
                  {jobOptions.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} @ {j.company}
                      {j.score !== null ? ` · ${j.score}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 mb-1">Tone</span>
                <select
                  className={INPUT}
                  value={clTone}
                  onChange={(e) =>
                    setClTone(e.target.value as "professional" | "warm" | "enthusiastic")
                  }
                >
                  <option value="professional">Professional</option>
                  <option value="warm">Warm</option>
                  <option value="enthusiastic">Enthusiastic</option>
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 mb-1">Recruiter name (optional)</span>
                <input
                  className={INPUT}
                  value={clRecruiter}
                  onChange={(e) => setClRecruiter(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 mb-1">Guidance (optional)</span>
                <input
                  className={INPUT}
                  value={clGuidance}
                  onChange={(e) => setClGuidance(e.target.value)}
                  placeholder="e.g. emphasize team leadership"
                />
              </label>
            </div>

            <button
              onClick={generateCoverLetter}
              disabled={clBusy}
              className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
            >
              {clBusy ? "Generating…" : "Generate cover letter"}
            </button>
            {clError && (
              <p className="mt-2 text-xs text-red-600">{clError}</p>
            )}

            {clDraft && (
              <div className="mt-4 border-t border-gray-200 pt-4 space-y-2">
                <p className="text-xs text-gray-500">
                  Pending review · ai_output_id:{" "}
                  <code className="text-[10px]">{clDraft.ai_output_id?.slice(0, 8) ?? "(not saved)"}</code>
                </p>
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">Subject</p>
                  <p className="text-sm font-medium text-gray-900">{clDraft.subject}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">Body</p>
                  <pre className="text-xs text-gray-800 whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded p-3">
                    {clDraft.body}
                  </pre>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => copy(`${clDraft.subject}\n\n${clDraft.body ?? ""}`)}
                    className="text-xs text-violet-600 hover:text-violet-700"
                  >
                    Copy
                  </button>
                  <a
                    href="/dashboard/admin/ai-outputs?status=pending&kind=cover_letter"
                    className="text-xs text-violet-600 hover:text-violet-700"
                  >
                    Review queue →
                  </a>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Interview followup */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Interview follow-up</h2>
        <p className="text-xs text-gray-500 mb-4">
          Generates a thank-you / follow-up email based on interview notes.
        </p>

        {interviewOptions.length === 0 ? (
          <div className="text-xs text-gray-400">
            No interviews on file for this seeker.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <label className="block sm:col-span-2">
                <span className="block text-xs font-medium text-gray-600 mb-1">Interview</span>
                <select
                  className={INPUT}
                  value={ifInterviewId}
                  onChange={(e) => setIfInterviewId(e.target.value)}
                >
                  {interviewOptions.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.company ?? "(no company)"} — {i.role ?? "(role)"} · {fmtDate(i.scheduled_at)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="block text-xs font-medium text-gray-600 mb-1">Guidance (optional)</span>
                <input
                  className={INPUT}
                  value={ifGuidance}
                  onChange={(e) => setIfGuidance(e.target.value)}
                  placeholder="e.g. they brought up Postgres a lot"
                />
              </label>
            </div>

            <button
              onClick={generateFollowup}
              disabled={ifBusy}
              className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
            >
              {ifBusy ? "Generating…" : "Generate follow-up"}
            </button>
            {ifError && <p className="mt-2 text-xs text-red-600">{ifError}</p>}

            {ifDraft && (
              <div className="mt-4 border-t border-gray-200 pt-4 space-y-2">
                <p className="text-xs text-gray-500">
                  Pending review · ai_output_id:{" "}
                  <code className="text-[10px]">{ifDraft.ai_output_id?.slice(0, 8) ?? "(not saved)"}</code>
                </p>
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">Subject</p>
                  <p className="text-sm font-medium text-gray-900">{ifDraft.subject}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">Body</p>
                  <pre className="text-xs text-gray-800 whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded p-3">
                    {ifDraft.body}
                  </pre>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => copy(`${ifDraft.subject}\n\n${ifDraft.body ?? ""}`)}
                    className="text-xs text-violet-600 hover:text-violet-700"
                  >
                    Copy
                  </button>
                  <a
                    href="/dashboard/admin/ai-outputs?status=pending&kind=interview_followup"
                    className="text-xs text-violet-600 hover:text-violet-700"
                  >
                    Review queue →
                  </a>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Next best action */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Next best action</h2>
        <p className="text-xs text-gray-500 mb-4">
          Reads the seeker&apos;s recent timeline and proposes 1-3 prioritised actions.
        </p>
        <button
          onClick={suggestNextAction}
          disabled={nbaBusy}
          className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
        >
          {nbaBusy ? "Thinking…" : "Suggest next action"}
        </button>
        {nbaError && <p className="mt-2 text-xs text-red-600">{nbaError}</p>}

        {nbaResult && (
          <div className="mt-4 border-t border-gray-200 pt-4 space-y-2">
            {nbaResult.summary && (
              <p className="text-sm text-gray-700">{nbaResult.summary}</p>
            )}
            {nbaResult.actions.map((a, i) => (
              <div key={i} className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                <div className="flex items-start gap-2 mb-1">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                      PRIORITY_STYLES[a.priority]
                    }`}
                  >
                    {a.priority}
                  </span>
                  <p className="text-sm font-medium text-gray-900 flex-1">{a.title}</p>
                  {a.suggested_link && (
                    <a
                      href={a.suggested_link}
                      className="text-xs text-violet-600 hover:text-violet-700 whitespace-nowrap"
                    >
                      Open →
                    </a>
                  )}
                </div>
                {a.why && <p className="text-xs text-gray-600 italic">{a.why}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
