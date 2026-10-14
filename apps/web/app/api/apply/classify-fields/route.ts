import { NextResponse } from "next/server";
import { requireAMAccessToSeeker } from "@/lib/am-access";
import { supabaseAdmin } from "@/lib/auth";
import { resolveFields, type ScreeningAnswer } from "@/lib/apply/field-resolver";
import type { FieldDescriptor } from "@/lib/learned-fields";

/**
 * POST /api/apply/classify-fields
 *
 * Shared "fill brain" for the browser extension (and any runner). Given a
 * batch of unfilled fields plus the target seeker + host, returns a
 * { label -> value } map resolved through learned rules → screening
 * answers → LLM. LLM results are recorded back into learned_field_rules so
 * the next application is a cache hit.
 *
 * Body: {
 *   job_seeker_id: string,
 *   ats_type?: string,
 *   url_host: string,
 *   fields: { label: string, type?: string, options?: string[] }[],
 *   job?: { title?: string, company?: string }
 * }
 *
 * Auth: same bearer-runner / AM auth as the rest of /api/apply/*.
 */

function parseFields(raw: unknown): FieldDescriptor[] {
  if (!Array.isArray(raw)) return [];
  const out: FieldDescriptor[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const label = (item as { label?: unknown }).label;
    if (typeof label !== "string" || !label.trim()) continue;
    const typeRaw = (item as { type?: unknown }).type;
    const optionsRaw = (item as { options?: unknown }).options;
    out.push({
      label,
      type: typeof typeRaw === "string" ? typeRaw : null,
      options: Array.isArray(optionsRaw)
        ? optionsRaw.filter((v): v is string => typeof v === "string")
        : null,
    });
  }
  return out;
}

export async function POST(request: Request) {
  let body: {
    job_seeker_id?: unknown;
    ats_type?: unknown;
    url_host?: unknown;
    fields?: unknown;
    job?: { title?: unknown; company?: unknown; job_post_id?: unknown };
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const jobSeekerId = typeof body.job_seeker_id === "string" ? body.job_seeker_id : null;
  const urlHost = typeof body.url_host === "string" ? body.url_host : null;
  const atsType = typeof body.ats_type === "string" ? body.ats_type : null;
  const fields = parseFields(body.fields);

  if (!jobSeekerId || !urlHost) {
    return NextResponse.json(
      { error: "job_seeker_id and url_host are required." },
      { status: 400 }
    );
  }
  if (fields.length === 0) {
    return NextResponse.json({ resolved: [], map: {}, unresolved: [] });
  }

  const access = await requireAMAccessToSeeker(request.headers, jobSeekerId);
  if (!access.ok) return access.response;

  // Profile + screening answers are read server-side so the extension
  // never has to ship (or hold) the full seeker record.
  const [{ data: profile }, { data: screeningRows }] = await Promise.all([
    supabaseAdmin
      .from("job_seekers")
      .select(
        "full_name, email, phone, location, linkedin_url, portfolio_url, work_history, education, skills, years_experience, resume_text, bio, seniority, target_titles, preferred_industries"
      )
      .eq("id", jobSeekerId)
      .maybeSingle(),
    supabaseAdmin
      .from("job_seeker_screening_answers")
      .select("question_key, answer_value, answer_type")
      .eq("job_seeker_id", jobSeekerId),
  ]);

  const screeningAnswers: ScreeningAnswer[] = Array.isArray(screeningRows)
    ? (screeningRows as ScreeningAnswer[])
    : [];

  let job =
    body.job && typeof body.job === "object"
      ? {
          title: typeof body.job.title === "string" ? body.job.title : null,
          company: typeof body.job.company === "string" ? body.job.company : null,
          description: null as string | null,
        }
      : null;

  // Pull the job description so open-ended / case-based answers can be tailored
  // to the role. The extension sends job_post_id when the job was captured.
  const jobPostId =
    body.job && typeof body.job === "object" && typeof body.job.job_post_id === "string"
      ? body.job.job_post_id
      : null;
  if (jobPostId) {
    const { data: jobPost } = await supabaseAdmin
      .from("job_posts")
      .select("title, company, description_text")
      .eq("id", jobPostId)
      .maybeSingle();
    if (jobPost) {
      job = {
        title: job?.title ?? jobPost.title ?? null,
        company: job?.company ?? jobPost.company ?? null,
        description: jobPost.description_text ?? null,
      };
    }
  }

  const result = await resolveFields({
    atsType,
    urlHost,
    fields,
    profile: (profile as Record<string, unknown>) ?? null,
    screeningAnswers,
    job,
    amId: access.amId,
  });

  return NextResponse.json(result);
}
