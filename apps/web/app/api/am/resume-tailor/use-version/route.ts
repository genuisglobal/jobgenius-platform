import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import type { ResumeTemplateId, StructuredResume } from "@/lib/resume-templates";
import { structuredResumeToText } from "@/lib/resume-bank";

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
  const resumeVersionId = String(body.resume_version_id ?? "").trim();
  const templateOverride = String(body.template_id ?? "").trim();

  if (!jobSeekerId || !jobPostId || !resumeVersionId) {
    return NextResponse.json(
      { error: "job_seeker_id, job_post_id, and resume_version_id are required." },
      { status: 400 }
    );
  }

  if (!(await hasJobSeekerAccess(auth.user.id, jobSeekerId))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const [{ data: version }, { data: seeker }] = await Promise.all([
    supabaseAdmin
      .from("resume_bank_versions")
      .select("id, job_seeker_id, name, template_id, resume_text, resume_data, resume_url")
      .eq("id", resumeVersionId)
      .eq("job_seeker_id", jobSeekerId)
      .eq("status", "active")
      .maybeSingle(),
    supabaseAdmin
      .from("job_seekers")
      .select("resume_text")
      .eq("id", jobSeekerId)
      .maybeSingle(),
  ]);

  if (!version) {
    return NextResponse.json({ error: "Resume version not found." }, { status: 404 });
  }

  const data = (version.resume_data as StructuredResume | null) ?? null;
  const resolvedTemplate =
    (templateOverride || version.template_id || "classic") as ResumeTemplateId;
  const tailoredText = version.resume_text || (data ? structuredResumeToText(data) : "");

  if (!tailoredText) {
    return NextResponse.json(
      { error: "Selected resume version has no text content." },
      { status: 400 }
    );
  }

  const { data: upserted, error: upsertError } = await supabaseAdmin
    .from("tailored_resumes")
    .upsert(
      {
        job_seeker_id: jobSeekerId,
        job_post_id: jobPostId,
        original_text: seeker?.resume_text ?? tailoredText,
        tailored_text: tailoredText,
        tailored_data: data,
        template_id: resolvedTemplate,
        changes_summary: `Reused resume bank version: ${version.name}`,
        resume_url: version.resume_url,
        resume_bank_version_id: version.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "job_seeker_id,job_post_id" }
    )
    .select()
    .single();

  if (upsertError || !upserted) {
    return NextResponse.json({ error: "Failed to apply resume version." }, { status: 500 });
  }

  return NextResponse.json({ tailored_resume: upserted });
}
