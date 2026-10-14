import { requireOpsAuth } from "@/lib/ops-auth";
import { supabaseServer } from "@/lib/supabase/server";
import { parseJobPostSmart } from "@/lib/matching";
import { createLogger } from "@/lib/logger";

// Backfill endpoint for the LLM JD parser (lib/matching/jd-parser.ts).
//
// Existing job_posts were parsed by the old regex parser (parse_source is null)
// and won't be re-parsed on their own — parsing is gated by parsed_at. This
// endpoint re-parses active posts through parseJobPostSmart in batches so the
// existing corpus gets the richer, all-domain skills + screening questions.
//
// Cursor-based and idempotent: each call processes up to `limit` active posts
// (parse_source null or 'regex') with id > `after`, ordered by id, and returns
// `next_cursor` (the last id). Drive to completion by re-posting with
// ?after=<next_cursor> until next_cursor is null. Rows already 'hybrid' are
// skipped. Auth: OPS_API_KEY / service key (same as other ops endpoints).
//
// POST /api/ops/reparse-jobs?limit=50&after=<id>&include_regex=false

export const maxDuration = 300; // parsing N jobs via the LLM can take a while

const log = createLogger("ops:reparse-jobs");

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const CONCURRENCY = 5;

interface JobRow {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  description_text: string | null;
}

async function reparseOne(job: JobRow): Promise<boolean> {
  const parsed = await parseJobPostSmart(
    job.title ?? "",
    job.company,
    job.location,
    job.description_text
  );
  const { error } = await supabaseServer
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

  if (error) {
    log.warn("reparse update failed", { jobId: job.id, error: error.message });
    return false;
  }
  return true;
}

export async function POST(request: Request) {
  const opsAuth = requireOpsAuth(request.headers, request.url);
  if (!opsAuth.ok) {
    return Response.json({ success: false, error: "Not authorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT)
  );
  const after = url.searchParams.get("after");
  // By default re-attempt rows never LLM-parsed OR that fell back to regex.
  // Set include_regex=false to only touch never-parsed (parse_source IS NULL) rows.
  const includeRegex = url.searchParams.get("include_regex") !== "false";

  let query = supabaseServer
    .from("job_posts")
    .select("id, title, company, location, description_text")
    .eq("is_active", true)
    .not("description_text", "is", null)
    .order("id", { ascending: true })
    .limit(limit);

  query = includeRegex
    ? query.or("parse_source.is.null,parse_source.eq.regex")
    : query.is("parse_source", null);

  if (after) query = query.gt("id", after);

  const { data, error } = await query;
  if (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }

  const jobs = (data ?? []) as JobRow[];
  let updated = 0;

  // Bounded concurrency to respect OpenAI rate limits.
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const chunk = jobs.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(reparseOne));
    updated += results.filter(Boolean).length;
  }

  // More rows likely remain only if we filled the page.
  const nextCursor = jobs.length === limit ? jobs[jobs.length - 1].id : null;

  return Response.json({
    success: true,
    processed: jobs.length,
    updated,
    next_cursor: nextCursor,
  });
}
