import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";
import { generateQuizQuestions } from "@/lib/portal/ai-quiz-generator";
import { submitAiOutput, markPublished } from "@/lib/ai-outputs";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { data: quizzes, error } = await supabaseAdmin
    .from("interview_quizzes")
    .select("id, title, quiz_type, total_questions, correct_count, score, status, started_at, completed_at, created_at")
    .eq("interview_prep_id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: "Failed to fetch quizzes." }, { status: 500 });
  }

  return Response.json({ quizzes: quizzes ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Verify prep ownership
  const { data: prep } = await supabaseAdmin
    .from("interview_prep")
    .select("id, content, job_post_id")
    .eq("id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .single();

  if (!prep) {
    return Response.json({ error: "Interview prep not found." }, { status: 404 });
  }

  let body: { quiz_type?: string; count?: number } = {};
  try {
    body = await request.json();
  } catch {
    // defaults
  }

  const validTypes = ["technical", "behavioral", "company", "general"];
  const quizType = validTypes.includes(body.quiz_type ?? "") ? body.quiz_type! : "general";
  const count = Math.min(Math.max(body.count ?? 10, 5), 20);

  // Get job post details
  let jobTitle = "Position";
  let companyName: string | null = null;
  let descriptionText: string | null = null;

  if (prep.job_post_id) {
    const { data: jobPost } = await supabaseAdmin
      .from("job_posts")
      .select("title, company, description_text")
      .eq("id", prep.job_post_id)
      .single();

    if (jobPost) {
      jobTitle = jobPost.title;
      companyName = jobPost.company;
      descriptionText = jobPost.description_text;
    }
  }

  const prepContent = prep.content as Record<string, unknown>;
  const prepSummary = [
    prepContent?.role_summary,
    ...(Array.isArray(prepContent?.technical_topics) ? prepContent.technical_topics : []),
  ]
    .filter(Boolean)
    .join(". ")
    .slice(0, 1000);

  const questions = await generateQuizQuestions({
    jobTitle,
    companyName,
    descriptionText,
    quizType,
    prepContentSummary: prepSummary || null,
    count,
  });

  const title = `${quizType.charAt(0).toUpperCase() + quizType.slice(1)} Quiz — ${new Date().toLocaleDateString()}`;

  // Shadow audit log; auto-approved to preserve current UX.
  const audit = await submitAiOutput({
    kind: "quiz_card",
    payload: { questions, title, quizType, jobTitle, companyName, count: questions.length },
    refType: "interview_prep",
    refId: params.id,
    seekerId: auth.user.id,
    createdBy: auth.user.id,
    autoApprove: true,
  });

  const { data: quiz, error } = await supabaseAdmin
    .from("interview_quizzes")
    .insert({
      interview_prep_id: params.id,
      job_seeker_id: auth.user.id,
      title,
      quiz_type: quizType,
      questions,
      total_questions: questions.length,
      status: "not_started",
    })
    .select("*")
    .single();

  if (error) {
    return Response.json({ error: "Failed to create quiz." }, { status: 500 });
  }

  void markPublished(audit.id, { refType: "interview_quizzes", refId: quiz.id });

  return Response.json({ quiz }, { status: 201 });
}
