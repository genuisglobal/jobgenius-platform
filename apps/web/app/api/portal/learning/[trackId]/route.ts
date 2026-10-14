import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";
import {
  computeTrackSummary,
  isDueReview,
  type DashboardLesson,
  type DashboardProgress,
} from "@/lib/learning/dashboard-metrics";

type TrackLesson = DashboardLesson & {
  sort_order?: number | null;
  [key: string]: unknown;
};

export async function GET(
  request: Request,
  { params }: { params: { trackId: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Get the track with lessons
  const { data: track, error } = await supabaseAdmin
    .from("learning_tracks")
    .select(`
      *,
      job_posts ( id, title, company ),
      learning_lessons ( * )
    `)
    .eq("id", params.trackId)
    .eq("job_seeker_id", auth.user.id)
    .eq("status", "published")
    .single();

  if (error || !track) {
    return Response.json({ error: "Track not found." }, { status: 404 });
  }

  // Get progress for all lessons in this track
  const lessonIds = ((track.learning_lessons as { id: string }[]) ?? []).map((l) => l.id);

  let progress: (DashboardProgress & {
    started_at: string | null;
    quiz_score: number | null;
  })[] = [];
  if (lessonIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("learning_progress")
      .select("*")
      .eq("job_seeker_id", auth.user.id)
      .in("lesson_id", lessonIds);
    progress = data ?? [];
  }

  // Get bookmarks
  let bookmarks: { lesson_id: string; note: string | null }[] = [];
  if (lessonIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("learning_bookmarks")
      .select("lesson_id, note")
      .eq("job_seeker_id", auth.user.id)
      .in("lesson_id", lessonIds);
    bookmarks = data ?? [];
  }

  const progressMap = new Map(progress.map((p) => [p.lesson_id, p]));
  const bookmarkSet = new Set(bookmarks.map((b) => b.lesson_id));

  // Sort lessons by sort_order
  const lessons = ((track.learning_lessons as TrackLesson[]) ?? [])
    .sort((a, b) => ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0))
    .map((lesson) => ({
      ...lesson,
      progress: progressMap.get(lesson.id) ?? null,
      is_bookmarked: bookmarkSet.has(lesson.id),
      is_due_for_review: isDueReview(progressMap.get(lesson.id)?.next_review_at ?? null),
    }));
  const summary = computeTrackSummary(
    {
      id: track.id,
      creation_mode: track.creation_mode,
      learning_lessons: lessons.map((lesson) => ({
        id: lesson.id,
        skill_slug: typeof lesson.skill_slug === "string" ? lesson.skill_slug : null,
      })),
    },
    progressMap
  );

  return Response.json({
    track: {
      ...track,
      learning_lessons: lessons,
      progress: {
        total_lessons: summary.totalLessons,
        completed_lessons: summary.completedLessons,
        percentage: summary.percentage,
        due_review_count: summary.dueReviewCount,
        mastery_average: summary.masteryAverage,
        weak_skills: summary.weakSkills,
      },
    },
  });
}
