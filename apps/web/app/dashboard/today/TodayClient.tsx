"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface AmTaskRow {
  am_id: string;
  kind: string;
  source_id: string;
  task_key: string;
  title: string;
  body: string | null;
  priority: number;
  due_at: string | null;
  link_url: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

const KIND_LABELS: Record<string, string> = {
  attention_item: "Attention",
  delivery_next_action: "Delivery",
  delivery_blocker: "Blocker",
  delivery_stale: "Stale",
  delivery_risk_review: "Risk",
  billing_overdue: "Billing",
  payslip_sign: "Payslip",
  outreach_reply: "Reply",
  interview_upcoming: "Interview",
};

const KIND_STYLES: Record<string, string> = {
  attention_item: "bg-amber-100 text-amber-700",
  delivery_next_action: "bg-violet-100 text-violet-700",
  delivery_blocker: "bg-orange-100 text-orange-800",
  delivery_stale: "bg-slate-200 text-slate-700",
  delivery_risk_review: "bg-red-100 text-red-700",
  billing_overdue: "bg-red-100 text-red-700",
  payslip_sign: "bg-emerald-100 text-emerald-700",
  outreach_reply: "bg-violet-100 text-violet-700",
  interview_upcoming: "bg-purple-100 text-purple-700",
};

function fmtDueAt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = d.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const future = diffMs > 0;
  const hours = Math.round(absMs / (60 * 60 * 1000));
  if (hours < 1) return future ? "soon" : "just now";
  if (hours < 48) return future ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return future ? `in ${days}d` : `${days}d ago`;
}

export default function TodayClient({
  initialTasks,
  amName,
}: {
  initialTasks: AmTaskRow[];
  amName: string;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [filter, setFilter] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = { all: tasks.length } as Record<string, number>;
    for (const t of tasks) c[t.kind] = (c[t.kind] ?? 0) + 1;
    return c;
  }, [tasks]);

  const filtered = filter === "all" ? tasks : tasks.filter((t) => t.kind === filter);

  async function dismiss(task: AmTaskRow, action: "snooze" | "resolve") {
    setBusy(task.task_key);
    try {
      const res = await fetch("/api/me/tasks/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_key: task.task_key,
          action,
          snooze_hours: action === "snooze" ? 24 : undefined,
        }),
      });
      if (res.ok) {
        setTasks((prev) => prev.filter((t) => t.task_key !== task.task_key));
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  const filters: Array<{ key: string; label: string }> = [
    { key: "all", label: "All" },
    { key: "attention_item", label: "Attention" },
    { key: "delivery_next_action", label: "Delivery" },
    { key: "delivery_blocker", label: "Blockers" },
    { key: "delivery_stale", label: "Stale" },
    { key: "delivery_risk_review", label: "Risk" },
    { key: "outreach_reply", label: "Replies" },
    { key: "interview_upcoming", label: "Interviews" },
    { key: "billing_overdue", label: "Billing" },
    { key: "payslip_sign", label: "Payslip" },
  ];

  if (tasks.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center">
        <p className="text-sm font-medium text-gray-700">You're clear, {amName}.</p>
        <p className="text-xs text-gray-400 mt-2">
          No open tasks across delivery, attention items, billing, payslips,
          replies, or upcoming interviews.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f.key
                ? "bg-violet-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {f.label}
            {counts[f.key] !== undefined && (
              <span className="ml-1.5 opacity-70">{counts[f.key]}</span>
            )}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((task) => {
          const kindLabel = KIND_LABELS[task.kind] ?? task.kind;
          const kindStyle = KIND_STYLES[task.kind] ?? "bg-gray-100 text-gray-700";
          const isBusy = busy === task.task_key;

          return (
            <div
              key={task.task_key}
              className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${kindStyle}`}>
                    {kindLabel}
                  </span>
                  <span className="text-xs text-gray-400">{fmtDueAt(task.due_at)}</span>
                  {task.priority >= 8 && (
                    <span className="text-[10px] font-semibold text-red-600 uppercase">High</span>
                  )}
                </div>
                <p className="text-sm font-medium text-gray-900">{task.title}</p>
                {task.body && (
                  <p className="text-xs text-gray-500 mt-0.5">{task.body}</p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {task.link_url && (
                  <Link
                    href={task.link_url}
                    className="px-3 py-1.5 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700"
                  >
                    Open
                  </Link>
                )}
                <button
                  onClick={() => dismiss(task, "snooze")}
                  disabled={isBusy}
                  className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
                >
                  Snooze 24h
                </button>
                <button
                  onClick={() => dismiss(task, "resolve")}
                  disabled={isBusy}
                  className="text-xs text-green-600 hover:text-green-700 disabled:opacity-50"
                >
                  Resolved
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
