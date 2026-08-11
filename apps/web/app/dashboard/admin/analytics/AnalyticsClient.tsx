"use client";

type Funnel = {
  total_seekers: number;
  assigned: number;
  applied: number;
  interviewed: number;
  placed: number;
};

type Metrics = {
  interviews_this_month: number;
  interviews_prev_month: number;
  applications_this_month: number;
  applications_prev_month: number;
};

type LeaderboardEntry = {
  id: string;
  full_name: string | null;
  photo: string | null;
  total_seekers: number;
  placed: number;
  interviews: number;
  placement_rate: number;
};

type LaneSummary = {
  surfaced: number;
  queued: number;
  applied: number;
  active: number;
  needs_attention: number;
  queue_rate: number;
  applied_rate: number;
  success_from_queue_rate: number;
};

type AdjacentOperator = {
  window_days: number;
  primary: LaneSummary;
  adjacent: LaneSummary & {
    explicitly_tagged_queued: number;
    inferred_legacy_queued: number;
  };
  top_supporting_reasons: Array<{ label: string; count: number }>;
  am_performance: Array<{
    id: string;
    name: string;
    surfaced: number;
    queued: number;
    applied: number;
    queue_rate: number;
    applied_rate: number;
  }>;
  recent_adjacent_wins: Array<{
    job_post_id: string;
    job_seeker_id: string;
    title: string;
    company: string | null;
    seeker_name: string;
    account_manager_name: string;
    score: number;
    updated_at: string | null;
    queue_category: string | null;
    supporting_reasons: string[];
  }>;
};

function pct(a: number, base: number): number {
  if (base === 0) return 0;
  return Math.round((a / base) * 100);
}

function trendLabel(current: number, prev: number): { text: string; up: boolean } {
  if (prev === 0) return { text: current > 0 ? "↑ new" : "—", up: true };
  const diff = current - prev;
  const sign = diff >= 0 ? "↑" : "↓";
  const pctChange = Math.abs(Math.round((diff / prev) * 100));
  return { text: `${sign} ${pctChange}% vs last month`, up: diff >= 0 };
}

function formatRate(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDate(value: string | null) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString();
}

export default function AnalyticsClient({
  funnel,
  metrics,
  leaderboard,
  adjacentOperator,
}: {
  funnel: Funnel;
  metrics: Metrics;
  leaderboard: LeaderboardEntry[];
  adjacentOperator: AdjacentOperator;
}) {
  const ivTrend = trendLabel(metrics.interviews_this_month, metrics.interviews_prev_month);
  const appTrend = trendLabel(metrics.applications_this_month, metrics.applications_prev_month);

  const funnelSteps = [
    { label: "Total Seekers", value: funnel.total_seekers, color: "bg-violet-500" },
    { label: "Assigned to AM", value: funnel.assigned, color: "bg-indigo-500" },
    { label: "Applied", value: funnel.applied, color: "bg-violet-500" },
    { label: "Interviewed", value: funnel.interviewed, color: "bg-purple-500" },
    { label: "Placed", value: funnel.placed, color: "bg-green-500" },
  ];
  const adjacentQueueLift =
    adjacentOperator.primary.queue_rate > 0
      ? Number(
          (
            (adjacentOperator.adjacent.queue_rate /
              adjacentOperator.primary.queue_rate) *
            100
          ).toFixed(0)
        )
      : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Platform Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">Overview of all placement activity across the platform</p>
      </div>

      {/* Month metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500">Interviews This Month</p>
          <p className="text-4xl font-bold text-violet-600 mt-1">{metrics.interviews_this_month}</p>
          <p className={`text-xs mt-1 ${ivTrend.up ? "text-green-600" : "text-red-500"}`}>{ivTrend.text}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500">Applications This Month</p>
          <p className="text-4xl font-bold text-purple-600 mt-1">{metrics.applications_this_month}</p>
          <p className={`text-xs mt-1 ${appTrend.up ? "text-green-600" : "text-red-500"}`}>{appTrend.text}</p>
        </div>
      </div>

      {/* Funnel */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-6">Placement Funnel</h2>
        <div className="space-y-3">
          {funnelSteps.map((step) => {
            const width = pct(step.value, funnel.total_seekers);
            return (
              <div key={step.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{step.label}</span>
                  <span className="font-semibold text-gray-900">
                    {step.value.toLocaleString()}
                    {funnel.total_seekers > 0 && (
                      <span className="text-xs text-gray-400 font-normal ml-1">
                        ({pct(step.value, funnel.total_seekers)}%)
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-5 rounded-full ${step.color} transition-all`}
                    style={{ width: `${Math.max(width, step.value > 0 ? 2 : 0)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Conversion rates */}
        {funnel.total_seekers > 0 && (
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-xs text-gray-500">Assignment rate</p>
              <p className="text-xl font-bold text-gray-900">{pct(funnel.assigned, funnel.total_seekers)}%</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-xs text-gray-500">Applied rate</p>
              <p className="text-xl font-bold text-gray-900">{pct(funnel.applied, funnel.total_seekers)}%</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-xs text-gray-500">Interview rate</p>
              <p className="text-xl font-bold text-gray-900">{pct(funnel.interviewed, funnel.total_seekers)}%</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-xs text-gray-500">Placement rate</p>
              <p className="text-xl font-bold text-green-600">{pct(funnel.placed, funnel.total_seekers)}%</p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Adjacent Opportunity Operator</h2>
            <p className="text-sm text-gray-500">
              Last {adjacentOperator.window_days} days of below-threshold adjacent-fit review activity
            </p>
          </div>
          <div className="text-xs text-gray-500">
            Adjacent queue rate is {formatRate(adjacentOperator.adjacent.queue_rate)}
            {adjacentOperator.primary.queue_rate > 0 && (
              <span> ({adjacentQueueLift}% of the primary lane)</span>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-700">Adjacent surfaced</p>
            <p className="mt-1 text-3xl font-bold text-amber-900">
              {adjacentOperator.adjacent.surfaced.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-amber-700">
              {adjacentOperator.adjacent.queued.toLocaleString()} manually queued
            </p>
          </div>
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
            <p className="text-sm font-medium text-violet-700">Adjacent queue rate</p>
            <p className="mt-1 text-3xl font-bold text-violet-900">
              {formatRate(adjacentOperator.adjacent.queue_rate)}
            </p>
            <p className="mt-1 text-xs text-violet-700">
              {adjacentOperator.adjacent.explicitly_tagged_queued.toLocaleString()} tagged,
              {" "}
              {adjacentOperator.adjacent.inferred_legacy_queued.toLocaleString()} legacy
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-700">Adjacent applied</p>
            <p className="mt-1 text-3xl font-bold text-emerald-900">
              {adjacentOperator.adjacent.applied.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-emerald-700">
              {formatRate(adjacentOperator.adjacent.success_from_queue_rate)} of queued adjacent jobs reached apply/complete
            </p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-medium text-rose-700">Adjacent operator load</p>
            <p className="mt-1 text-3xl font-bold text-rose-900">
              {adjacentOperator.adjacent.active.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-rose-700">
              {adjacentOperator.adjacent.needs_attention.toLocaleString()} currently need attention
            </p>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="py-2 pr-4 text-left font-medium text-gray-500">Lane</th>
                <th className="py-2 pr-4 text-right font-medium text-gray-500">Surfaced</th>
                <th className="py-2 pr-4 text-right font-medium text-gray-500">Queued</th>
                <th className="py-2 pr-4 text-right font-medium text-gray-500">Applied</th>
                <th className="py-2 pr-4 text-right font-medium text-gray-500">In Progress</th>
                <th className="py-2 pr-4 text-right font-medium text-gray-500">Needs Attention</th>
                <th className="py-2 pr-4 text-right font-medium text-gray-500">Queue Rate</th>
                <th className="py-2 text-right font-medium text-gray-500">Apply Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[
                { label: "Primary lane", summary: adjacentOperator.primary, tone: "text-violet-700" },
                { label: "Adjacent lane", summary: adjacentOperator.adjacent, tone: "text-amber-700" },
              ].map((row) => (
                <tr key={row.label}>
                  <td className="py-3 pr-4 font-medium text-gray-900">{row.label}</td>
                  <td className="py-3 pr-4 text-right text-gray-700">{row.summary.surfaced.toLocaleString()}</td>
                  <td className="py-3 pr-4 text-right text-gray-700">{row.summary.queued.toLocaleString()}</td>
                  <td className="py-3 pr-4 text-right text-gray-700">{row.summary.applied.toLocaleString()}</td>
                  <td className="py-3 pr-4 text-right text-gray-700">{row.summary.active.toLocaleString()}</td>
                  <td className="py-3 pr-4 text-right text-gray-700">{row.summary.needs_attention.toLocaleString()}</td>
                  <td className={`py-3 pr-4 text-right font-semibold ${row.tone}`}>{formatRate(row.summary.queue_rate)}</td>
                  <td className={`py-3 text-right font-semibold ${row.tone}`}>{formatRate(row.summary.applied_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr,1.4fr]">
          <div className="rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900">Why Adjacent Jobs Were Still Worth Reviewing</h3>
            {adjacentOperator.top_supporting_reasons.length === 0 ? (
              <p className="mt-3 text-sm text-gray-400">No adjacent review signals yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {adjacentOperator.top_supporting_reasons.map((reason) => (
                  <div key={reason.label}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{reason.label}</span>
                      <span className="font-semibold text-gray-900">{reason.count}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-gray-100">
                      <div
                        className="h-2 rounded-full bg-amber-400"
                        style={{
                          width: `${Math.max(
                            8,
                            (reason.count /
                              Math.max(adjacentOperator.top_supporting_reasons[0]?.count ?? 1, 1)) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900">AM Performance On Adjacent Jobs</h3>
            {adjacentOperator.am_performance.length === 0 ? (
              <p className="mt-3 text-sm text-gray-400">No adjacent AM activity yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="py-2 pr-4 text-left font-medium text-gray-500">Account Manager</th>
                      <th className="py-2 pr-4 text-right font-medium text-gray-500">Surfaced</th>
                      <th className="py-2 pr-4 text-right font-medium text-gray-500">Queued</th>
                      <th className="py-2 pr-4 text-right font-medium text-gray-500">Applied</th>
                      <th className="py-2 pr-4 text-right font-medium text-gray-500">Queue Rate</th>
                      <th className="py-2 text-right font-medium text-gray-500">Apply Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {adjacentOperator.am_performance.map((am) => (
                      <tr key={am.id}>
                        <td className="py-3 pr-4 font-medium text-gray-900">{am.name}</td>
                        <td className="py-3 pr-4 text-right text-gray-700">{am.surfaced}</td>
                        <td className="py-3 pr-4 text-right text-gray-700">{am.queued}</td>
                        <td className="py-3 pr-4 text-right text-gray-700">{am.applied}</td>
                        <td className="py-3 pr-4 text-right font-semibold text-amber-700">{formatRate(am.queue_rate)}</td>
                        <td className="py-3 text-right font-semibold text-emerald-700">{formatRate(am.applied_rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900">Recent Adjacent Wins</h3>
          {adjacentOperator.recent_adjacent_wins.length === 0 ? (
            <p className="mt-3 text-sm text-gray-400">No adjacent wins yet.</p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
              {adjacentOperator.recent_adjacent_wins.map((win) => (
                <div key={`${win.job_seeker_id}:${win.job_post_id}`} className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">{win.title}</p>
                      <p className="text-sm text-gray-600">
                        {win.company ?? "Unknown company"} · {win.seeker_name}
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                      {Math.round(win.score)}%
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    AM: {win.account_manager_name} · queued as {win.queue_category ?? "legacy"}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">{formatDate(win.updated_at)}</p>
                  {win.supporting_reasons.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {win.supporting_reasons.map((reason) => (
                        <span
                          key={reason}
                          className="rounded-full bg-white px-2 py-1 text-[11px] text-gray-600 border border-gray-200"
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AM Leaderboard */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Account Manager Leaderboard</h2>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No account managers yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 pr-4 font-medium text-gray-500 w-8">#</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">Account Manager</th>
                  <th className="text-right py-2 pr-4 font-medium text-gray-500">Seekers</th>
                  <th className="text-right py-2 pr-4 font-medium text-gray-500">Placed</th>
                  <th className="text-right py-2 pr-4 font-medium text-gray-500">Interviews</th>
                  <th className="text-right py-2 font-medium text-gray-500">Placement %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {leaderboard.map((am, idx) => (
                  <tr key={am.id} className="hover:bg-gray-50">
                    <td className="py-3 pr-4 text-gray-400 font-semibold">
                      {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="font-medium text-gray-900">{am.full_name ?? "Unknown"}</span>
                    </td>
                    <td className="py-3 pr-4 text-right text-gray-700">{am.total_seekers}</td>
                    <td className="py-3 pr-4 text-right">
                      <span className={am.placed > 0 ? "text-green-600 font-semibold" : "text-gray-400"}>
                        {am.placed}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right text-gray-700">{am.interviews}</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-1.5 rounded-full bg-green-500"
                            style={{ width: `${am.placement_rate}%` }}
                          />
                        </div>
                        <span className={`font-semibold ${am.placement_rate >= 50 ? "text-green-600" : am.placement_rate >= 25 ? "text-amber-600" : "text-gray-500"}`}>
                          {am.placement_rate}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
