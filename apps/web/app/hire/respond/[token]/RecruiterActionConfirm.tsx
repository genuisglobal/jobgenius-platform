"use client";

import { useState } from "react";

export default function RecruiterActionConfirm({
  token,
  actionLabel,
  followUpNote,
}: {
  token: string;
  actionLabel: string;
  followUpNote: string;
}) {
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function confirmAction() {
    setState("saving");
    setError(null);

    try {
      const response = await fetch(`/api/recruiter/respond/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        status?: string;
        action_label?: string;
      };

      if (!response.ok) {
        setError(data.error || "Could not record your response.");
        setState("idle");
        return;
      }

      setMessage(
        data.status === "already_used"
          ? `${data.action_label || actionLabel} was already recorded.`
          : `${data.action_label || actionLabel} recorded.`
      );
      setState("done");
    } catch {
      setError("Network error while recording your response.");
      setState("idle");
    }
  }

  return (
    <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-sm leading-6 text-gray-600">{followUpNote}</p>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      <button
        type="button"
        onClick={confirmAction}
        disabled={state !== "idle"}
        className="mt-5 inline-flex items-center justify-center rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === "saving" ? "Saving..." : `Confirm: ${actionLabel}`}
      </button>
    </div>
  );
}
