import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import {
  computeDashboardStats,
  computeTrackSummary,
  type DashboardProgress,
  type DashboardTrack,
} from "@/lib/learning/dashboard-metrics";
import Link from "next/link";

type LearningTrackCard = DashboardTrack & {
  title: string;
  description: string | null;
  category: string;
  target_skill?: string | null;
  sort_order: number;
  job_posts: { id: string; title: string; company: string | null } | null;
  learning_lessons: {
    id: string;
    estimated_minutes: number;
    skill_slug?: string | null;
  }[];
};

export default async function LearningDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Fetch published tracks for this seeker
  const { data: tracks } = await supabaseAdmin
    .from("learning_tracks")
    .select(`
      *,
      job_posts ( id, title, company ),
      learning_lessons ( id, estimated_minutes, skill_slug )
    `)
    .eq("job_seeker_id", user.id)
    .eq("status", "published")
    .order("sort_order", { ascending: true });

  // Fetch all progress
  const { data: progress } = await supabaseAdmin
    .from("learning_progress")
    .select("lesson_id, status, completed_at, time_spent_seconds, mastery_score, next_review_at")
    .eq("job_seeker_id", user.id);

  const trackRecords = (tracks as LearningTrackCard[] | null) ?? [];
  const progressRecords = (progress as DashboardProgress[] | null) ?? [];
  const progressMap = new Map(progressRecords.map((entry) => [entry.lesson_id, entry]));
  const dashboardStats = computeDashboardStats(
    trackRecords,
    progressRecords,
    new Date()
  );
  const sortedTracks = trackRecords
    .map((track) => ({
      track,
      summary: computeTrackSummary(track, progressMap, new Date().toISOString()),
    }))
    .sort((a, b) => {
      if (b.summary.dueReviewCount !== a.summary.dueReviewCount) {
        return b.summary.dueReviewCount - a.summary.dueReviewCount;
      }

      const aMastery = a.summary.masteryAverage ?? 999;
      const bMastery = b.summary.masteryAverage ?? 999;
      if (aMastery !== bMastery) {
        return aMastery - bMastery;
      }

      return (a.track.sort_order as number) - (b.track.sort_order as number);
    });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Learning</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/portal/learning/review"
            className="text-sm text-violet-600 hover:text-violet-800"
          >
            Review Queue
          </Link>
          <Link
            href="/portal/learning/bookmarks"
            className="text-sm text-violet-600 hover:text-violet-800 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            Bookmarks
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-6 gap-3 sm:gap-4 mb-6">
        <StatCard label="Tracks" value={dashboardStats.totalTracks} />
        <StatCard
          label="Completed"
          value={`${dashboardStats.completedLessons}/${dashboardStats.totalLessons}`}
          sub={
            dashboardStats.totalLessons > 0
              ? `${dashboardStats.completionPercentage}%`
              : undefined
          }
        />
        <StatCard
          label="Time Spent"
          value={dashboardStats.totalTimeSeconds >= 3600
            ? `${Math.floor(dashboardStats.totalTimeSeconds / 3600)}h ${Math.floor((dashboardStats.totalTimeSeconds % 3600) / 60)}m`
            : `${Math.floor(dashboardStats.totalTimeSeconds / 60)}m`
          }
        />
        <StatCard
          label="Streak"
          value={`${dashboardStats.streakDays} day${dashboardStats.streakDays !== 1 ? "s" : ""}`}
        />
        <StatCard
          label="Due Review"
          value={dashboardStats.dueReviewCount}
          sub={dashboardStats.dueReviewCount > 0 ? "Needs refresh now" : "Nothing overdue"}
        />
        <StatCard
          label="Mastery Avg"
          value={
            dashboardStats.masteryAverage !== null
              ? `${dashboardStats.masteryAverage}%`
              : "N/A"
          }
          sub={
            dashboardStats.weakSkills.length > 0
              ? dashboardStats.weakSkills
                  .slice(0, 2)
                  .map((skill) => skill.skill)
                  .join(", ")
              : "No weak skills yet"
          }
        />
      </div>

      {/* Tracks */}
      {sortedTracks.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 mb-2">No learning tracks yet.</p>
          <p className="text-sm text-gray-400">
            Your account manager will create learning tracks for you.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedTracks.map(({ track, summary }) => {
            const lessons = track.learning_lessons ?? [];
            const jobPost = track.job_posts;

            return (
              <Link
                key={track.id}
                href={`/portal/learning/${track.id}`}
                className="block bg-white rounded-lg shadow p-4 sm:p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-gray-900 truncate">
                      {track.title}
                    </h2>
                    {track.description && (
                      <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
                        {track.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-gray-400 px-2 py-0.5 bg-gray-100 rounded">
                        {track.category}
                      </span>
                      {track.target_skill && (
                        <span className="text-xs text-violet-600 px-2 py-0.5 bg-violet-50 rounded">
                          {track.target_skill}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        {lessons.length} lesson{lessons.length !== 1 ? "s" : ""}
                      </span>
                      {summary.dueReviewCount > 0 && (
                        <span className="text-xs text-amber-700 px-2 py-0.5 bg-amber-50 rounded">
                          {summary.dueReviewCount} due review
                          {summary.dueReviewCount !== 1 ? "s" : ""}
                        </span>
                      )}
                      {summary.masteryAverage !== null && (
                        <span className="text-xs text-emerald-700 px-2 py-0.5 bg-emerald-50 rounded">
                          Mastery {summary.masteryAverage}%
                        </span>
                      )}
                      {jobPost && (
                        <span className="text-xs text-gray-400 truncate max-w-[150px]">
                          {jobPost.title}
                        </span>
                      )}
                      {summary.weakSkills.length > 0 && (
                        <span className="text-xs text-gray-500 truncate max-w-[220px]">
                          Weak: {summary.weakSkills.map((skill) => skill.skill).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-bold text-gray-900 flex-shrink-0">
                    {summary.percentage}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-violet-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${summary.percentage}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {summary.completedLessons} of {summary.totalLessons} lessons completed
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-3 sm:p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-lg sm:text-xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-violet-600 mt-0.5">{sub}</p>}
    </div>
  );
}
