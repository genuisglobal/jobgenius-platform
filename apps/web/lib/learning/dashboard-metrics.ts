export type DashboardLesson = {
  id: string;
  estimated_minutes?: number | null;
  skill_slug?: string | null;
};

export type DashboardTrack = {
  id: string;
  creation_mode?: string | null;
  learning_lessons?: DashboardLesson[] | null;
};

export type DashboardProgress = {
  lesson_id: string;
  status: string;
  completed_at?: string | null;
  time_spent_seconds?: number | null;
  mastery_score?: number | null;
  next_review_at?: string | null;
};

export type WeakSkillSummary = {
  skill: string;
  count: number;
};

export type TrackSummary = {
  totalLessons: number;
  completedLessons: number;
  percentage: number;
  dueReviewCount: number;
  masteryAverage: number | null;
  weakSkills: WeakSkillSummary[];
};

export type DashboardStats = {
  totalTracks: number;
  totalLessons: number;
  completedLessons: number;
  completionPercentage: number;
  totalTimeSeconds: number;
  streakDays: number;
  dueReviewCount: number;
  masteryAverage: number | null;
  weakSkills: WeakSkillSummary[];
};

const ADAPTIVE_MODES = new Set(["job_gap_refresh", "manual_skill_refresh"]);

function normalizeDay(value: string) {
  return new Date(value).toISOString().split("T")[0];
}

export function isDueReview(
  nextReviewAt: string | null | undefined,
  nowIso = new Date().toISOString()
) {
  return Boolean(nextReviewAt && nextReviewAt <= nowIso);
}

export function calculateLearningStreak(
  progress: DashboardProgress[],
  now = new Date()
) {
  const completedDates = progress
    .filter((record) => record.status === "completed" && record.completed_at)
    .map((record) => normalizeDay(record.completed_at as string))
    .sort()
    .reverse();

  const seenDates: Record<string, boolean> = {};
  const uniqueDates = completedDates.filter((date) => {
    if (seenDates[date]) {
      return false;
    }

    seenDates[date] = true;
    return true;
  });

  let streak = 0;

  for (let index = 0; index < uniqueDates.length; index += 1) {
    const expectedDate = new Date(now);
    expectedDate.setDate(expectedDate.getDate() - index);
    const expected = normalizeDay(expectedDate.toISOString());

    if (uniqueDates[index] === expected) {
      streak += 1;
      continue;
    }

    if (index === 0) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      if (uniqueDates[0] === normalizeDay(yesterday.toISOString())) {
        streak = 1;
      }
    }

    break;
  }

  return streak;
}

function prettifySkill(skillSlug: string) {
  return skillSlug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getWeakSkillWeight(
  lesson: DashboardLesson,
  track: DashboardTrack,
  progress: DashboardProgress | null | undefined,
  nowIso: string
) {
  if (!lesson.skill_slug) {
    return 0;
  }

  let weight = 0;

  if (!progress) {
    return ADAPTIVE_MODES.has(track.creation_mode ?? "") ? 1 : 0;
  }

  if (isDueReview(progress.next_review_at, nowIso)) {
    weight += 2;
  }

  if (
    typeof progress.mastery_score === "number" &&
    progress.mastery_score > 0 &&
    progress.mastery_score < 70
  ) {
    weight += 2;
  }

  if (progress.status !== "completed") {
    weight += 1;
  }

  return weight;
}

export function summarizeWeakSkills(
  tracks: DashboardTrack[],
  progressMap: Map<string, DashboardProgress>,
  nowIso = new Date().toISOString(),
  limit = 3
) {
  const counts = new Map<string, number>();

  for (const track of tracks) {
    for (const lesson of track.learning_lessons ?? []) {
      if (!lesson.skill_slug) {
        continue;
      }

      const weight = getWeakSkillWeight(
        lesson,
        track,
        progressMap.get(lesson.id),
        nowIso
      );

      if (weight <= 0) {
        continue;
      }

      counts.set(lesson.skill_slug, (counts.get(lesson.skill_slug) ?? 0) + weight);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([skill, count]) => ({
      skill: prettifySkill(skill),
      count,
    }));
}

export function computeTrackSummary(
  track: DashboardTrack,
  progressMap: Map<string, DashboardProgress>,
  nowIso = new Date().toISOString()
): TrackSummary {
  const lessons = track.learning_lessons ?? [];
  const assessedScores: number[] = [];
  let completedLessons = 0;
  let dueReviewCount = 0;

  for (const lesson of lessons) {
    const progress = progressMap.get(lesson.id);

    if (progress?.status === "completed") {
      completedLessons += 1;
    }

    if (isDueReview(progress?.next_review_at, nowIso)) {
      dueReviewCount += 1;
    }

    if (
      typeof progress?.mastery_score === "number" &&
      progress.mastery_score > 0
    ) {
      assessedScores.push(progress.mastery_score);
    }
  }

  return {
    totalLessons: lessons.length,
    completedLessons,
    percentage:
      lessons.length > 0
        ? Math.round((completedLessons / lessons.length) * 100)
        : 0,
    dueReviewCount,
    masteryAverage:
      assessedScores.length > 0
        ? Math.round(
            assessedScores.reduce((sum, score) => sum + score, 0) /
              assessedScores.length
          )
        : null,
    weakSkills: summarizeWeakSkills([track], progressMap, nowIso, 3),
  };
}

export function computeDashboardStats(
  tracks: DashboardTrack[],
  progress: DashboardProgress[],
  now = new Date()
): DashboardStats {
  const progressMap = new Map(progress.map((record) => [record.lesson_id, record]));
  const nowIso = now.toISOString();
  const allLessons = tracks.flatMap((track) => track.learning_lessons ?? []);
  const completedLessons = allLessons.filter(
    (lesson) => progressMap.get(lesson.id)?.status === "completed"
  ).length;
  const totalTimeSeconds = progress.reduce(
    (sum, record) => sum + (record.time_spent_seconds ?? 0),
    0
  );
  const assessedScores = progress
    .map((record) => record.mastery_score)
    .filter((score): score is number => typeof score === "number" && score > 0);
  const dueReviewCount = progress.filter((record) =>
    isDueReview(record.next_review_at, nowIso)
  ).length;

  return {
    totalTracks: tracks.length,
    totalLessons: allLessons.length,
    completedLessons,
    completionPercentage:
      allLessons.length > 0
        ? Math.round((completedLessons / allLessons.length) * 100)
        : 0,
    totalTimeSeconds,
    streakDays: calculateLearningStreak(progress, now),
    dueReviewCount,
    masteryAverage:
      assessedScores.length > 0
        ? Math.round(
            assessedScores.reduce((sum, score) => sum + score, 0) /
              assessedScores.length
          )
        : null,
    weakSkills: summarizeWeakSkills(tracks, progressMap, nowIso, 5),
  };
}
