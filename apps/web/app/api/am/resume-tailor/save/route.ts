import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import { renderResumePdf } from "@/lib/resume-templates";
import type { StructuredResume, ResumeTemplateId } from "@/lib/resume-templates";

export async function PUT(request: Request) {
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
  const { job_seeker_id, job_post_id, tailored_data, template_id } = body;

  if (!job_seeker_id || !job_post_id || !tailored_data) {
    return NextResponse.json(
      { error: "job_seeker_id, job_post_id, and tailored_data are required." },
      { status: 400 }
    );
  }

  if (!(await hasJobSeekerAccess(auth.user.id, job_seeker_id))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const data = tailored_data as StructuredResume;
  if (!data.contact?.fullName || !data.contact?.email) {
    return NextResponse.json(
      { error: "tailored_data must include contact.fullName and contact.email." },
      { status: 400 }
    );
  }

  const resolvedTemplateId = (template_id || "classic") as ResumeTemplateId;

  // Generate PDF from edited data
  let resumeUrl: string | null = null;
  try {
    const pdfBuffer = renderResumePdf(data, resolvedTemplateId);
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

  // Build plain text from structured data for backwards compat
  const c = data.contact;
  const textLines: string[] = [c.fullName];
  const contactParts = [c.email, c.phone, c.location, c.linkedinUrl, c.portfolioUrl].filter(Boolean);
  if (contactParts.length) textLines.push(contactParts.join(" | "));
  textLines.push("");
  if (data.summary) {
    textLines.push("SUMMARY", data.summary, "");
  }
  for (const w of data.workExperience ?? []) {
    textLines.push(`${w.title} - ${w.company}`);
    textLines.push(`${w.startDate} - ${w.endDate}`);
    for (const b of w.bullets) textLines.push(`  - ${b}`);
    textLines.push("");
  }
  for (const e of data.education ?? []) {
    textLines.push(`${e.degree}${e.field ? ` in ${e.field}` : ""} - ${e.institution}`);
    textLines.push(e.graduationDate);
    textLines.push("");
  }
  if (data.skills?.length) {
    textLines.push("SKILLS", data.skills.join(", "), "");
  }
  for (const cert of data.certifications ?? []) {
    textLines.push([cert.name, cert.issuer, cert.date].filter(Boolean).join(" - "));
  }
  const tailoredText = textLines.join("\n");

  const { data: upserted, error: upsertError } = await supabaseAdmin
    .from("tailored_resumes")
    .upsert(
      {
        job_seeker_id,
        job_post_id,
        tailored_data: data,
        tailored_text: tailoredText,
        template_id: resolvedTemplateId,
        resume_url: resumeUrl,
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

  return NextResponse.json({ tailored_resume: upserted });
}
