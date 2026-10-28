"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DailyCheckin as Checkin } from "@/lib/am-daily-checkin";

type Draft = Omit<Checkin, "sheet_status" | "focus_area" | "blocker_kind"> & {
  sheet_status: Checkin["sheet_status"] | "";
  focus_area: Checkin["focus_area"] | "";
  blocker_kind: Checkin["blocker_kind"] | "";
};
const blank: Draft = { sheet_status: "", focus_area: "", blocker_kind: "", distraction_level: null, next_step: null };

export default function DailyCheckin() {
  const [date, setDate] = useState("");
  const [form, setForm] = useState<Draft>(blank);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/am/daily-checkin", { cache: "no-store" }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load the daily check-in.");
      setDate(data.date);
      if (data.checkin) { setForm(data.checkin); setSaved(true); }
    }).catch((err) => setError(err instanceof Error ? err.message : "Could not load the daily check-in."));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/am/daily-checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the check-in.");
      setForm(data.checkin); setSaved(true); setDate(data.date);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save the check-in."); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="mb-6 rounded-xl border border-violet-200 bg-white p-5 space-y-4">
    <div><h2 className="font-semibold text-gray-900">Daily AM check-in {date && <span className="text-sm font-normal text-gray-500">· {date}</span>}</h2><p className="text-sm text-gray-500">A brief reflection to keep the activity sheet accurate and surface blockers. You can update it later today.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm text-gray-700">Is today&apos;s activity sheet up to date?
        <select required value={form.sheet_status} onChange={(e) => { setSaved(false); setForm({ ...form, sheet_status: e.target.value as Draft["sheet_status"] }); }} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2">
          <option value="">Choose one</option><option value="complete">Yes, complete</option><option value="needs_update">Not yet; I need to update it</option><option value="no_client_work">No client work today</option>
        </select>
      </label>
      <label className="text-sm text-gray-700">What took most of your work time?
        <select required value={form.focus_area} onChange={(e) => { setSaved(false); setForm({ ...form, focus_area: e.target.value as Draft["focus_area"] }); }} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2">
          <option value="">Choose one</option><option value="applications">Applications</option><option value="outreach">Recruiter outreach and follow-ups</option><option value="interviews">Interview preparation and support</option><option value="client_support">Client support</option><option value="other">Other work</option>
        </select>
      </label>
      <label className="text-sm text-gray-700">What is your main blocker?
        <select required value={form.blocker_kind} onChange={(e) => { setSaved(false); setForm({ ...form, blocker_kind: e.target.value as Draft["blocker_kind"] }); }} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2">
          <option value="">Choose one</option><option value="none">None</option><option value="client_info">Waiting for client information</option><option value="technical">Technical issue</option><option value="capacity">Capacity or workload</option><option value="other">Other blocker</option>
        </select>
      </label>
      <label className="text-sm text-gray-700">Did personal phone or non-work social media interrupt planned work? <span className="text-gray-400">Optional</span>
        <select value={form.distraction_level ?? ""} onChange={(e) => { setSaved(false); setForm({ ...form, distraction_level: (e.target.value || null) as Checkin["distraction_level"] }); }} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2">
          <option value="">Choose if helpful</option><option value="none">No</option><option value="some">A little</option><option value="significant">It affected my work</option><option value="prefer_not_to_say">Prefer not to say</option>
        </select>
      </label>
    </div>
    <label className="block text-sm text-gray-700">What is your next step or what help do you need? <span className="text-gray-400">Optional</span>
      <textarea value={form.next_step ?? ""} maxLength={1000} rows={2} onChange={(e) => { setSaved(false); setForm({ ...form, next_step: e.target.value }); }} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
    </label>
    <div className="flex flex-wrap items-center gap-3"><button disabled={busy} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Saving…" : saved ? "Update check-in" : "Save check-in"}</button><Link href="/dashboard/activity-sheet" className="text-sm text-violet-700 hover:underline">Open activity sheet</Link>{saved && <span className="text-sm text-green-700">Saved for today</span>}</div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </form>;
}
