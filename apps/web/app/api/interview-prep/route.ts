import { buildInterviewPrepContent } from "@/lib/interview-prep";
import { buildInterviewPrepContentWithAI } from "@/lib/interview-prep-ai";
import { isOpenAIConfigured } from "@/lib/openai";
import { getAccountManagerFromRequest, requireAMAccessToSeeker } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

type PrepPayload = {
  job_seeker_id?: string;
  job_post_id?: string;
};

export async function GET(request: Request) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  const { data: assignments, error: assignmentsError } = await supabaseServer
    .from("job_seeker_assignments")
    .select("job_seeker_id")
    .eq("account_manager_id", amResult.accountManager.id);

  if (assignmentsError) {
    return Response.json(
      { success: false, error: "Failed to load job seeker assignments." },
      { status: 500 }
    );
  }

  const seekerIds = (assignments ?? []).map((row) => row.job_seeker_id);
  if (seekerIds.length === 0) {
    return Response.json({ success: true, items: [] });
  }

  const { data: preps, error: prepError } = await supabaseServer
    .from("interview_prep")
    .select(
      "id, job_seeker_id, job_post_id, created_at, updated_at, job_posts (title, company), job_seekers (full_name, email)"
    )
    .in("job_seeker_id", seekerIds)
    .order("updated_at", { ascending: false });

  if (prepError) {
    return Response.json(
      { success: false, error: "Failed to load interview prep." },
      { status: 500 }
    );
  }

  return Response.json({ success: true, items: preps ?? [] });
}

export async function POST(request: Request) {
  let payload: PrepPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.job_seeker_id || !payload?.job_post_id) {
    return Response.json(
      {
        success: false,
        error: "Missing required fields: job_seeker_id, job_post_id.",
      },
      { status: 400 }
    );
  }

  const access = await requireAMAccessToSeeker(request.headers, payload.job_seeker_id);
  if (!access.ok) return access.response;

  const { data: jobPost, error: jobError } = await supabaseServer
    .from("job_posts")
    .select("id, title, company, description_text, location")
    .eq("id", payload.job_post_id)
    .single();

  if (jobError || !jobPost) {
    return Response.json(
      { success: false, error: "Job post not found." },
      { status: 404 }
    );
  }

  const { data: jobSeeker, error: seekerError } = await supabaseServer
    .from("job_seekers")
    .select("id, seniority, work_type, skills")
    .eq("id", payload.job_seeker_id)
    .single();

  if (seekerError || !jobSeeker) {
    return Response.json(
      { success: false, error: "Job seeker not found." },
      { status: 404 }
    );
  }

  let content;
  if (isOpenAIConfigured()) {
    content = await buildInterviewPrepContentWithAI({
      jobTitle: jobPost.title,
      companyName: jobPost.company,
      descriptionText: jobPost.description_text,
      location: jobPost.location,
      seniority: jobSeeker.seniority,
      workType: jobSeeker.work_type,
      seekerSkills: jobSeeker.skills,
    });
  } else {
    content = buildInterviewPrepContent({
      jobTitle: jobPost.title,
      companyName: jobPost.company,
      descriptionText: jobPost.description_text,
      location: jobPost.location,
      seniority: jobSeeker.seniority,
      workType: jobSeeker.work_type,
    });
  }

  const nowIso = new Date().toISOString();
  const { data: prep, error: prepError } = await supabaseServer
    .from("interview_prep")
    .upsert(
      {
        job_seeker_id: payload.job_seeker_id,
        job_post_id: payload.job_post_id,
        content,
        updated_at: nowIso,
      },
      { onConflict: "job_seeker_id,job_post_id" }
    )
    .select("id, job_seeker_id, job_post_id, content, created_at, updated_at")
    .single();

  if (prepError || !prep) {
    return Response.json(
      { success: false, error: "Failed to save interview prep." },
      { status: 500 }
    );
  }

  return Response.json({ success: true, prep });
}
