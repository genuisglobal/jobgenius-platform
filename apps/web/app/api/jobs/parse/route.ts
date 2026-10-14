import { supabaseServer } from "@/lib/supabase/server";
import { parseJobPostSmart } from "@/lib/matching";
import { getAccountManagerFromRequest } from "@/lib/am-access";
import { requireOpsAuth } from "@/lib/ops-auth";

type ParsePayload = {
  job_post_id?: string; // Parse specific job, or omit to parse all unparsed
  force?: boolean; // Force re-parse even if already parsed
  limit?: number; // Max jobs to parse (default 100)
};

async function ensureAuthorized(request: Request) {
  const opsAuth = requireOpsAuth(request.headers, request.url);
  if (opsAuth.ok) {
    return null;
  }

  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json(
      { success: false, error: "Unauthorized." },
      { status: 401 }
    );
  }

  return null;
}

/**
 * POST /api/jobs/parse
 *
 * Extracts structured data from job post descriptions.
 * This runs the extractors to populate fields like:
 * - salary_min, salary_max
 * - seniority_level
 * - work_type (remote/hybrid/on-site)
 * - years_experience_min, years_experience_max
 * - required_skills, preferred_skills
 * - industry
 * - company_size
 * - offers_visa_sponsorship
 * - employment_type
 */
export async function POST(request: Request) {
  const authError = await ensureAuthorized(request);
  if (authError) {
    return authError;
  }

  let payload: ParsePayload;

  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const limit = Math.min(payload.limit ?? 100, 500);

  // Build query
  let query = supabaseServer
    .from("job_posts")
    .select("id, title, company, location, description_text, parsed_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (payload.job_post_id) {
    query = query.eq("id", payload.job_post_id);
  } else if (!payload.force) {
    // Only get unparsed jobs
    query = query.is("parsed_at", null);
  }

  const { data: jobs, error: fetchError } = await query;

  if (fetchError) {
    return Response.json(
      { success: false, error: "Failed to fetch job posts." },
      { status: 500 }
    );
  }

  if (!jobs || jobs.length === 0) {
    return Response.json({
      success: true,
      parsed: 0,
      message: "No jobs to parse.",
    });
  }

  let parsedCount = 0;
  const errors: string[] = [];

  for (const job of jobs) {
    if (!job.description_text) {
      continue;
    }

    try {
      const parsed = await parseJobPostSmart(
        job.title,
        job.company,
        job.location,
        job.description_text
      );

      const { error: updateError } = await supabaseServer
        .from("job_posts")
        .update({
          salary_min: parsed.salary_min,
          salary_max: parsed.salary_max,
          seniority_level: parsed.seniority_level,
          work_type: parsed.work_type,
          years_experience_min: parsed.years_experience_min,
          years_experience_max: parsed.years_experience_max,
          required_skills: parsed.required_skills,
          preferred_skills: parsed.preferred_skills,
          industry: parsed.industry,
          company_size: parsed.company_size,
          offers_visa_sponsorship: parsed.offers_visa_sponsorship,
          employment_type: parsed.employment_type,
          parse_source: parsed.parse_source,
          responsibilities: parsed.responsibilities,
          screening_questions: parsed.screening_questions,
          parsed_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      if (updateError) {
        errors.push(`Job ${job.id}: ${updateError.message}`);
      } else {
        parsedCount++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Job ${job.id}: ${message}`);
    }
  }

  return Response.json({
    success: errors.length === 0,
    parsed: parsedCount,
    total: jobs.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}

/**
 * GET /api/jobs/parse
 *
 * Returns parsing statistics.
 */
export async function GET(request: Request) {
  // Require AM or OPS auth for parsing stats.
  const authError = await ensureAuthorized(request);
  if (authError) {
    return authError;
  }

  const { count: totalCount } = await supabaseServer
    .from("job_posts")
    .select("id", { count: "exact", head: true });

  const { count: parsedCount } = await supabaseServer
    .from("job_posts")
    .select("id", { count: "exact", head: true })
    .not("parsed_at", "is", null);

  const { count: unparsedCount } = await supabaseServer
    .from("job_posts")
    .select("id", { count: "exact", head: true })
    .is("parsed_at", null);

  return Response.json({
    total_jobs: totalCount ?? 0,
    parsed_jobs: parsedCount ?? 0,
    unparsed_jobs: unparsedCount ?? 0,
    extracted_fields: [
      "salary_min",
      "salary_max",
      "seniority_level",
      "work_type",
      "years_experience_min",
      "years_experience_max",
      "required_skills",
      "preferred_skills",
      "industry",
      "company_size",
      "offers_visa_sponsorship",
      "employment_type",
    ],
  });
}
