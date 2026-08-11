import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";
import {
  computeDashboardStats,
  type DashboardProgress,
  type DashboardTrack,
} from "@/lib/learning/dashboard-metrics";

export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Get all progress records for this seeker
  const { data: progress } = await supabaseAdmin
    .from("learning_progress")
    .select("lesson_id, status, completed_at, time_spent_seconds, mastery_score, next_review_at")
    .eq("job_seeker_id", auth.user.id);

  // Get total tracks assigned
  const { data: tracks } = await supabaseAdmin
    .from("learning_tracks")
    .select("id, creation_mode, learning_lessons ( id, skill_slug )")
    .eq("job_seeker_id", auth.user.id)
    .eq("status", "published");

  const stats = computeDashboardStats(
    (tracks as DashboardTrack[] | null) ?? [],
    (progress as DashboardProgress[] | null) ?? [],
    new Date()
  );

  // This week stats
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoIso = weekAgo.toISOString();

  const thisWeekCompleted = (progress ?? []).filter(
    (r) => r.completed_at && r.completed_at > weekAgoIso
  );

  return Response.json({
    stats: {
      total_tracks: stats.totalTracks,
      total_lessons: stats.totalLessons,
      completed_lessons: stats.completedLessons,
      completion_percentage: stats.completionPercentage,
      total_time_seconds: stats.totalTimeSeconds,
      streak_days: stats.streakDays,
      due_review_count: stats.dueReviewCount,
      mastery_average: stats.masteryAverage,
      weak_skills: stats.weakSkills,
      lessons_this_week: thisWeekCompleted.length,
    },
  });
}
