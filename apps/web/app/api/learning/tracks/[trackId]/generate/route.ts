import { getAccountManagerFromRequest } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";
import { generateTrackLessons } from "@/lib/learning/ai-lesson-generator";

export async function POST(
  request: Request,
  { params }: { params: { trackId: string } }
) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  // Verify track ownership and get details
  const { data: track } = await supabaseServer
    .from("learning_tracks")
    .select(`
      *,
      job_seekers ( id, skills, seniority ),
      job_posts ( id, title, company, description_text )
    `)
    .eq("id", params.trackId)
    .eq("account_manager_id", amResult.accountManager.id)
    .single();

  if (!track) {
    return Response.json({ success: false, error: "Track not found." }, { status: 404 });
  }

  let body: { lesson_count?: number } = {};
  try {
    body = await request.json();
  } catch {
    // default
  }

  const lessonCount = Math.min(Math.max(body.lesson_count ?? 5, 1), 10);

  // Get seeker and job details
  const jobSeeker = track.job_seekers as { id: string; skills: string[] | null; seniority: string | null } | null;
  const jobPost = track.job_posts as {
    id: string;
    title: string;
    company: string | null;
    description_text: string | null;
  } | null;

  // Get existing lesson count for sort order offset
  const { data: existingLessons } = await supabaseServer
    .from("learning_lessons")
    .select("sort_order")
    .eq("track_id", params.trackId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const sortOffset = existingLessons?.[0]?.sort_order != null
    ? existingLessons[0].sort_order + 1
    : 0;

  const lessons = await generateTrackLessons({
    trackTitle: track.title,
    category: track.category,
    lessonCount,
    creationMode: track.creation_mode,
    targetSkill: track.target_skill,
    focusSkills: Array.isArray(track.focus_skills) ? (track.focus_skills as string[]) : null,
    jobTitle: jobPost?.title,
    company: jobPost?.company,
    jobDescription: jobPost?.description_text,
    skills: jobSeeker?.skills,
    seniority: jobSeeker?.seniority,
  });

  // Insert generated lessons
  const inserts = lessons.map((lesson, i) => ({
    track_id: params.trackId,
    title: lesson.title,
    content_type: lesson.content_type,
    content: lesson.content,
    sort_order: sortOffset + i,
    estimated_minutes: lesson.estimated_minutes,
    skill_slug: lesson.skill_slug,
    learning_objective: lesson.learning_objective,
    difficulty: lesson.difficulty,
    is_ai_generated: true,
  }));

  const { data: inserted, error } = await supabaseServer
    .from("learning_lessons")
    .insert(inserts)
    .select("*");

  if (error) {
    return Response.json(
      { success: false, error: "Failed to save generated lessons." },
      { status: 500 }
    );
  }

  // Update track timestamp
  await supabaseServer
    .from("learning_tracks")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", params.trackId);

  return Response.json({ success: true, lessons: inserted ?? [] }, { status: 201 });
}
