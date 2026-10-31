"use client";

import Link from "next/link";
import { useState } from "react";
import { shiftSheetDate } from "@/lib/activity-sheet";
import type { FridayDecision } from "@/lib/friday-seeker-decisions";
import type { WeeklyReviewRow } from "@/lib/weekly-seeker-review";

type Owner = { id: string; name: string };

export default function FridayDecisionPanel({ row, weekStart, initial, priorOpen, owners, canManageTeam, viewerId, onSaved, tablePending }: {
  row: WeeklyReviewRow; weekStart: string; initial: FridayDecision | null; priorOpen: FridayDecision[];
  owners: Owner[]; canManageTeam: boolean; viewerId: string; onSaved: (decision: FridayDecision) => void; tablePending: boolean;
}) {
  const [decision, setDecision] = useState(initial?.decision ?? "");
  const [nextAction, setNextAction] = useState(initial?.next_action ?? "");
  const [ownerId, setOwnerId] = useState(initial?.owner_account_manager_id ?? row.ownerId ?? viewerId);
  const [dueDate, setDueDate] = useState(initial?.due_date ?? shiftSheetDate(weekStart, 7));
  const [status, setStatus] = useState<"open" | "done">(initial?.status ?? "open");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editable = canManageTeam || row.ownerId === viewerId;

  async function save() {
    setSaving(true); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/am/weekly-review/decision", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, jobSeekerId: row.id, decision, nextAction, ownerId, dueDate, status }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Could not save the Friday decision."); return; }
      onSaved(data.decision as FridayDecision);
      setMessage("Friday decision saved.");
    } catch {
      setError("Network error while saving the Friday decision.");
    } finally { setSaving(false); }
  }

  return <section className="mt-6 rounded-xl border border-violet-200 bg-violet-50 p-4">
    <h3 className="font-semibold text-violet-950">Friday decision and next step</h3>
    {priorOpen.length > 0 && <div className="mt-3 rounded-lg bg-white p-3"><p className="text-xs font-semibold text-amber-800">Open actions from earlier reviews</p><ul className="mt-1 space-y-2 text-sm">{priorOpen.map((item) => <li key={item.id}><Link href={`/dashboard/weekly-review?week=${item.week_start}`} className="font-medium text-violet-700 hover:underline">{item.week_start}</Link>: {item.next_action} <span className="text-gray-500">({owners.find((owner) => owner.id === item.owner_account_manager_id)?.name ?? "Owner unknown"}; due {item.due_date})</span></li>)}</ul></div>}
    {tablePending ? <p className="mt-3 text-sm text-amber-800">Friday decisions are being set up. Migration 130 is needed before they can be saved.</p> : !editable ? <p className="mt-3 text-sm text-gray-600">Only the assigned AM or a people manager can record this decision.</p> : <div className="mt-3 space-y-3">
      <label className="block text-sm font-medium text-gray-700">What was decided?<textarea value={decision} onChange={(event) => setDecision(event.target.value)} maxLength={2000} rows={3} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="Summarize the Friday discussion and any blocker" /></label>
      <label className="block text-sm font-medium text-gray-700">Next action<input value={nextAction} onChange={(event) => setNextAction(event.target.value)} maxLength={500} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="Specific step to complete before the next review" /></label>
      <div className="grid gap-3 sm:grid-cols-3"><label className="block text-sm font-medium text-gray-700">Owner<select value={ownerId} onChange={(event) => setOwnerId(event.target.value)} disabled={!canManageTeam} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-100">{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label><label className="block text-sm font-medium text-gray-700">Due date<input type="date" value={dueDate} min={weekStart} onChange={(event) => setDueDate(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" /></label><label className="block text-sm font-medium text-gray-700">Status<select value={status} onChange={(event) => setStatus(event.target.value as "open" | "done")} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"><option value="open">Open</option><option value="done">Done</option></select></label></div>
      <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={save} disabled={saving || !decision.trim() || !nextAction.trim() || !ownerId || !dueDate} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "Saving…" : "Save Friday decision"}</button>{message && <span className="text-sm text-green-700">{message}</span>}{error && <span className="text-sm text-red-700">{error}</span>}</div>
    </div>}
  </section>;
}
