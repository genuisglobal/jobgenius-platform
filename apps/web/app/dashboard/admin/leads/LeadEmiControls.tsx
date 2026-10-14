"use client";

import { useState } from "react";

export default function LeadEmiControls({
  leadId,
  initialBackground,
  initialHandledBy,
}: {
  leadId: string;
  initialBackground: string | null;
  initialHandledBy: "emi" | "founder";
}) {
  const [open, setOpen] = useState(false);
  const [background, setBackground] = useState(initialBackground ?? "");
  const [handledBy, setHandledBy] = useState(initialHandledBy);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      setMessage(res.ok ? "Saved" : data.error || "Could not save");
      return res.ok;
    } finally {
      setSaving(false);
    }
  }

  async function toggleHandledBy() {
    const next = handledBy === "emi" ? "founder" : "emi";
    if (await save({ handled_by: next })) setHandledBy(next);
  }

  return (
    <div className="pt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          {open ? "Hide background for Emi" : background ? "Edit background for Emi" : "Add background for Emi"}
        </button>
        <button
          type="button"
          onClick={toggleHandledBy}
          disabled={saving}
          className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
            handledBy === "founder"
              ? "border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100"
              : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          }`}
          title={handledBy === "founder" ? "Emi will not call this lead" : "Emi handles this lead's calls"}
        >
          {handledBy === "founder" ? "Fidelis handles this lead · hand back to Emi" : "Emi handles this lead · take it myself"}
        </button>
        {message && <span className="text-xs text-gray-500">{message}</span>}
      </div>

      {open && (
        <div className="space-y-2">
          <textarea
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            rows={5}
            maxLength={4000}
            placeholder="Paste the LinkedIn conversation, their headline, referral context, what they told you… Emi uses this on the call and never quotes it back verbatim."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-800 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => save({ agent_background: background })}
            className="inline-flex items-center rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save background"}
          </button>
        </div>
      )}
    </div>
  );
}
