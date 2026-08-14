import { requireJobSeeker, supabaseAdmin } from "@/lib/auth";
import {
  buildEmptyAssessmentAnswers,
  mergeAssessmentState,
  scoreAssessment,
} from "@/lib/learning/assessment";
import { generateQuizQuestions } from "@/lib/portal/ai-quiz-generator";
import { submitAiOutput, markPublished } from "@/lib/ai-outputs";

function mapTrackCategoryToQuizType(category: string | null | undefined) {
  switch (category) {
    case "technical":
    case "tools":
      return "technical";
    case "behavioral":
      return "behavioral";
    default:
      return "general";
  }
}

function serializeAssessment(
  assessment: Record<string, unknown> | null | undefined
) {
  if (!assessment) {
    return null;
  }

  const questions = mergeAssessmentState(assessment.questions, assessment.answers);
  return {
    ...assessment,
    questions,
    total_questions: questions.length,
  };
}

async function getTrackForUser(trackId: string, jobSeekerId: string) {
  const { data: track } = await supabaseAdmin
    .from("learning_tracks")
    .select(`
      *,
      job_posts ( id, title, company, description_text )
    `)
    .eq("id", trackId)
    .eq("job_seeker_id", jobSeekerId)
    .eq("status", "published")
    .single();

  return track;
}

export async function GET(
  request: Request,
  { params }: { params: { trackId: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const track = await getTrackForUser(params.trackId, auth.user.id);
  if (!track) {
    return Response.json({ error: "Track not found." }, { status: 404 });
  }

  const { data: assessment } = await supabaseAdmin
    .from("learning_assessments")
    .select("*")
    .eq("track_id", params.trackId)
    .eq("job_seeker_id", auth.user.id)
    .eq("assessment_type", "diagnostic")
    .is("lesson_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return Response.json({
    diagnostic: serializeAssessment(assessment as Record<string, unknown> | null | undefined),
  });
}

export async function POST(
  request: Request,
  { params }: { params: { trackId: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const track = await getTrackForUser(params.trackId, auth.user.id);
  if (!track) {
    return Response.json({ error: "Track not found." }, { status: 404 });
  }

  let body: { restart?: boolean; count?: number } = {};
  try {
    body = await request.json();
  } catch {
    // defaults
  }

  if (!body.restart) {
    const { data: existing } = await supabaseAdmin
      .from("learning_assessments")
      .select("*")
      .eq("track_id", params.trackId)
      .eq("job_seeker_id", auth.user.id)
      .eq("assessment_type", "diagnostic")
      .is("lesson_id", null)
      .in("status", ["not_started", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      if (existing.status === "not_started") {
        const { data: resumed } = await supabaseAdmin
          .from("learning_assessments")
          .update({
            status: "in_progress",
            started_at: existing.started_at ?? new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select("*")
          .maybeSingle();

        return Response.json({
          diagnostic: serializeAssessment(
            (resumed ?? existing) as Record<string, unknown>
          ),
        });
      }

      return Response.json({
        diagnostic: serializeAssessment(existing as Record<string, unknown>),
      });
    }
  }

  const count = Math.min(Math.max(body.count ?? 5, 3), 10);
  const jobPost = Array.isArray(track.job_posts) ? track.job_posts[0] : track.job_posts;
  const quizType = mapTrackCategoryToQuizType(track.category as string | null | undefined);
  const targetSkill = typeof track.target_skill === "string" ? track.target_skill : null;
  const focusSkills = Array.isArray(track.focus_skills)
    ? (track.focus_skills as string[]).filter((skill): skill is string => typeof skill === "string")
    : [];
  const prepContentSummary = [
    targetSkill,
    ...focusSkills,
    typeof track.description === "string" ? track.description : null,
  ]
    .filter(Boolean)
    .join(". ")
    .slice(0, 1000);

  const questions = await generateQuizQuestions({
    jobTitle:
      (typeof jobPost?.title === "string" ? jobPost.title : null) ||
      targetSkill ||
      (track.title as string) ||
      "Skill Refresh",
    companyName: typeof jobPost?.company === "string" ? jobPost.company : null,
    descriptionText:
      (typeof jobPost?.description_text === "string" ? jobPost.description_text : null) ||
      (typeof track.description === "string" ? track.description : null),
    quizType,
    prepContentSummary: prepContentSummary || null,
    count,
  });

  const titleTarget = targetSkill || (typeof track.title === "string" ? track.title : "Learning Track");
  const now = new Date().toISOString();

  // Shadow audit log; auto-approved to preserve current UX.
  const audit = await submitAiOutput({
    kind: "lesson",
    payload: {
      questions,
      title: `Diagnostic: ${titleTarget}`,
      quizType,
      targetSkill,
      focusSkills,
      count: questions.length,
    },
    refType: "learning_tracks",
    refId: params.trackId,
    seekerId: auth.user.id,
    createdBy: auth.user.id,
    autoApprove: true,
  });

  const { data: assessment, error } = await supabaseAdmin
    .from("learning_assessments")
    .insert({
      track_id: params.trackId,
      job_seeker_id: auth.user.id,
      assessment_type: "diagnostic",
      skill_slug: typeof track.target_skill_slug === "string" ? track.target_skill_slug : null,
      title: `Diagnostic: ${titleTarget}`,
      prompt: prepContentSummary || null,
      questions,
      answers: buildEmptyAssessmentAnswers(questions),
      status: "in_progress",
      started_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error || !assessment) {
    return Response.json({ error: "Failed to create diagnostic." }, { status: 500 });
  }

  void markPublished(audit.id, {
    refType: "learning_assessments",
    refId: assessment.id,
  });

  return Response.json(
    { diagnostic: serializeAssessment(assessment as Record<string, unknown>) },
    { status: 201 }
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: { trackId: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const track = await getTrackForUser(params.trackId, auth.user.id);
  if (!track) {
    return Response.json({ error: "Track not found." }, { status: 404 });
  }

  let body: { assessment_id?: string; answers?: Array<number | null> } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.assessment_id) {
    return Response.json({ error: "assessment_id is required." }, { status: 400 });
  }

  const { data: assessment } = await supabaseAdmin
    .from("learning_assessments")
    .select("*")
    .eq("id", body.assessment_id)
    .eq("track_id", params.trackId)
    .eq("job_seeker_id", auth.user.id)
    .eq("assessment_type", "diagnostic")
    .is("lesson_id", null)
    .single();

  if (!assessment) {
    return Response.json({ error: "Diagnostic not found." }, { status: 404 });
  }

  const now = new Date().toISOString();
  const result = scoreAssessment(assessment.questions, body.answers ?? [], now);

  const updates: Record<string, unknown> = {
    questions: result.questions,
    answers: result.answers,
    started_at: assessment.started_at ?? now,
    updated_at: now,
    status: result.completed ? "completed" : "in_progress",
    score: result.completed ? result.score : null,
    completed_at: result.completed ? now : null,
  };

  const { data: updated, error } = await supabaseAdmin
    .from("learning_assessments")
    .update(updates)
    .eq("id", body.assessment_id)
    .select("*")
    .single();

  if (error || !updated) {
    return Response.json({ error: "Failed to submit diagnostic." }, { status: 500 });
  }

  return Response.json({
    diagnostic: serializeAssessment(updated as Record<string, unknown>),
  });
}
