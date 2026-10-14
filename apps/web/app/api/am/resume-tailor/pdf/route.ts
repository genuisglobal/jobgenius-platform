import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import { renderResumePdf } from "@/lib/resume-templates";
import type { StructuredResume, ResumeTemplateId } from "@/lib/resume-templates";

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
  const { job_seeker_id, job_post_id, template_id } = body;

  if (!job_seeker_id || !job_post_id) {
    return NextResponse.json(
      { error: "job_seeker_id and job_post_id are required." },
      { status: 400 }
    );
  }

  if (!(await hasJobSeekerAccess(auth.user.id, job_seeker_id))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const { data: tailored } = await supabaseAdmin
    .from("tailored_resumes")
    .select("tailored_data, tailored_text, template_id")
    .eq("job_seeker_id", job_seeker_id)
    .eq("job_post_id", job_post_id)
    .maybeSingle();

  if (!tailored?.tailored_data) {
    return NextResponse.json(
      { error: "No structured tailored resume found. Tailor the resume first." },
      { status: 404 }
    );
  }

  const resolvedTemplateId = (template_id || tailored.template_id || "classic") as ResumeTemplateId;

  try {
    const pdfBuffer = renderResumePdf(
      tailored.tailored_data as StructuredResume,
      resolvedTemplateId
    );

    const uint8 = new Uint8Array(pdfBuffer);
    return new Response(uint8, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="tailored_resume.pdf"`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `PDF generation failed: ${message}` },
      { status: 500 }
    );
  }
}
