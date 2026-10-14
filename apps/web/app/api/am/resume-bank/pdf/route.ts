import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import { renderResumePdf } from "@/lib/resume-templates";
import type { ResumeTemplateId, StructuredResume } from "@/lib/resume-templates";

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
  const versionId = String(body.version_id ?? "").trim();
  const templateId = String(body.template_id ?? "").trim();

  if (!jobSeekerId || !versionId) {
    return NextResponse.json(
      { error: "job_seeker_id and version_id are required." },
      { status: 400 }
    );
  }

  if (!(await hasJobSeekerAccess(auth.user.id, jobSeekerId))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const { data: version } = await supabaseAdmin
    .from("resume_bank_versions")
    .select("resume_data, template_id")
    .eq("id", versionId)
    .eq("job_seeker_id", jobSeekerId)
    .eq("status", "active")
    .maybeSingle();

  if (!version?.resume_data) {
    return NextResponse.json(
      { error: "No structured resume data found for this version." },
      { status: 404 }
    );
  }

  const resolvedTemplateId = (
    templateId ||
    version.template_id ||
    "classic"
  ) as ResumeTemplateId;

  try {
    const pdfBuffer = renderResumePdf(
      version.resume_data as StructuredResume,
      resolvedTemplateId
    );
    const uint8 = new Uint8Array(pdfBuffer);
    return new Response(uint8, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="resume-bank-version.pdf"`,
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
