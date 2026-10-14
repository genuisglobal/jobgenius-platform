import { supabaseAdmin } from "@/lib/auth";

type RawReviewTrack = {
  id: string;
  title: string;
  target_skill?: string | null;
  job_posts?:
    | { title: string; company: string | null }
    | Array<{ title: string; company: string | null }>
    | null;
};

type RawReviewLesson = {
  id: string;
  title: string;
  content_type: string;
  estimated_minutes: number | null;
  skill_slug?: string | null;
  track_id: string;
  learning_tracks: RawReviewTrack | RawReviewTrack[] | null;
};

type RawReviewProgress = {
  lesson_id: string;
  status: string;
  quiz_score?: number | null;
  mastery_score?: number | null;
  next_review_at?: string | null;
  review_stage?: number | null;
  learning_lessons: RawReviewLesson | RawReviewLesson[] | null;
};

export type ReviewQueueItem = {
  lessonId: string;
  lessonTitle: string;
  contentType: string;
  estimatedMinutes: number;
  skillSlug: string | null;
  status: string;
  quizScore: number | null;
  masteryScore: number | null;
  nextReviewAt: string | null;
  reviewStage: number;
  track: {
    id: string;
    title: string;
    targetSkill: string | null;
    jobPost: { title: string; company: string | null } | null;
  };
};

export type ReviewQueueSummary = {
  totalItems: number;
  totalTracks: number;
  masteryAverage: number | null;
};

function toSingle<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export async function getDueReviewQueue(
  jobSeekerId: string,
  nowIso = new Date().toISOString()
): Promise<{ items: ReviewQueueItem[]; summary: ReviewQueueSummary }> {
  const { data, error } = await supabaseAdmin
    .from("learning_progress")
    .select(`
      lesson_id,
      status,
      quiz_score,
      mastery_score,
      next_review_at,
      review_stage,
      learning_lessons!inner (
        id,
        title,
        content_type,
        estimated_minutes,
        skill_slug,
        track_id,
        learning_tracks!inner (
          id,
          title,
          target_skill,
          job_posts ( title, company )
        )
      )
    `)
    .eq("job_seeker_id", jobSeekerId)
    .not("next_review_at", "is", null)
    .lte("next_review_at", nowIso)
    .order("next_review_at", { ascending: true });

  if (error) {
    throw new Error("Failed to load due reviews.");
  }

  const items: ReviewQueueItem[] = (((data as unknown) as RawReviewProgress[] | null) ?? [])
    .map((record) => {
      const lesson = toSingle(record.learning_lessons);
      const track = toSingle(lesson?.learning_tracks);
      const jobPost = toSingle(track?.job_posts);

      if (!lesson || !track) {
        return null;
      }

      return {
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        contentType: lesson.content_type,
        estimatedMinutes: lesson.estimated_minutes ?? 10,
        skillSlug: lesson.skill_slug ?? null,
        status: record.status,
        quizScore: record.quiz_score ?? null,
        masteryScore: record.mastery_score ?? null,
        nextReviewAt: record.next_review_at ?? null,
        reviewStage: record.review_stage ?? 0,
        track: {
          id: track.id,
          title: track.title,
          targetSkill: track.target_skill ?? null,
          jobPost: jobPost ?? null,
        },
      };
    })
    .filter((item): item is ReviewQueueItem => Boolean(item));

  const masteryScores = items
    .map((item) => item.masteryScore)
    .filter((score): score is number => typeof score === "number");

  return {
    items,
    summary: {
      totalItems: items.length,
      totalTracks: new Set(items.map((item) => item.track.id)).size,
      masteryAverage:
        masteryScores.length > 0
          ? Math.round(
              masteryScores.reduce((sum, score) => sum + score, 0) /
                masteryScores.length
            )
          : null,
    },
  };
}
