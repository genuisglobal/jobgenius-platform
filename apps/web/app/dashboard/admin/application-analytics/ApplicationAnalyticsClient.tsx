"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type AnalyticsData = {
  period_days: number;
  summary: {
    total_runs: number;
    successful: number;
    failed: number;
    success_rate: number;
  };
  funnel: {
    queued: number;
    applied: number;
    interviewed: number;
    placed: number;
  };
  by_ats: Record<string, { total: number; applied: number; failed: number }>;
  status_breakdown: Record<string, number>;
  failure_reasons: Record<string, number>;
  recent_failures: {
    id: string;
    ats_type: string;
    error: string | null;
    error_code: string | null;
    step: string | null;
    job: { title: string; company: string } | null;
    created_at: string;
  }[];
  daily: { date: string; total: number; applied: number; failed: number }[];
};

export default function ApplicationAnalyticsClient() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/application-analytics?days=${days}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-64" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-gray-200 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return <div className="p-6 text-gray-500">Failed to load analytics</div>;

  const atsEntries = Object.entries(data.by_ats).sort(([, a], [, b]) => b.total - a.total);
  const maxDaily = Math.max(...data.daily.map((d) => d.total), 1);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Application Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">Success rates, failure analysis, and conversion funnel</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/admin/adapter-health" className="px-3 py-1.5 text-sm text-violet-600 hover:bg-violet-50 rounded-lg">
            Adapter Health →
          </Link>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="px-3 py-1.5 border rounded-lg text-sm"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Runs" value={data.summary.total_runs} color="blue" />
        <StatCard label="Successful" value={data.summary.successful} color="green" />
        <StatCard label="Failed" value={data.summary.failed} color="red" />
        <StatCard
          label="Success Rate"
          value={`${data.summary.success_rate}%`}
          color={data.summary.success_rate >= 60 ? "green" : data.summary.success_rate >= 30 ? "yellow" : "red"}
        />
      </div>

      {/* Conversion funnel */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Conversion Funnel</h2>
        <div className="flex items-end gap-1">
          {[
            { label: "Queued", value: data.funnel.queued, color: "bg-violet-500" },
            { label: "Applied", value: data.funnel.applied, color: "bg-indigo-500" },
            { label: "Interviewed", value: data.funnel.interviewed, color: "bg-purple-500" },
            { label: "Placed", value: data.funnel.placed, color: "bg-green-500" },
          ].map((step, i, arr) => {
            const maxVal = Math.max(...arr.map((s) => s.value), 1);
            const height = Math.max(20, (step.value / maxVal) * 120);
            const prevVal = i > 0 ? arr[i - 1].value : step.value;
            const convRate = prevVal > 0 ? Math.round((step.value / prevVal) * 100) : 0;

            return (
              <div key={step.label} className="flex-1 text-center">
                <div className="text-lg font-bold text-gray-900">{step.value.toLocaleString()}</div>
                <div className={`${step.color} rounded-t mx-auto`} style={{ height, maxWidth: 80 }} />
                <div className="text-xs text-gray-600 mt-1">{step.label}</div>
                {i > 0 && (
                  <div className="text-xs text-gray-400">{convRate}% conv</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By ATS type */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-gray-900 mb-3">By ATS Platform</h2>
          <div className="space-y-3">
            {atsEntries.map(([ats, stats]) => {
              const rate = stats.total > 0 ? Math.round((stats.applied / stats.total) * 100) : 0;
              return (
                <div key={ats} className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-medium text-gray-900 w-32 truncate">{ats}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 min-w-[80px]">
                      <div
                        className={`h-2 rounded-full ${rate >= 60 ? "bg-green-500" : rate >= 30 ? "bg-yellow-500" : "bg-red-500"}`}
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs shrink-0 ml-3">
                    <span className="text-green-600">{stats.applied} ok</span>
                    <span className="text-red-500">{stats.failed} fail</span>
                    <span className="font-medium text-gray-700">{rate}%</span>
                  </div>
                </div>
              );
            })}
            {atsEntries.length === 0 && <p className="text-sm text-gray-400">No data yet</p>}
          </div>
        </div>

        {/* Failure reasons */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Top Failure Reasons</h2>
          <div className="space-y-2">
            {Object.entries(data.failure_reasons)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 10)
              .map(([code, count]) => (
                <div key={code} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 font-mono text-xs truncate max-w-[200px]">{code}</span>
                  <span className="text-red-600 font-medium">{count}</span>
                </div>
              ))}
            {Object.keys(data.failure_reasons).length === 0 && (
              <p className="text-sm text-gray-400">No failures recorded</p>
            )}
          </div>
        </div>
      </div>

      {/* Daily chart (simple bar chart) */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Daily Applications (Last 14 Days)</h2>
        <div className="flex items-end gap-1 h-32">
          {data.daily.map((d) => (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="w-full flex flex-col-reverse gap-0.5">
                <div
                  className="bg-green-400 rounded-t w-full"
                  style={{ height: (d.applied / maxDaily) * 100 }}
                  title={`${d.applied} applied`}
                />
                <div
                  className="bg-red-300 w-full"
                  style={{ height: (d.failed / maxDaily) * 100 }}
                  title={`${d.failed} failed`}
                />
              </div>
              <span className="text-[9px] text-gray-400 -rotate-45 origin-center whitespace-nowrap mt-1">
                {d.date.slice(5)}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-400 rounded" /> Applied</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-300 rounded" /> Failed</span>
        </div>
      </div>

      {/* Recent failures */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Recent Failures</h2>
        <div className="divide-y">
          {data.recent_failures.map((f) => (
            <div key={f.id} className="py-2 flex items-center justify-between text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{f.ats_type}</span>
                  {f.job && (
                    <span className="text-gray-700 truncate">{f.job.company} — {f.job.title}</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Step: {f.step ?? "—"} | {f.error_code ?? f.error ?? "Unknown error"}
                </div>
              </div>
              <span className="text-xs text-gray-400 shrink-0 ml-2">
                {new Date(f.created_at).toLocaleDateString()}
              </span>
            </div>
          ))}
          {data.recent_failures.length === 0 && (
            <p className="text-sm text-gray-400 py-2">No recent failures</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "text-violet-600",
    green: "text-green-600",
    red: "text-red-600",
    yellow: "text-yellow-600",
  };

  return (
    <div className="bg-white rounded-xl border p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${colorMap[color] ?? "text-gray-900"}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}
