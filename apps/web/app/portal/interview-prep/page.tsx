import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";

export default async function InterviewPrepListPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: preps } = await supabaseAdmin
    .from("interview_prep")
    .select(`
      *,
      job_posts ( title, company )
    `)
    .eq("job_seeker_id", user.id)
    .order("updated_at", { ascending: false });

  // Get related interviews for context
  const { data: interviews } = await supabaseAdmin
    .from("interviews")
    .select("id, job_post_id, scheduled_at, status")
    .eq("job_seeker_id", user.id)
    .in("status", ["confirmed", "pending_candidate"]);

  // Map job_post_id -> interview
  type InterviewInfo = { id: string; job_post_id: string; scheduled_at: string | null; status: string };
  const interviewByJob = new Map<string, InterviewInfo>();
  (interviews ?? []).forEach((iv: Record<string, unknown>) => {
    if (iv.job_post_id) {
      interviewByJob.set(iv.job_post_id as string, iv as unknown as InterviewInfo);
    }
  });

  // Get practice session stats per prep
  const { data: allSessions } = await supabaseAdmin
    .from("interview_practice_sessions")
    .select("id, interview_prep_id, overall_score, status, questions, completed_at")
    .eq("job_seeker_id", user.id);

  const sessionsByPrep = new Map<
    string,
    { count: number; avgScore: number; questionsAnswered: number }
  >();

  (allSessions ?? []).forEach((s: Record<string, unknown>) => {
    const prepId = s.interview_prep_id as string;
    const existing = sessionsByPrep.get(prepId) || {
      count: 0,
      avgScore: 0,
      questionsAnswered: 0,
    };
    if (s.status === "completed") {
      existing.count++;
      if (typeof s.overall_score === "number") {
        existing.avgScore =
          (existing.avgScore * (existing.count - 1) + s.overall_score) /
          existing.count;
      }
    }
    const questions = (s.questions as Array<{ user_answer?: string }>) ?? [];
    existing.questionsAnswered += questions.filter((q) => q.user_answer).length;
    sessionsByPrep.set(prepId, existing);
  });

  // Aggregate stats
  const completedSessions = (allSessions ?? []).filter(
    (s: Record<string, unknown>) => s.status === "completed"
  );
  const totalSessions = completedSessions.length;
  const totalQuestions = (allSessions ?? []).reduce(
    (sum: number, s: Record<string, unknown>) => {
      const questions = (s.questions as Array<{ user_answer?: string }>) ?? [];
      return sum + questions.filter((q) => q.user_answer).length;
    },
    0
  );
  const scores = completedSessions
    .map((s: Record<string, unknown>) => s.overall_score as number | null)
    .filter((s): s is number => s !== null);
  const avgScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

  // Streak calculation
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const completedDates = new Set(
    completedSessions
      .filter((s: Record<string, unknown>) => s.completed_at)
      .map((s: Record<string, unknown>) => {
        const d = new Date(s.completed_at as string);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      })
  );
  let streakDays = 0;
  const checkDate = new Date(today);
  while (completedDates.has(checkDate.getTime())) {
    streakDays++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  // Score trend
  const recentScores = scores.slice(0, 5);
  const olderScores = scores.slice(5);
  let scoreTrend: "improving" | "stable" | "declining" = "stable";
  if (recentScores.length >= 2 && olderScores.length >= 1) {
    const recentAvg =
      recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    const olderAvg =
      olderScores.reduce((a, b) => a + b, 0) / olderScores.length;
    const diff = recentAvg - olderAvg;
    if (diff >= 5) scoreTrend = "improving";
    else if (diff <= -5) scoreTrend = "declining";
  }

  return (
    <>
      <h2 className="text-xl font-semibold text-gray-900 mb-6">
        Interview Preparation
      </h2>

      {/* Progress Summary */}
      {totalSessions > 0 && (
        <div className="bg-white rounded-lg shadow p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Practice Stats
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {totalSessions}
              </p>
              <p className="text-xs text-gray-500">
                Session{totalSessions !== 1 ? "s" : ""} completed
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {totalQuestions}
              </p>
              <p className="text-xs text-gray-500">Questions answered</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {avgScore}%
                {scoreTrend === "improving" && (
                  <span className="text-sm text-green-600 ml-1">↑</span>
                )}
                {scoreTrend === "declining" && (
                  <span className="text-sm text-red-600 ml-1">↓</span>
                )}
              </p>
              <p className="text-xs text-gray-500">Avg score</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {streakDays > 0 ? (
                  <span className="text-orange-600">{streakDays}-day</span>
                ) : (
                  <span className="text-gray-400">0</span>
                )}
              </p>
              <p className="text-xs text-gray-500">
                {streakDays > 0 ? "Streak" : "Start a streak today!"}
              </p>
            </div>
          </div>
        </div>
      )}

      {!preps || preps.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="text-4xl mb-4">📋</div>
          <p className="text-gray-500">No interview preparations yet.</p>
          <p className="text-sm text-gray-400 mt-2">
            Your account manager will create interview prep materials when you
            have upcoming interviews.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {preps.map((prep: Record<string, unknown>) => {
            const jobPost = prep.job_posts as { title: string; company: string | null } | null;
            const content = prep.content as { role_summary?: string; likely_questions?: string[] } | null;
            const interview = interviewByJob.get(
              prep.job_post_id as string
            );
            const prepStats = sessionsByPrep.get(prep.id as string);

            const daysUntil =
              interview?.scheduled_at
                ? Math.max(
                    0,
                    Math.ceil(
                      (new Date(interview.scheduled_at).getTime() -
                        Date.now()) /
                        (1000 * 60 * 60 * 24)
                    )
                  )
                : null;

            return (
              <Link
                key={prep.id as string}
                href={`/portal/interview-prep/${prep.id}`}
                className="block bg-white rounded-lg shadow p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">
                      {jobPost?.title || "Untitled Position"}
                    </h3>
                    {jobPost?.company && (
                      <p className="text-sm text-gray-500">
                        {jobPost.company}
                      </p>
                    )}
                  </div>
                  {daysUntil !== null && (
                    <span className="inline-block px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                      {daysUntil === 0
                        ? "Interview today"
                        : `${daysUntil}d until interview`}
                    </span>
                  )}
                </div>

                {content?.role_summary && (
                  <p className="text-sm text-gray-600 mt-2">
                    {content.role_summary}
                  </p>
                )}

                <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                  <span>
                    {(content?.likely_questions ?? []).length}{" "}
                    questions
                  </span>
                  <span>
                    Updated{" "}
                    {new Date(
                      prep.updated_at as string
                    ).toLocaleDateString()}
                  </span>
                </div>

                {/* Practice stats for this prep */}
                {prepStats && prepStats.count > 0 && (
                  <div className="flex items-center gap-3 mt-2 text-xs">
                    <span className="text-gray-500">
                      {prepStats.count} session
                      {prepStats.count !== 1 ? "s" : ""}
                    </span>
                    <span className="font-medium text-gray-700">
                      Avg: {Math.round(prepStats.avgScore)}%
                    </span>
                  </div>
                )}

                <div className="flex gap-2 mt-3">
                  <span className="px-2 py-1 bg-violet-50 text-violet-700 rounded text-xs">
                    Study Notes
                  </span>
                  <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs">
                    Practice
                  </span>
                  <span className="px-2 py-1 bg-orange-50 text-orange-700 rounded text-xs">
                    Videos
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
