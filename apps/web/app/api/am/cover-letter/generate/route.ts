import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import { generateCoverLetter } from "@/lib/cover-letter";

export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    job_seeker_id?: unknown;
    job_post_id?: unknown;
    recruiter_name?: unknown;
    tone?: unknown;
    guidance?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const seekerId = typeof body.job_seeker_id === "string" ? body.job_seeker_id : "";
  const jobPostId = typeof body.job_post_id === "string" ? body.job_post_id : "";
  if (!seekerId || !jobPostId) {
    return NextResponse.json(
      { error: "job_seeker_id and job_post_id are required." },
      { status: 400 }
    );
  }

  const allowed = await hasJobSeekerAccess(auth.user.id, seekerId);
  if (!allowed) {
    return NextResponse.json({ error: "Not authorized for this seeker." }, { status: 403 });
  }

  const [{ data: seeker }, { data: jobPost }] = await Promise.all([
    supabaseAdmin
      .from("job_seekers")
      .select("id, full_name, email, bio, skills, work_history, education, seniority")
      .eq("id", seekerId)
      .maybeSingle(),
    supabaseAdmin
      .from("job_posts")
      .select("id, title, company, description_text, location")
      .eq("id", jobPostId)
      .maybeSingle(),
  ]);

  if (!seeker) {
    return NextResponse.json({ error: "Seeker not found." }, { status: 404 });
  }
  if (!jobPost) {
    return NextResponse.json({ error: "Job post not found." }, { status: 404 });
  }

  const tone =
    body.tone === "warm" || body.tone === "enthusiastic" || body.tone === "professional"
      ? body.tone
      : "professional";

  const result = await generateCoverLetter({
    seeker,
    jobPost,
    recruiterName: typeof body.recruiter_name === "string" ? body.recruiter_name : null,
    tone,
    amId: auth.user.id,
    guidance: typeof body.guidance === "string" ? body.guidance : null,
  });

  if (!result) {
    return NextResponse.json(
      { error: "Generation failed (LLM unavailable or error)." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    ai_output_id: result.aiOutputId,
    subject: result.draft.subject,
    body: result.draft.body,
  });
}
