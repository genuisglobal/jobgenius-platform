import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import { renderResumePdf } from "@/lib/resume-templates";
import type { ResumeTemplateId } from "@/lib/resume-templates";
import { buildStructuredResumeFromSeeker, type SeekerRow } from "@/lib/resume-tailor";

/**
 * POST /api/am/resume-template/preview
 * Body: { job_seeker_id: string, template_id?: ResumeTemplateId }
 *
 * Renders the client's base resume in the given template and returns the PDF,
 * so the AM can preview a template's layout before selecting it. Falls back to
 * the client's saved template, then "classic".
 */
export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { job_seeker_id?: unknown; template_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const jobSeekerId = typeof body.job_seeker_id === "string" ? body.job_seeker_id : null;
  if (!jobSeekerId) {
    return NextResponse.json({ error: "job_seeker_id is required." }, { status: 400 });
  }

  if (!(await hasJobSeekerAccess(auth.user.id, jobSeekerId))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const { data: seeker } = await supabaseAdmin
    .from("job_seekers")
    .select(
      "full_name, email, phone, linkedin_url, address_city, address_state, bio, skills, work_history, education, resume_text, resume_template_id"
    )
    .eq("id", jobSeekerId)
    .maybeSingle();

  if (!seeker) {
    return NextResponse.json({ error: "Seeker not found." }, { status: 404 });
  }

  const templateId = (typeof body.template_id === "string" && body.template_id
    ? body.template_id
    : seeker.resume_template_id || "classic") as ResumeTemplateId;

  try {
    const structured = buildStructuredResumeFromSeeker(seeker as unknown as SeekerRow);
    const pdfBuffer = renderResumePdf(structured, templateId);
    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="resume-preview.pdf"',
        "Content-Length": String(pdfBuffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Preview failed: ${message}` }, { status: 500 });
  }
}
