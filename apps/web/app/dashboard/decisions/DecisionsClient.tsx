"use client";

import { useEffect, useState } from "react";

type Decision = {
  id: string;
  job_seeker_id: string;
  seeker_name: string;
  subject_type: string;
  subject_ref: string;
  verdict: "act" | "ask" | "escalate" | "pause";
  reason_codes: string[];
  recommended_action: string | null;
  required_facts: string[];
  risk_category: string;
  created_at: string;
};

const VERDICT_ORDER: Decision["verdict"][] = ["escalate", "ask", "pause", "act"];

const VERDICT_STYLE: Record<Decision["verdict"], { chip: string; label: string }> = {
  escalate: { chip: "bg-red-100 text-red-700", label: "Escalate" },
  ask: { chip: "bg-amber-100 text-amber-700", label: "Ask client" },
  pause: { chip: "bg-violet-100 text-violet-700", label: "Pause" },
  act: { chip: "bg-green-100 text-green-700", label: "Act" },
};

export default function DecisionsClient() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/am/decisions")
      .then((r) => (r.ok ? r.json() : { decisions: [] }))
      .then((d) => setDecisions(d.decisions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function resolve(id: string) {
    setResolvingId(id);
    try {
      const res = await fetch(`/api/am/decisions/${id}/resolve`, { method: "POST" });
      if (!res.ok) throw new Error();
      setDecisions((prev) => prev.filter((d) => d.id !== id));
    } catch {
      alert("Failed to resolve decision");
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Decisions</h1>
        <p className="text-sm text-gray-600 mt-1">
          Open <strong>Act / Ask / Escalate</strong> items across your clients. These are the only
          touchpoints the automation hands back to you.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-12 text-center">Loading decisions…</div>
      ) : decisions.length === 0 ? (
        <div className="text-sm text-gray-400 py-12 text-center border rounded-lg bg-white">
          No open decisions. Everything is clear.
        </div>
      ) : (
        VERDICT_ORDER.filter((v) => decisions.some((d) => d.verdict === v)).map((verdict) => (
          <div key={verdict}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
              {VERDICT_STYLE[verdict].label} ({decisions.filter((d) => d.verdict === verdict).length})
            </h2>
            <div className="divide-y border rounded-lg bg-white">
              {decisions
                .filter((d) => d.verdict === verdict)
                .map((d) => (
                  <div key={d.id} className="px-4 py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${VERDICT_STYLE[d.verdict].chip}`}>
                          {VERDICT_STYLE[d.verdict].label}
                        </span>
                        <span className="text-sm font-medium text-gray-900">{d.seeker_name}</span>
                        <span className="text-xs text-gray-400">{d.subject_type}</span>
                        {d.risk_category !== "none" && (
                          <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                            {d.risk_category}
                          </span>
                        )}
                      </div>
                      {d.recommended_action && (
                        <p className="text-sm text-gray-700 mt-1">{d.recommended_action}</p>
                      )}
                      {d.required_facts.length > 0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          Needs: {d.required_facts.join(", ")}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(d.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <a
                        href={`/dashboard/seekers/${d.job_seeker_id}`}
                        className="text-xs text-violet-600 hover:text-violet-800"
                      >
                        Open client
                      </a>
                      <button
                        onClick={() => resolve(d.id)}
                        disabled={resolvingId === d.id}
                        className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
                      >
                        {resolvingId === d.id ? "Resolving…" : "Resolve"}
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
