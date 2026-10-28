"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { interviewTotal, shiftSheetDate, type ActivityCounts } from "@/lib/activity-sheet";
import type { WeeklyReviewRow } from "@/lib/weekly-seeker-review";

function applications(counts: ActivityCounts) {
  return counts.easy_applications + counts.company_applications;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-gray-200 bg-white px-4 py-3"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p></div>;
}

export default function WeeklyReviewClient({ weekStart, weekEnd, rows, totals, showOwner }: {
  weekStart: string;
  weekEnd: string;
  rows: WeeklyReviewRow[];
  totals: ActivityCounts;
  showOwner: boolean;
}) {
  const [search, setSearch] = useState("");
  const [needsDiscussionOnly, setNeedsDiscussionOnly] = useState(false);
  const visible = useMemo(() => rows.filter((row) => {
    if (needsDiscussionOnly && row.prompts.length === 0) return false;
    const needle = search.trim().toLowerCase();
    return !needle || row.name.toLowerCase().includes(needle) || row.owner.toLowerCase().includes(needle);
  }), [rows, search, needsDiscussionOnly]);
  const previousWeek = shiftSheetDate(weekStart, -7);
  const nextWeek = shiftSheetDate(weekStart, 7);

  return <>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <p className="font-semibold text-gray-900">{weekStart} to {weekEnd}</p>
        <p className="text-xs text-gray-500">Monday through Sunday · includes the Friday meeting week</p>
      </div>
      <div className="flex gap-2 text-sm">
        <Link href={`/dashboard/weekly-review?week=${previousWeek}`} className="rounded-lg border border-gray-300 px-3 py-2 hover:bg-gray-50">Previous week</Link>
        <Link href={`/dashboard/weekly-review?week=${nextWeek}`} className="rounded-lg border border-gray-300 px-3 py-2 hover:bg-gray-50">Next week</Link>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <Metric label="Active seekers" value={rows.length} />
      <Metric label="Applications logged" value={applications(totals)} />
      <Metric label="Follow-ups logged" value={totals.follow_ups} />
      <Metric label="Interviews logged" value={interviewTotal(totals)} />
      <Metric label="Offers logged" value={totals.offers} />
    </div>

    <div className="flex flex-wrap items-center gap-3">
      <input aria-label="Search seeker or owner" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search seeker or owner" className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={needsDiscussionOnly} onChange={(event) => setNeedsDiscussionOnly(event.target.checked)} /> With discussion points</label>
      <span className="text-xs text-gray-500">Showing {visible.length} of {rows.length}</span>
    </div>

    {rows.length === 0 ? <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600">No active assigned job seekers are available for this review.</div> : visible.length === 0 ? <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600">No seekers match these filters.</div> :
      <div className="space-y-4">{visible.map((row) => {
        const currentApps = applications(row.counts);
        const previousApps = applications(row.previousCounts);
        return <section key={row.id} className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><Link href={`/dashboard/seekers/${row.id}`} className="font-semibold text-violet-700 hover:underline">{row.name}</Link>{showOwner && <p className="text-xs text-gray-500">Owner: {row.owner}</p>}</div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${row.loggedDays ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"}`}>{row.loggedDays} day{row.loggedDays === 1 ? "" : "s"} logged</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><p className="text-gray-500">Applications</p><p className="font-semibold text-gray-900">{currentApps} <span className="font-normal text-xs text-gray-500">vs {previousApps} last week</span></p><p className="text-xs text-gray-500">{row.counts.easy_applications} easy · {row.counts.company_applications} company</p></div>
            <div><p className="text-gray-500">Follow-ups</p><p className="font-semibold text-gray-900">{row.counts.follow_ups} <span className="font-normal text-xs text-gray-500">vs {row.previousCounts.follow_ups} last week</span></p></div>
            <div><p className="text-gray-500">Interviews</p><p className="font-semibold text-gray-900">{interviewTotal(row.counts)} <span className="font-normal text-xs text-gray-500">vs {interviewTotal(row.previousCounts)} last week</span></p><p className="text-xs text-gray-500">{row.counts.phone_interviews} phone · {row.counts.ai_interviews} AI · {row.counts.video_interviews} video</p></div>
            <div><p className="text-gray-500">Offers</p><p className="font-semibold text-gray-900">{row.counts.offers} <span className="font-normal text-xs text-gray-500">vs {row.previousCounts.offers} last week</span></p></div>
          </div>
          {row.prompts.length > 0 && <div className="mt-4 rounded-lg bg-amber-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Discuss on Friday</p><ul className="mt-1 list-disc pl-5 text-sm text-amber-900">{row.prompts.map((prompt) => <li key={prompt}>{prompt}</li>)}</ul></div>}
          {row.notes.length > 0 && <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium text-gray-700">Activity notes ({row.notes.length})</summary><ul className="mt-2 space-y-1 text-gray-600">{row.notes.map((note, index) => <li key={`${note.date}-${index}`}><span className="font-medium">{note.date}:</span> {note.text}</li>)}</ul></details>}
        </section>;
      })}</div>}
  </>;
}
