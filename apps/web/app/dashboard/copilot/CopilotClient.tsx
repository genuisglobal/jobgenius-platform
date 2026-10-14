"use client";

import { useState } from "react";
import Link from "next/link";

export type PriorityItem = {
  id: string;
  source: "decision" | "task";
  badge: string;
  badgeClass: string;
  title: string;
  detail: string | null;
  href: string | null;
  when: string | null;
};

export type Scorecard = {
  escalations: number;
  asks: number;
  pauses: number;
  attention: number;
  interviews: number;
  replies: number;
};

const START_OF_DAY = [
  "Review overnight recruiter replies and inbox",
  "Clear the Decisions queue — escalations and asks first",
  "Check interviews and assessment deadlines due today",
  "Confirm any pending client facts needed for active applications",
  "Set today's application priority list (strong-fit first)",
];

const END_OF_DAY = [
  "All recruiter replies labeled and logged",
  "Trackers updated for every action taken today",
  "Follow-ups scheduled for pending items",
  "Escalations raised for risky or sensitive issues",
  "No unconfirmed sensitive answers were submitted",
];

function fmtWhen(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const diff = d.getTime() - Date.now();
  const hrs = Math.round(Math.abs(diff) / 3_600_000);
  if (hrs < 1) return diff > 0 ? "soon" : "now";
  if (hrs < 48) return diff > 0 ? `in ${hrs}h` : `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return diff > 0 ? `in ${days}d` : `${days}d ago`;
}

function ScoreCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
      <p className={`text-2xl font-bold ${value > 0 ? tone : "text-gray-300"}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function PriorityColumn({
  title,
  subtitle,
  accent,
  items,
}: {
  title: string;
  subtitle: string;
  accent: string;
  items: PriorityItem[];
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className={`text-sm font-semibold ${accent}`}>{title}</h3>
        <span className="text-xs text-gray-400">{items.length}</span>
      </div>
      <p className="text-xs text-gray-400 mb-3">{subtitle}</p>
      {items.length === 0 ? (
        <div className="text-xs text-gray-400 border border-dashed rounded-lg py-6 text-center">
          Clear
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const when = fmtWhen(item.when);
            return (
              <div key={item.id} className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${item.badgeClass}`}>
                    {item.badge}
                  </span>
                  {when && <span className="text-[11px] text-gray-400">{when}</span>}
                </div>
                <p className="text-sm font-medium text-gray-900">{item.title}</p>
                {item.detail && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.detail}</p>
                )}
                {item.href && (
                  <Link
                    href={item.href}
                    className="inline-block mt-1.5 text-xs font-medium text-violet-600 hover:text-violet-800"
                  >
                    Open →
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Routine({ title, items }: { title: string; items: string[] }) {
  const [checked, setChecked] = useState<boolean[]>(() => items.map(() => false));
  const done = checked.filter(Boolean).length;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-400">
          {done}/{items.length}
        </span>
      </div>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <label key={i} className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-gray-300"
              checked={checked[i]}
              onChange={() =>
                setChecked((prev) => prev.map((c, idx) => (idx === i ? !c : c)))
              }
            />
            <span className={checked[i] ? "line-through text-gray-400" : ""}>{item}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function CopilotClient({
  amName,
  p1,
  p2,
  p3,
  scorecard,
}: {
  amName: string;
  p1: PriorityItem[];
  p2: PriorityItem[];
  p3: PriorityItem[];
  scorecard: Scorecard;
}) {
  const total = p1.length + p2.length + p3.length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Control Center</h1>
          <p className="text-sm text-gray-500 mt-1">
            Your daily operating cockpit, {amName}. Act on the highest-priority items first;
            the system only hands back what needs your judgment.
          </p>
        </div>
        <Link
          href="/dashboard/today"
          className="text-sm text-violet-600 hover:text-violet-800 whitespace-nowrap"
        >
          Full task list →
        </Link>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        <ScoreCard label="Escalations" value={scorecard.escalations} tone="text-red-600" />
        <ScoreCard label="Asks" value={scorecard.asks} tone="text-amber-600" />
        <ScoreCard label="Pauses" value={scorecard.pauses} tone="text-violet-600" />
        <ScoreCard label="Attention" value={scorecard.attention} tone="text-amber-600" />
        <ScoreCard label="Interviews" value={scorecard.interviews} tone="text-purple-600" />
        <ScoreCard label="Replies" value={scorecard.replies} tone="text-violet-600" />
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Today's Priorities{" "}
          <span className="text-sm font-normal text-gray-400">({total})</span>
        </h2>
        {total === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center">
            <p className="text-sm font-medium text-gray-700">You're clear.</p>
            <p className="text-xs text-gray-400 mt-1">
              No open decisions or tasks across your caseload.
            </p>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-5">
            <PriorityColumn
              title="Now"
              subtitle="Urgent / sensitive — handle first"
              accent="text-red-600"
              items={p1}
            />
            <PriorityColumn
              title="Today"
              subtitle="Important — schedule into the day"
              accent="text-amber-600"
              items={p2}
            />
            <PriorityColumn
              title="Plan"
              subtitle="Queue work — fit around priorities"
              accent="text-gray-600"
              items={p3}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Routine title="Start-of-day routine" items={START_OF_DAY} />
        <Routine title="End-of-day review" items={END_OF_DAY} />
      </div>
    </div>
  );
}
