"use client";

type Stats = {
  totalInterviews: number;
  passRate: number;
  offers: number;
  percentile: number;
  passed: number;
  failed: number;
};

type PracticeSession = {
  id: string;
  overall_score: number | null;
  status: string;
  created_at: string;
};

type InterviewResult = {
  id: string;
  outcome: string;
  stage: string | null;
  internal_rating: number | null;
  interviewer_feedback: string | null;
  created_at: string;
};

export default function PerformanceClient({
  stats,
  practiceSessions,
  recentResults,
}: {
  stats: Stats;
  practiceSessions: PracticeSession[];
  recentResults: InterviewResult[];
}) {
  if (
    stats.totalInterviews === 0 &&
    practiceSessions.length === 0
  ) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <div className="text-6xl mb-4">📊</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          No Performance Data Yet
        </h3>
        <p className="text-gray-500 max-w-md mx-auto">
          Complete interviews and practice sessions to see your performance
          metrics and ranking here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Interviews"
          value={stats.totalInterviews}
          color="gray"
        />
        <StatCard
          label="Pass Rate"
          value={`${stats.passRate}%`}
          color={stats.passRate >= 70 ? "green" : stats.passRate >= 40 ? "yellow" : "red"}
        />
        <StatCard label="Offers Received" value={stats.offers} color="green" />
        <StatCard
          label="Your Ranking"
          value={`Top ${100 - stats.percentile}%`}
          subtitle="among all candidates"
          color="blue"
        />
      </div>

      {/* Ranking Visualization */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Your Ranking
        </h3>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className="bg-violet-600 h-4 rounded-full transition-all duration-500"
                style={{ width: `${stats.percentile}%` }}
              />
            </div>
            <div className="flex justify-between mt-1 text-xs text-gray-400">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-violet-600">
              Top {100 - stats.percentile}%
            </p>
            <p className="text-xs text-gray-500">
              based on interview success rate
            </p>
          </div>
        </div>
      </div>

      {/* Interview Outcome Breakdown */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Interview Outcome Breakdown
        </h3>
        {stats.totalInterviews === 0 ? (
          <p className="text-gray-500 text-sm">No interview results yet.</p>
        ) : (
          <div className="space-y-3">
            <OutcomeBar
              label="Passed / Advanced"
              count={stats.passed}
              total={stats.totalInterviews}
              color="bg-green-500"
            />
            <OutcomeBar
              label="Offers"
              count={stats.offers}
              total={stats.totalInterviews}
              color="bg-emerald-500"
            />
            <OutcomeBar
              label="Failed / Rejected"
              count={stats.failed}
              total={stats.totalInterviews}
              color="bg-red-400"
            />
          </div>
        )}
      </div>

      {/* Practice Session Scores */}
      {practiceSessions.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Practice Session Scores
          </h3>
          <div className="space-y-3">
            {practiceSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="text-sm text-gray-600">
                  {new Date(session.created_at).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-32 bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        (session.overall_score ?? 0) >= 70
                          ? "bg-green-500"
                          : (session.overall_score ?? 0) >= 40
                          ? "bg-yellow-500"
                          : "bg-red-400"
                      }`}
                      style={{
                        width: `${session.overall_score ?? 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-sm font-bold text-gray-900 w-12 text-right">
                    {session.overall_score ?? 0}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Interview Results */}
      {recentResults.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Recent Interview Results
          </h3>
          <div className="space-y-3">
            {recentResults.map((result) => (
              <div
                key={result.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${outcomeStyles[result.outcome as keyof typeof outcomeStyles] || "bg-gray-100 text-gray-600"}`}
                    >
                      {result.outcome}
                    </span>
                    {result.stage && (
                      <span className="text-xs text-gray-500">
                        {result.stage}
                      </span>
                    )}
                  </div>
                  {result.interviewer_feedback && (
                    <p className="text-sm text-gray-600 mt-1 truncate max-w-md">
                      {result.interviewer_feedback}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">
                    {new Date(result.created_at).toLocaleDateString()}
                  </p>
                  {result.internal_rating && (
                    <div className="flex gap-0.5 mt-1 justify-end">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <span
                          key={star}
                          className={`text-xs ${
                            star <= result.internal_rating!
                              ? "text-yellow-400"
                              : "text-gray-300"
                          }`}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const outcomeStyles = {
  passed: "bg-green-100 text-green-700",
  advanced: "bg-violet-100 text-violet-700",
  offer: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  rejected: "bg-red-100 text-red-600",
  pending: "bg-yellow-100 text-yellow-700",
};

function StatCard({
  label,
  value,
  subtitle,
  color,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    gray: "text-gray-900",
    green: "text-green-600",
    red: "text-red-600",
    yellow: "text-yellow-600",
    blue: "text-violet-600",
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="text-sm font-medium text-gray-500">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${colorMap[color] || "text-gray-900"}`}>
        {value}
      </div>
      {subtitle && (
        <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
      )}
    </div>
  );
}

function OutcomeBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-700">{label}</span>
        <span className="text-gray-500">
          {count} ({pct}%)
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className={`${color} h-2.5 rounded-full transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
