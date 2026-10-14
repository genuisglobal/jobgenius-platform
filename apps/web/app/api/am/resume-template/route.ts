import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import { RESUME_TEMPLATES } from "@/lib/resume-templates";
import type { ResumeTemplateId } from "@/lib/resume-templates";

const VALID_TEMPLATE_IDS = new Set<string>(RESUME_TEMPLATES.map((t) => t.id));

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
  const { job_seeker_id, template_id } = body;

  if (!job_seeker_id || !template_id) {
    return NextResponse.json(
      { error: "job_seeker_id and template_id are required." },
      { status: 400 }
    );
  }

  if (!VALID_TEMPLATE_IDS.has(template_id)) {
    return NextResponse.json(
      { error: `Invalid template_id. Valid options: ${Array.from(VALID_TEMPLATE_IDS).join(", ")}` },
      { status: 400 }
    );
  }

  if (!(await hasJobSeekerAccess(auth.user.id, job_seeker_id))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const { error: updateError } = await supabaseAdmin
    .from("job_seekers")
    .update({
      resume_template_id: template_id as ResumeTemplateId,
    })
    .eq("id", job_seeker_id);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update template preference." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, template_id });
}
