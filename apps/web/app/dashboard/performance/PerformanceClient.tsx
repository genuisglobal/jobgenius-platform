"use client";

type Stats = {
  total_seekers: number;
  placed_seekers: number;
  placement_rate: number;
  interviews_this_month: number;
  interviews_all_time: number;
  applications_this_month: number;
  applications_all_time: number;
  avg_days_to_first_interview: number | null;
};

function StatCard({
  label,
  value,
  sub,
  color = "gray",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: "gray" | "blue" | "green" | "purple" | "amber";
}) {
  const colorMap = {
    gray: "text-gray-900",
    blue: "text-violet-600",
    green: "text-green-600",
    purple: "text-purple-600",
    amber: "text-amber-600",
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className={`mt-2 text-4xl font-bold ${colorMap[color]}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function RateBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{label}</span>
        <span className="font-semibold text-gray-700">{value}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-2 bg-violet-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function PerformanceClient({
  stats,
  amName,
}: {
  stats: Stats;
  amName: string;
}) {
  const monthName = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Performance</h1>
        <p className="text-sm text-gray-500 mt-1">{amName} · {monthName}</p>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Seekers"
          value={stats.total_seekers}
          sub="assigned to me"
          color="gray"
        />
        <StatCard
          label="Placement Rate"
          value={`${stats.placement_rate}%`}
          sub={`${stats.placed_seekers} placed of ${stats.total_seekers}`}
          color={stats.placement_rate >= 50 ? "green" : stats.placement_rate >= 25 ? "amber" : "gray"}
        />
        <StatCard
          label="Interviews (This Month)"
          value={stats.interviews_this_month}
          sub={`${stats.interviews_all_time} all time`}
          color="blue"
        />
        <StatCard
          label="Applications (This Month)"
          value={stats.applications_this_month}
          sub={`${stats.applications_all_time} all time`}
          color="purple"
        />
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Placement funnel */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Seeker Pipeline</h2>
          <div className="space-y-3">
            <RateBar label="Total Seekers" value={stats.total_seekers} max={Math.max(stats.total_seekers, 1)} />
            <RateBar label="Placed" value={stats.placed_seekers} max={Math.max(stats.total_seekers, 1)} />
            <RateBar label="Interviews All Time" value={stats.interviews_all_time} max={Math.max(stats.interviews_all_time, 1)} />
            <RateBar label="Applications All Time" value={stats.applications_all_time} max={Math.max(stats.applications_all_time, 1)} />
          </div>
        </div>

        {/* Timing */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Speed to Action</h2>

          <div className="p-4 bg-violet-50 rounded-lg">
            <p className="text-sm text-violet-700 font-medium">Avg. Days to First Interview</p>
            <p className="text-4xl font-bold text-violet-600 mt-1">
              {stats.avg_days_to_first_interview !== null
                ? `${stats.avg_days_to_first_interview}d`
                : "—"}
            </p>
            <p className="text-xs text-violet-500 mt-1">
              From assignment date to first scheduled interview
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Interviews / Seeker</p>
              <p className="text-2xl font-bold text-gray-900 mt-0.5">
                {stats.total_seekers > 0
                  ? (stats.interviews_all_time / stats.total_seekers).toFixed(1)
                  : "0"}
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Applications / Seeker</p>
              <p className="text-2xl font-bold text-gray-900 mt-0.5">
                {stats.total_seekers > 0
                  ? (stats.applications_all_time / stats.total_seekers).toFixed(1)
                  : "0"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Placed banner */}
      {stats.placed_seekers > 0 && (
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-6 text-white">
          <p className="text-sm font-medium opacity-90">Career milestones achieved</p>
          <p className="text-5xl font-bold mt-1">{stats.placed_seekers}</p>
          <p className="text-sm opacity-80 mt-1">
            job seeker{stats.placed_seekers !== 1 ? "s" : ""} successfully placed
          </p>
        </div>
      )}
    </div>
  );
}
