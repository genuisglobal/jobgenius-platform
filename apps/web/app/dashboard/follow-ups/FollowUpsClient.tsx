"use client";

import { useCallback, useEffect, useState } from "react";

type Draft = {
  id: string;
  follow_up_day: number;
  draft_text: string;
  created_at: string;
  applied_at: string | null;
  job: { title: string | null; company: string | null; url: string | null } | null;
  seeker: { id: string; full_name: string | null } | null;
};

export default function FollowUpsClient() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/am/follow-ups");
      const data = await res.json();
      if (res.ok) setDrafts(data.drafts ?? []);
      else setMsg({ type: "error", text: data.error || "Failed to load drafts." });
    } catch {
      setMsg({ type: "error", text: "Network error loading drafts." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function copyDraft(draft: Draft) {
    try {
      await navigator.clipboard.writeText(draft.draft_text);
      setCopied(draft.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setMsg({ type: "error", text: "Clipboard unavailable — select and copy manually." });
    }
  }

  async function resolve(draft: Draft, action: "handled" | "dismissed") {
    setBusy(draft.id);
    setMsg(null);
    try {
      const res = await fetch("/api/am/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_id: draft.id, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Failed to update draft." });
      } else {
        setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      }
    } catch {
      setMsg({ type: "error", text: "Network error updating draft." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Follow-up Drafts</h1>
      <p className="text-sm text-gray-500 mb-6">
        Day-3 and day-7 bumps for applications with no response yet. Copy the draft,
        send it through the right channel (LinkedIn, email, outreach CRM), then mark
        it handled — nothing here is ever sent automatically.
      </p>

      {msg && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm ${
            msg.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {msg.text}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm py-12 text-center">Loading…</p>
      ) : drafts.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-gray-700 font-medium">No follow-ups pending 🎉</p>
          <p className="text-sm text-gray-500 mt-1">
            Drafts appear daily for applications hitting the 3- and 7-day marks
            without an interview.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {drafts.map((draft) => (
            <div key={draft.id} className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                <div>
                  <p className="font-semibold text-gray-900">
                    {draft.seeker?.full_name ?? "Unknown seeker"}
                    <span className="mx-1.5 text-gray-300">·</span>
                    <span className="font-normal text-gray-600">
                      {draft.job?.title ?? "Unknown role"} @ {draft.job?.company ?? "?"}
                    </span>
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Applied{" "}
                    {draft.applied_at
                      ? new Date(draft.applied_at).toLocaleDateString()
                      : "?"}{" "}
                    {draft.job?.url && (
                      <a
                        href={draft.job.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-violet-600 hover:underline"
                      >
                        view posting →
                      </a>
                    )}
                  </p>
                </div>
                <span
                  className={`px-2 py-1 text-xs rounded-full border ${
                    draft.follow_up_day === 3
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}
                >
                  Day {draft.follow_up_day} follow-up
                </span>
              </div>

              <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-lg p-3 mb-3 font-sans">
                {draft.draft_text}
              </pre>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => copyDraft(draft)}
                  className="px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  {copied === draft.id ? "Copied ✓" : "Copy draft"}
                </button>
                <button
                  onClick={() => resolve(draft, "handled")}
                  disabled={busy === draft.id}
                  className="px-3 py-1.5 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
                >
                  Mark handled
                </button>
                <button
                  onClick={() => resolve(draft, "dismissed")}
                  disabled={busy === draft.id}
                  className="px-3 py-1.5 text-sm text-gray-500 rounded-lg hover:bg-gray-50"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
