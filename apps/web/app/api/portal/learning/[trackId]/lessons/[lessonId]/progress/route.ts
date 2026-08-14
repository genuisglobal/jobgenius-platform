import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";
import { computeReviewSchedule } from "@/lib/learning/assessment";

export async function PATCH(
  request: Request,
  { params }: { params: { trackId: string; lessonId: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Verify lesson belongs to seeker's published track
  const { data: lesson } = await supabaseAdmin
    .from("learning_lessons")
    .select("id, track_id, content_type")
    .eq("id", params.lessonId)
    .eq("track_id", params.trackId)
    .single();

  if (!lesson) {
    return Response.json({ error: "Lesson not found." }, { status: 404 });
  }

  const { data: track } = await supabaseAdmin
    .from("learning_tracks")
    .select("id")
    .eq("id", params.trackId)
    .eq("job_seeker_id", auth.user.id)
    .eq("status", "published")
    .single();

  if (!track) {
    return Response.json({ error: "Track not found." }, { status: 404 });
  }

  let body: { status?: string; time_spent_seconds?: number; quiz_score?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const validStatuses = ["not_started", "in_progress", "completed"];
  const newStatus = validStatuses.includes(body.status ?? "") ? body.status : undefined;
  const isQuizLesson = lesson.content_type === "quiz";

  if (isQuizLesson && newStatus === "completed" && body.quiz_score === undefined) {
    return Response.json(
      { error: "Quiz lessons require a quiz_score before they can be completed." },
      { status: 400 }
    );
  }

  // Check for existing progress
  const { data: existing } = await supabaseAdmin
    .from("learning_progress")
    .select("*")
    .eq("job_seeker_id", auth.user.id)
    .eq("lesson_id", params.lessonId)
    .maybeSingle();

  const now = new Date().toISOString();

  if (existing) {
    const updates: Record<string, unknown> = {};
    if (newStatus) updates.status = newStatus;
    if (newStatus === "in_progress" && !existing.started_at) updates.started_at = now;
    if (newStatus === "completed") updates.completed_at = now;
    if (body.time_spent_seconds !== undefined) {
      updates.time_spent_seconds = (existing.time_spent_seconds ?? 0) + body.time_spent_seconds;
    }
    if (body.quiz_score !== undefined) {
      const review = computeReviewSchedule(body.quiz_score, existing.review_stage ?? 0, new Date(now));
      updates.quiz_score = body.quiz_score;
      updates.mastery_score = review.masteryScore;
      updates.attempt_count = (existing.attempt_count ?? 0) + 1;
      if (!existing.started_at) updates.started_at = now;
      updates.last_assessed_at = now;
      updates.review_stage = review.reviewStage;
      updates.next_review_at = review.nextReviewAt;

      if (body.quiz_score >= 70) {
        updates.status = "completed";
        updates.completed_at = now;
      } else if (isQuizLesson) {
        updates.status = "in_progress";
        updates.completed_at = null;
      }
    }

    const { data: progress, error } = await supabaseAdmin
      .from("learning_progress")
      .update(updates)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      return Response.json({ error: "Failed to update progress." }, { status: 500 });
    }

    return Response.json({ progress });
  }

  const review =
    body.quiz_score !== undefined
      ? computeReviewSchedule(body.quiz_score, 0, new Date(now))
      : null;

  // Create new progress record
  const { data: progress, error } = await supabaseAdmin
    .from("learning_progress")
    .insert({
      job_seeker_id: auth.user.id,
      lesson_id: params.lessonId,
      status:
        body.quiz_score !== undefined && isQuizLesson
          ? body.quiz_score >= 70
            ? "completed"
            : "in_progress"
          : newStatus ?? "in_progress",
      started_at: now,
      completed_at:
        body.quiz_score !== undefined && isQuizLesson
          ? body.quiz_score >= 70
            ? now
            : null
          : newStatus === "completed"
          ? now
          : null,
      time_spent_seconds: body.time_spent_seconds ?? 0,
      quiz_score: body.quiz_score ?? null,
      mastery_score: review?.masteryScore ?? 0,
      attempt_count: body.quiz_score !== undefined ? 1 : 0,
      last_assessed_at: body.quiz_score !== undefined ? now : null,
      review_stage: review?.reviewStage ?? 0,
      next_review_at: review?.nextReviewAt ?? null,
    })
    .select("*")
    .single();

  if (error) {
    return Response.json({ error: "Failed to create progress." }, { status: 500 });
  }

  return Response.json({ progress }, { status: 201 });
}
