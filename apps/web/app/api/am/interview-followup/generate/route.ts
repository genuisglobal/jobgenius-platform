import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import { generateInterviewFollowup } from "@/lib/interview-followup";

export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    interview_id?: unknown;
    guidance?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const interviewId = typeof body.interview_id === "string" ? body.interview_id : "";
  if (!interviewId) {
    return NextResponse.json({ error: "interview_id is required." }, { status: 400 });
  }

  const { data: interview } = await supabaseAdmin
    .from("interviews")
    .select("id, job_seeker_id, company, role, scheduled_at, interviewer_name, notes")
    .eq("id", interviewId)
    .maybeSingle();

  if (!interview) {
    return NextResponse.json({ error: "Interview not found." }, { status: 404 });
  }

  const allowed = await hasJobSeekerAccess(auth.user.id, interview.job_seeker_id);
  if (!allowed) {
    return NextResponse.json({ error: "Not authorized for this seeker." }, { status: 403 });
  }

  const { data: seeker } = await supabaseAdmin
    .from("job_seekers")
    .select("id, full_name, email, skills")
    .eq("id", interview.job_seeker_id)
    .maybeSingle();

  if (!seeker) {
    return NextResponse.json({ error: "Seeker not found." }, { status: 404 });
  }

  const result = await generateInterviewFollowup({
    interview: {
      id: interview.id,
      interviewer_name: interview.interviewer_name ?? null,
      company: interview.company ?? null,
      role: interview.role ?? null,
      scheduled_at: interview.scheduled_at ?? null,
      notes: interview.notes ?? null,
    },
    seeker,
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
