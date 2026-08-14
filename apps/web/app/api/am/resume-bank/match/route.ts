import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import {
  scoreResumeForJob,
  structuredResumeToText,
} from "@/lib/resume-bank";
import type { StructuredResume } from "@/lib/resume-templates";

export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const jobSeekerId = String(body.job_seeker_id ?? "").trim();
  const jobPostId = String(body.job_post_id ?? "").trim();

  if (!jobSeekerId || !jobPostId) {
    return NextResponse.json(
      { error: "job_seeker_id and job_post_id are required." },
      { status: 400 }
    );
  }

  if (!(await hasJobSeekerAccess(auth.user.id, jobSeekerId))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const [{ data: seeker }, { data: jobPost }, { data: versions, error: versionsError }] = await Promise.all([
    supabaseAdmin
      .from("job_seekers")
      .select("resume_text, resume_template_id")
      .eq("id", jobSeekerId)
      .maybeSingle(),
    supabaseAdmin
      .from("job_posts")
      .select("id, title, company, description_text, required_skills, preferred_skills")
      .eq("id", jobPostId)
      .maybeSingle(),
    supabaseAdmin
      .from("resume_bank_versions")
      .select("id, name, title_focus, source, is_default, template_id, resume_text, resume_data, resume_url")
      .eq("job_seeker_id", jobSeekerId)
      .eq("status", "active"),
  ]);

  if (!jobPost) {
    return NextResponse.json({ error: "Job post not found." }, { status: 404 });
  }

  if (versionsError && versionsError.code !== "42P01") {
    return NextResponse.json({ error: "Failed to load resume versions." }, { status: 500 });
  }

  const candidates: Array<{
    id: string;
    name: string;
    source: string;
    is_default: boolean;
    title_focus: string | null;
    template_id: string | null;
    resume_url: string | null;
    match_percent: number;
  }> = [];

  for (const version of versions ?? []) {
    const structured = (version.resume_data as StructuredResume | null) ?? null;
    const resumeText =
      version.resume_text || (structured ? structuredResumeToText(structured) : "");

    if (!resumeText) continue;

    const matchPercent = scoreResumeForJob({
      resumeText,
      jobTitle: jobPost.title,
      jobDescription: jobPost.description_text,
      requiredSkills: (jobPost.required_skills as string[] | null) ?? null,
      preferredSkills: (jobPost.preferred_skills as string[] | null) ?? null,
    });

    candidates.push({
      id: version.id,
      name: version.name,
      source: version.source,
      is_default: Boolean(version.is_default),
      title_focus: version.title_focus,
      template_id: version.template_id,
      resume_url: version.resume_url,
      match_percent: matchPercent,
    });
  }

  if (seeker?.resume_text) {
    const baseMatch = scoreResumeForJob({
      resumeText: seeker.resume_text,
      jobTitle: jobPost.title,
      jobDescription: jobPost.description_text,
      requiredSkills: (jobPost.required_skills as string[] | null) ?? null,
      preferredSkills: (jobPost.preferred_skills as string[] | null) ?? null,
    });

    candidates.push({
      id: "__base__",
      name: "Current Base Resume",
      source: "base",
      is_default: false,
      title_focus: null,
      template_id: seeker.resume_template_id ?? "classic",
      resume_url: null,
      match_percent: baseMatch,
    });
  }

  candidates.sort((a, b) => b.match_percent - a.match_percent);

  return NextResponse.json({
    versions: candidates,
    top_match_percent: candidates[0]?.match_percent ?? null,
  });
}
