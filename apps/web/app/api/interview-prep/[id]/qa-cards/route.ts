import { getAccountManagerFromRequest, hasJobSeekerAccess } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";
import { generateQACards } from "@/lib/portal/ai-qa-generator";
import { submitAiOutput, markPublished } from "@/lib/ai-outputs";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  // Get prep and verify AM access
  const { data: prep } = await supabaseServer
    .from("interview_prep")
    .select("id, job_seeker_id, job_post_id")
    .eq("id", params.id)
    .single();

  if (!prep) {
    return Response.json({ success: false, error: "Interview prep not found." }, { status: 404 });
  }

  const hasAccess = await hasJobSeekerAccess(amResult.accountManager.id, prep.job_seeker_id);
  if (!hasAccess) {
    return Response.json(
      { success: false, error: "Not authorized for this job seeker." },
      { status: 403 }
    );
  }

  let body: { count?: number; category?: string } = {};
  try {
    body = await request.json();
  } catch {
    // defaults
  }

  const validCategories = ["behavioral", "technical", "situational", "company", "general"];
  const category = validCategories.includes(body.category ?? "") ? body.category! : "general";
  const count = Math.min(Math.max(body.count ?? 8, 1), 20);

  // Get job post and seeker details
  let jobTitle = "Position";
  let companyName: string | null = null;
  let descriptionText: string | null = null;

  if (prep.job_post_id) {
    const { data: jobPost } = await supabaseServer
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

  const { data: seeker } = await supabaseServer
    .from("job_seekers")
    .select("skills, seniority")
    .eq("id", prep.job_seeker_id)
    .single();

  const cards = await generateQACards({
    jobTitle,
    companyName,
    descriptionText,
    category,
    seekerSkills: seeker?.skills,
    seniority: seeker?.seniority,
    count,
  });

  // Get current max sort_order
  const { data: lastCard } = await supabaseServer
    .from("interview_qa_cards")
    .select("sort_order")
    .eq("interview_prep_id", params.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOffset = (lastCard?.sort_order ?? -1) + 1;

  const inserts = cards.map((card, i) => ({
    interview_prep_id: params.id,
    category: card.category,
    question: card.question,
    model_answer: card.model_answer,
    key_points: card.key_points,
    tips: card.tips,
    difficulty: card.difficulty,
    sort_order: sortOffset + i,
    is_ai_generated: true,
  }));

  // Shadow log: record what the LLM produced before we persist downstream.
  // autoApprove preserves current UX (QA cards still publish immediately);
  // the ai_outputs row gives us an audit trail and lets a follow-up flip
  // this kind to pending review without further refactoring.
  const audit = await submitAiOutput({
    kind: "qa_card",
    payload: { cards, category, count, jobTitle, companyName },
    refType: "interview_prep",
    refId: params.id,
    seekerId: prep.job_seeker_id,
    amId: amResult.accountManager.id,
    createdBy: amResult.accountManager.id,
    autoApprove: true,
  });

  const { data: inserted, error } = await supabaseServer
    .from("interview_qa_cards")
    .insert(inserts)
    .select("*");

  if (error) {
    return Response.json(
      { success: false, error: "Failed to save Q&A cards." },
      { status: 500 }
    );
  }

  // Close the loop now that downstream rows exist.
  void markPublished(audit.id, { refType: "interview_prep", refId: params.id });

  return Response.json({ success: true, cards: inserted ?? [] }, { status: 201 });
}
