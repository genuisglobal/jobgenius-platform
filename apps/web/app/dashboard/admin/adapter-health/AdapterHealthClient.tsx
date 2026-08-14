"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type AdapterStats = {
  ats_type: string;
  total_runs: number;
  successes: number;
  failures: number;
  timeouts: number;
  captcha_blocks: number;
  session_expires: number;
  success_rate: number;
  avg_success_ms: number | null;
  last_event_at: string | null;
  status: "healthy" | "degraded" | "down";
};

type FailureBreakdown = {
  byStep: Record<string, number>;
  byError: Record<string, number>;
};

export default function AdapterHealthClient() {
  const [adapters, setAdapters] = useState<AdapterStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [selectedAts, setSelectedAts] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<FailureBreakdown | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/adapter-health?days=${days}`)
      .then((r) => r.json())
      .then((d) => setAdapters(d.adapters ?? []))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    if (!selectedAts) { setBreakdown(null); return; }
    setBreakdownLoading(true);
    fetch(`/api/admin/adapter-health?action=breakdown&ats_type=${selectedAts}&days=${days}`)
      .then((r) => r.json())
      .then(setBreakdown)
      .finally(() => setBreakdownLoading(false));
  }, [selectedAts, days]);

  const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
    healthy: { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
    degraded: { bg: "bg-yellow-50", text: "text-yellow-700", dot: "bg-yellow-500" },
    down: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  };

  if (loading) {
    return (
      <div className="p-6 animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-40 bg-gray-200 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ATS Adapter Health</h1>
          <p className="text-sm text-gray-500 mt-1">Monitor success rates and reliability per platform</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/admin/application-analytics" className="px-3 py-1.5 text-sm text-violet-600 hover:bg-violet-50 rounded-lg">
            ← Application Analytics
          </Link>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="px-3 py-1.5 border rounded-lg text-sm">
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </div>
      </div>

      {/* Adapter cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {adapters.map((a) => {
          const colors = statusColors[a.status] ?? statusColors.healthy;
          const isSelected = selectedAts === a.ats_type;

          return (
            <button
              key={a.ats_type}
              onClick={() => setSelectedAts(isSelected ? null : a.ats_type)}
              className={`text-left rounded-xl border p-5 transition-all ${
                isSelected ? "ring-2 ring-violet-500 border-violet-300" : "hover:border-gray-300"
              } bg-white`}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">{a.ats_type}</h3>
                <span className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${colors.bg} ${colors.text}`}>
                  <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                  {a.status}
                </span>
              </div>

              <div className="text-3xl font-bold text-gray-900 mb-1">
                {a.success_rate}%
              </div>
              <p className="text-xs text-gray-500 mb-3">
                success rate ({a.total_runs} runs)
              </p>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-500">Successes</span>
                  <span className="block text-green-600 font-medium">{a.successes}</span>
                </div>
                <div>
                  <span className="text-gray-500">Failures</span>
                  <span className="block text-red-600 font-medium">{a.failures}</span>
                </div>
                <div>
                  <span className="text-gray-500">Timeouts</span>
                  <span className="block text-orange-600 font-medium">{a.timeouts}</span>
                </div>
                <div>
                  <span className="text-gray-500">CAPTCHA</span>
                  <span className="block text-yellow-600 font-medium">{a.captcha_blocks}</span>
                </div>
              </div>

              {a.avg_success_ms && (
                <div className="mt-2 text-xs text-gray-400">
                  Avg success time: {Math.round(a.avg_success_ms / 1000)}s
                </div>
              )}

              {a.last_event_at && (
                <div className="mt-1 text-xs text-gray-400">
                  Last event: {new Date(a.last_event_at).toLocaleDateString()}
                </div>
              )}
            </button>
          );
        })}

        {adapters.length === 0 && (
          <div className="col-span-3 text-center py-12 text-gray-400">
            No adapter health data recorded yet. Events are logged when the runner completes applications.
          </div>
        )}
      </div>

      {/* Failure breakdown */}
      {selectedAts && (
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-gray-900 mb-4">
            Failure Breakdown — {selectedAts}
          </h2>

          {breakdownLoading ? (
            <div className="animate-pulse h-20 bg-gray-100 rounded" />
          ) : breakdown ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">By Step</h3>
                {Object.entries(breakdown.byStep).length > 0 ? (
                  <div className="space-y-1.5">
                    {Object.entries(breakdown.byStep)
                      .sort(([, a], [, b]) => b - a)
                      .map(([step, count]) => (
                        <div key={step} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">{step}</span>
                          <span className="font-medium text-red-600">{count}</span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">No step-level data</p>
                )}
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">By Error Code</h3>
                {Object.entries(breakdown.byError).length > 0 ? (
                  <div className="space-y-1.5">
                    {Object.entries(breakdown.byError)
                      .sort(([, a], [, b]) => b - a)
                      .map(([code, count]) => (
                        <div key={code} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600 font-mono text-xs truncate max-w-[180px]">{code}</span>
                          <span className="font-medium text-red-600">{count}</span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">No error code data</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No breakdown data</p>
          )}
        </div>
      )}
    </div>
  );
}
