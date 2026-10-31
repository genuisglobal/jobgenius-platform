"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { interviewTotal, shiftSheetDate, type ActivityCounts } from "@/lib/activity-sheet";
import type { WeeklyReviewRow } from "@/lib/weekly-seeker-review";
import type { FridayDecision } from "@/lib/friday-seeker-decisions";
import FridayDecisionPanel from "./FridayDecisionPanel";

const applications = (counts: ActivityCounts) => counts.easy_applications + counts.company_applications;

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-gray-200 bg-white px-4 py-3"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p></div>;
}

function Comparison({ label, current, previous }: { label: string; current: number; previous: number }) {
  const change = current - previous;
  return <div className="rounded-lg border border-gray-200 bg-white p-3"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-xl font-semibold text-gray-900">{current}</p><p className={`text-xs ${change > 0 ? "text-green-700" : change < 0 ? "text-amber-800" : "text-gray-500"}`}>{change > 0 ? `+${change}` : change} vs last week ({previous})</p></div>;
}

function SeekerDetail({ row, showOwner }: { row: WeeklyReviewRow; showOwner: boolean }) {
  const metrics = [
    { label: "Applications", current: applications(row.counts), previous: applications(row.previousCounts) },
    { label: "Easy Apply", current: row.counts.easy_applications, previous: row.previousCounts.easy_applications },
    { label: "Company applications", current: row.counts.company_applications, previous: row.previousCounts.company_applications },
    { label: "Follow-ups", current: row.counts.follow_ups, previous: row.previousCounts.follow_ups },
    { label: "Phone interviews", current: row.counts.phone_interviews, previous: row.previousCounts.phone_interviews },
    { label: "AI interviews", current: row.counts.ai_interviews, previous: row.previousCounts.ai_interviews },
    { label: "Video interviews", current: row.counts.video_interviews, previous: row.previousCounts.video_interviews },
    { label: "Offers", current: row.counts.offers, previous: row.previousCounts.offers },
  ];
  return <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-gray-900">{row.name}</h2><p className="text-xs text-gray-500">Intake: {(row.intakeStatus ?? "unknown").replace(/_/g, " ")}</p>{showOwner && <p className="text-xs text-gray-500">Owner: {row.owner}</p>}<p className="mt-1 text-xs text-gray-500">{row.loggedDays} days logged this week; {row.previousLoggedDays} last week.</p></div><Link href={`/dashboard/seekers/${row.id}`} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-violet-700 hover:bg-gray-50">Open seeker profile</Link></div>
    <h3 className="mt-6 text-sm font-semibold text-gray-900">This week compared with last week</h3>
    <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">{metrics.map((metric) => <Comparison key={metric.label} label={metric.label} current={metric.current} previous={metric.previous} />)}</div>
    <h3 className="mt-6 text-sm font-semibold text-gray-900">Four-week history</h3>
    <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead><tr className="border-b text-xs text-gray-500"><th className="py-2 pr-3">Week starting</th><th className="px-2 py-2">Applications</th><th className="px-2 py-2">Follow-ups</th><th className="px-2 py-2">Phone</th><th className="px-2 py-2">AI / video</th><th className="px-2 py-2">Offers</th><th className="px-2 py-2">Days logged</th></tr></thead><tbody>{row.weeks.map((week, index) => <tr key={week.start} className={`border-b last:border-0 ${index === 0 ? "bg-violet-50 font-medium" : ""}`}><td className="py-2 pr-3">{week.start}{index === 0 ? " (selected)" : ""}</td><td className="px-2 py-2">{applications(week.counts)}</td><td className="px-2 py-2">{week.counts.follow_ups}</td><td className="px-2 py-2">{week.counts.phone_interviews}</td><td className="px-2 py-2">{week.counts.ai_interviews} / {week.counts.video_interviews}</td><td className="px-2 py-2">{week.counts.offers}</td><td className="px-2 py-2">{week.loggedDays}</td></tr>)}</tbody></table></div>
    <h3 className="mt-6 text-sm font-semibold text-gray-900">Daily work this week</h3>
    {row.days.length === 0 ? <p className="mt-2 text-sm text-gray-600">No Activity Sheet entries were logged for this seeker. Confirm whether work occurred and whether the sheet needs updating.</p> : <div className="mt-3 space-y-2">{row.days.map((day) => <div key={day.date} className="rounded-lg border border-gray-200 p-3 text-sm"><p className="font-medium text-gray-900">{day.date}</p><p className="mt-1 text-gray-700">{applications(day.counts)} applications ({day.counts.easy_applications} easy, {day.counts.company_applications} company) · {day.counts.follow_ups} follow-ups · {day.counts.phone_interviews} phone · {day.counts.ai_interviews} AI · {day.counts.video_interviews} video · {day.counts.offers} offers</p>{day.notes.map((note, index) => <p key={index} className="mt-1 text-gray-600">Note: {note}</p>)}</div>)}</div>}
    {row.prompts.length > 0 && <div className="mt-5 rounded-lg bg-amber-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Discuss on Friday</p><ul className="mt-1 list-disc pl-5 text-sm text-amber-900">{row.prompts.map((prompt) => <li key={prompt}>{prompt}</li>)}</ul></div>}
    <p className="mt-4 text-xs text-gray-500">Figures reflect logged Activity Sheet entries. A zero may mean work was not recorded; confirm it in the review.</p>
  </section>;
}

export default function WeeklyReviewClient({ weekStart, weekEnd, rows, totals, showOwner, decisions: initialDecisions, tablePending, owners, viewerId, canManageTeam }: { weekStart: string; weekEnd: string; rows: WeeklyReviewRow[]; totals: ActivityCounts; showOwner: boolean; decisions: FridayDecision[]; tablePending: boolean; owners: Array<{ id: string; name: string }>; viewerId: string; canManageTeam: boolean }) {
  const [search, setSearch] = useState("");
  const [needsDiscussionOnly, setNeedsDiscussionOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState(initialDecisions);
  const visible = useMemo(() => rows.filter((row) => {
    if (needsDiscussionOnly && row.prompts.length === 0 && !decisions.some((item) => item.job_seeker_id === row.id && item.week_start < weekStart && item.status === "open")) return false;
    const needle = search.trim().toLowerCase();
    return !needle || row.name.toLowerCase().includes(needle) || row.owner.toLowerCase().includes(needle);
  }), [rows, search, needsDiscussionOnly, decisions, weekStart]);
  const selected = visible.find((row) => row.id === selectedId) ?? visible[0];
  const currentDecision = selected ? decisions.find((item) => item.job_seeker_id === selected.id && item.week_start === weekStart) ?? null : null;
  const priorOpen = selected ? decisions.filter((item) => item.job_seeker_id === selected.id && item.week_start < weekStart && item.status === "open") : [];
  function onDecisionSaved(decision: FridayDecision) {
    setDecisions((current) => [decision, ...current.filter((item) => item.id !== decision.id)]);
  }
  return <>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4"><div><p className="font-semibold text-gray-900">{weekStart} to {weekEnd}</p><p className="text-xs text-gray-500">Monday through Sunday · includes the Friday meeting week</p></div><div className="flex gap-2 text-sm"><Link href={`/dashboard/weekly-review?week=${shiftSheetDate(weekStart, -7)}`} className="rounded-lg border border-gray-300 px-3 py-2 hover:bg-gray-50">Previous week</Link><Link href={`/dashboard/weekly-review?week=${shiftSheetDate(weekStart, 7)}`} className="rounded-lg border border-gray-300 px-3 py-2 hover:bg-gray-50">Next week</Link></div></div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-6"><Metric label="Assigned seekers" value={rows.length} /><Metric label="Applications logged" value={applications(totals)} /><Metric label="Follow-ups logged" value={totals.follow_ups} /><Metric label="Interviews logged" value={interviewTotal(totals)} /><Metric label="Offers logged" value={totals.offers} /><Metric label="Open prior actions" value={decisions.filter((item) => item.week_start < weekStart && item.status === "open").length} /></div>
    <div className="flex flex-wrap items-center gap-3"><input aria-label="Search seeker or owner" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search seeker or owner" className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm" /><label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={needsDiscussionOnly} onChange={(event) => setNeedsDiscussionOnly(event.target.checked)} /> With discussion points or open actions</label><span className="text-xs text-gray-500">Showing {visible.length} of {rows.length}</span></div>
    {rows.length === 0 ? <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600">No assigned seekers with active accounts are available for this review.</div> : visible.length === 0 ? <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600">No seekers match these filters.</div> : <div className="grid gap-4 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]"><div className="space-y-2" aria-label="Select a seeker">{visible.map((row) => <button key={row.id} type="button" onClick={() => setSelectedId(row.id)} aria-current={selected.id === row.id ? "true" : undefined} className={`w-full rounded-xl border p-4 text-left ${selected.id === row.id ? "border-violet-400 bg-violet-50" : "border-gray-200 bg-white hover:border-violet-300"}`}><span className="block font-semibold text-gray-900">{row.name}</span><span className="block text-xs text-gray-500">{(row.intakeStatus ?? "unknown").replace(/_/g, " ")}</span>{showOwner && <span className="block text-xs text-gray-500">{row.owner}</span>}<span className="mt-2 block text-xs text-gray-600">{applications(row.counts)} applications · {row.counts.phone_interviews} phone · {row.prompts.length} discussion point{row.prompts.length === 1 ? "" : "s"}</span></button>)}</div><div className="min-w-0"><SeekerDetail row={selected} showOwner={showOwner} /><FridayDecisionPanel key={`${weekStart}:${selected.id}`} row={selected} weekStart={weekStart} initial={currentDecision} priorOpen={priorOpen} owners={owners} canManageTeam={canManageTeam} viewerId={viewerId} onSaved={onDecisionSaved} tablePending={tablePending} /></div></div>}
  </>;
}
