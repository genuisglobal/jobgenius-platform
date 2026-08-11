import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { mergeAssessmentState } from "@/lib/learning/assessment";
import {
  isDueReview,
  type DashboardProgress,
  type DashboardLesson,
} from "@/lib/learning/dashboard-metrics";
import LearningTrackView from "./LearningTrackView";

type TrackLesson = DashboardLesson & {
  sort_order?: number | null;
  [key: string]: unknown;
};

export default async function TrackViewPage({
  params,
  searchParams,
}: {
  params: { trackId: string };
  searchParams?: { lessonId?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: track } = await supabaseAdmin
    .from("learning_tracks")
    .select(`
      *,
      job_posts ( id, title, company ),
      learning_lessons ( * )
    `)
    .eq("id", params.trackId)
    .eq("job_seeker_id", user.id)
    .eq("status", "published")
    .single();

  if (!track) {
    redirect("/portal/learning");
  }

  const lessonIds = ((track.learning_lessons as { id: string }[]) ?? []).map((l) => l.id);

  // Fetch progress
  let progress: DashboardProgress[] = [];
  if (lessonIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("learning_progress")
      .select("*")
      .eq("job_seeker_id", user.id)
      .in("lesson_id", lessonIds);
    progress = data ?? [];
  }

  // Fetch bookmarks
  let bookmarks: { lesson_id: string }[] = [];
  if (lessonIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("learning_bookmarks")
      .select("lesson_id")
      .eq("job_seeker_id", user.id)
      .in("lesson_id", lessonIds);
    bookmarks = data ?? [];
  }

  // Sort lessons
  const lessons = ((track.learning_lessons as TrackLesson[]) ?? []).sort(
    (a, b) => ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0)
  );

  const progressMap = new Map(
    progress.map((p) => [p.lesson_id, p])
  );
  const bookmarkSet = new Set(bookmarks.map((b) => b.lesson_id));
  const nowIso = new Date().toISOString();

  const enrichedLessons = lessons.map((l) => ({
    ...l,
    progress: progressMap.get(l.id) ?? null,
    is_bookmarked: bookmarkSet.has(l.id),
    is_due_for_review: isDueReview(
      progressMap.get(l.id)?.next_review_at ?? null,
      nowIso
    ),
  }))
    .sort((a, b) => {
      const aDue = a.is_due_for_review ? 1 : 0;
      const bDue = b.is_due_for_review ? 1 : 0;
      if (aDue !== bDue) {
        return bDue - aDue;
      }

      return ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0);
    });

  const { data: diagnostic } = await supabaseAdmin
    .from("learning_assessments")
    .select("*")
    .eq("track_id", params.trackId)
    .eq("job_seeker_id", user.id)
    .eq("assessment_type", "diagnostic")
    .is("lesson_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const serializedDiagnostic = diagnostic
    ? {
        ...diagnostic,
        questions: mergeAssessmentState(diagnostic.questions, diagnostic.answers),
      }
    : null;
  const initialLessonId =
    typeof searchParams?.lessonId === "string" ? searchParams.lessonId : null;

  let interviewPrep: {
    id: string;
    job_posts: { title: string; company: string | null } | null;
  } | null = null;

  if (track.job_post_id) {
    const { data: prep } = await supabaseAdmin
      .from("interview_prep")
      .select(`
        id,
        job_posts ( title, company )
      `)
      .eq("job_seeker_id", user.id)
      .eq("job_post_id", track.job_post_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    interviewPrep = prep
      ? {
          id: prep.id,
          job_posts: Array.isArray(prep.job_posts)
            ? prep.job_posts[0] ?? null
            : prep.job_posts ?? null,
        }
      : null;
  }

  return (
    <LearningTrackView
      track={{ ...track, learning_lessons: enrichedLessons }}
      diagnostic={serializedDiagnostic}
      initialLessonId={initialLessonId}
      interviewPrep={interviewPrep}
    />
  );
}
