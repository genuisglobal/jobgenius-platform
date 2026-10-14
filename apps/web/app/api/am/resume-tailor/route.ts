import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import { isOpenAIConfigured } from "@/lib/openai";
import { tailorResume } from "@/lib/resume-tailor";
import {
  tailorResumeStructured,
  buildStructuredResumeFromSeeker,
} from "@/lib/resume-tailor";
import { renderResumePdf } from "@/lib/resume-templates";
import type { ResumeTemplateId, StructuredResume } from "@/lib/resume-templates";
import { maybeUpsertResumeHardeningAlert } from "@/lib/resume-bank-alerts";

function isMissingResumeBankTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string; message?: string; details?: string };
  const text = `${maybe.message ?? ""} ${maybe.details ?? ""}`.toLowerCase();
  return maybe.code === "42P01" || text.includes("resume_bank_versions");
}

export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isOpenAIConfigured()) {
    return NextResponse.json(
      { error: "OpenAI is not configured. Set OPENAI_API_KEY to enable resume tailoring." },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { job_seeker_id, job_post_id } = body;
  const resumeVersionId =
    typeof body.resume_version_id === "string" && body.resume_version_id.trim()
      ? body.resume_version_id.trim()
      : null;

  if (!job_seeker_id || !job_post_id) {
    return NextResponse.json(
      { error: "job_seeker_id and job_post_id are required." },
      { status: 400 }
    );
  }

  if (!(await hasJobSeekerAccess(auth.user.id, job_seeker_id))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const [
    { data: seeker },
    { data: jobPost },
    { data: selectedVersion, error: selectedVersionError },
    { data: defaultVersion, error: defaultVersionError },
  ] =
    await Promise.all([
    supabaseAdmin
      .from("job_seekers")
      .select(
        "resume_text, full_name, email, phone, linkedin_url, address_city, address_state, skills, work_history, education, bio, resume_template_id"
      )
      .eq("id", job_seeker_id)
      .maybeSingle(),
    supabaseAdmin
      .from("job_posts")
      .select("id, title, company, description_text, required_skills, preferred_skills")
      .eq("id", job_post_id)
      .single(),
    resumeVersionId
      ? supabaseAdmin
          .from("resume_bank_versions")
          .select("id, name, template_id, resume_text, resume_data")
          .eq("id", resumeVersionId)
          .eq("job_seeker_id", job_seeker_id)
          .eq("status", "active")
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabaseAdmin
      .from("resume_bank_versions")
      .select("id, name, template_id, resume_text, resume_data")
      .eq("job_seeker_id", job_seeker_id)
      .eq("status", "active")
      .eq("is_default", true)
      .maybeSingle(),
  ]);

  if (selectedVersionError) {
    const missingTable = isMissingResumeBankTable(selectedVersionError);
    if (missingTable) {
      return NextResponse.json(
        { error: "Resume bank migration is not applied yet. Run migration 054 first." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Failed to load selected resume version." }, { status: 500 });
  }

  if (resumeVersionId && !selectedVersion?.id) {
    return NextResponse.json({ error: "Selected resume version not found." }, { status: 404 });
  }

  if (defaultVersionError && !isMissingResumeBankTable(defaultVersionError)) {
    return NextResponse.json({ error: "Failed to load default resume version." }, { status: 500 });
  }

  const sourceVersion = selectedVersion ?? defaultVersion ?? null;

  const sourceResumeText =
    sourceVersion?.resume_text?.trim() || seeker?.resume_text?.trim() || null;

  if (!sourceResumeText && !selectedVersion?.resume_data && !seeker?.email) {
    return NextResponse.json(
      { error: "Job seeker has no resume text on file." },
      { status: 400 }
    );
  }

  if (!jobPost) {
    return NextResponse.json({ error: "Job post not found." }, { status: 404 });
  }

  const templateId = (
    sourceVersion?.template_id ||
    seeker?.resume_template_id ||
    "classic"
  ) as ResumeTemplateId;

  try {
    // Try structured tailoring first
    const baseResume =
      (sourceVersion?.resume_data as StructuredResume | null) ??
      buildStructuredResumeFromSeeker({
        full_name: seeker?.full_name ?? null,
        email: seeker?.email ?? "",
        phone: seeker?.phone ?? null,
        linkedin_url: seeker?.linkedin_url ?? null,
        address_city: seeker?.address_city ?? null,
        address_state: seeker?.address_state ?? null,
        bio: seeker?.bio ?? null,
        skills: seeker?.skills ?? null,
        work_history: seeker?.work_history,
        education: seeker?.education,
        resume_text: sourceResumeText,
      });

    const structuredResult = await tailorResumeStructured({
      baseResume,
      jobTitle: jobPost.title,
      company: jobPost.company,
      jobDescription: jobPost.description_text,
      requiredSkills: jobPost.required_skills,
      preferredSkills: jobPost.preferred_skills,
    });

    // Generate PDF
    let resumeUrl: string | null = null;
    try {
      const pdfBuffer = renderResumePdf(structuredResult.tailoredData, templateId);
      const storagePath = `${job_seeker_id}/tailored/${job_post_id}.pdf`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from("resumes")
        .upload(storagePath, pdfBuffer, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (!uploadError) {
        const { data: signedUrlData } = await supabaseAdmin.storage
          .from("resumes")
          .createSignedUrl(storagePath, 365 * 24 * 60 * 60);

        if (signedUrlData?.signedUrl) {
          resumeUrl = signedUrlData.signedUrl;
        } else {
          const { data: urlData } = supabaseAdmin.storage
            .from("resumes")
            .getPublicUrl(storagePath);
          resumeUrl = urlData.publicUrl ?? null;
        }
      }
    } catch (pdfErr) {
      console.error("PDF generation/upload failed:", pdfErr);
    }

    const { data: upserted, error: upsertError } = await supabaseAdmin
      .from("tailored_resumes")
      .upsert(
        {
          job_seeker_id,
          job_post_id,
          original_text: sourceResumeText ?? "",
          tailored_text: structuredResult.tailoredText,
          tailored_data: structuredResult.tailoredData,
          template_id: templateId,
          changes_summary: structuredResult.changesSummary,
          resume_url: resumeUrl,
          resume_bank_version_id: sourceVersion?.id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "job_seeker_id,job_post_id" }
      )
      .select()
      .single();

    if (upsertError) {
      return NextResponse.json(
        { error: "Failed to save tailored resume." },
        { status: 500 }
      );
    }

    await maybeUpsertResumeHardeningAlert({
      supabase: supabaseAdmin,
      jobSeekerId: job_seeker_id,
      jobTitle: jobPost.title,
      threshold: 5,
    });

    return NextResponse.json({
      tailored_resume: upserted,
      changes_summary: structuredResult.changesSummary,
      coverage: structuredResult.coverage ?? null,
      safety: structuredResult.safety ?? null,
    });
  } catch (structuredErr) {
    // Fall back to plain-text tailoring
    console.error("Structured tailoring failed, falling back to plain text:", structuredErr);

    if (!sourceResumeText) {
      const message = structuredErr instanceof Error ? structuredErr.message : "Unknown error";
      return NextResponse.json(
        { error: `Resume tailoring failed: ${message}` },
        { status: 500 }
      );
    }

    try {
      const result = await tailorResume({
        resumeText: sourceResumeText,
        jobTitle: jobPost.title,
        company: jobPost.company,
        jobDescription: jobPost.description_text,
        requiredSkills: jobPost.required_skills,
        preferredSkills: jobPost.preferred_skills,
      });

      const { data: upserted, error: upsertError } = await supabaseAdmin
        .from("tailored_resumes")
        .upsert(
          {
            job_seeker_id,
            job_post_id,
            original_text: sourceResumeText,
            tailored_text: result.tailoredText,
            changes_summary: result.changesSummary,
            resume_bank_version_id: sourceVersion?.id ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "job_seeker_id,job_post_id" }
        )
        .select()
        .single();

      if (upsertError) {
        return NextResponse.json(
          { error: "Failed to save tailored resume." },
          { status: 500 }
        );
      }

      await maybeUpsertResumeHardeningAlert({
        supabase: supabaseAdmin,
        jobSeekerId: job_seeker_id,
        jobTitle: jobPost.title,
        threshold: 5,
      });

      return NextResponse.json({
        tailored_resume: upserted,
        changes_summary: result.changesSummary,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json(
        { error: `Resume tailoring failed: ${message}` },
        { status: 500 }
      );
    }
  }
}
