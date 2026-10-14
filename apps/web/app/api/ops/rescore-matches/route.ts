import { supabaseAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";
import { enforceOpsRateLimit } from "@/lib/rate-limit-presets";
import { computeMatchScore, type JobSeekerProfile, type JobPost } from "@/lib/matching";

const OPS_API_KEY = process.env.OPS_API_KEY;

const SEEKER_COLUMNS =
  "id, location, seniority, salary_min, salary_max, work_type, target_titles, skills, resume_text, match_threshold, preferred_industries, preferred_company_sizes, exclude_keywords, years_experience, preferred_locations, open_to_relocation, requires_visa_sponsorship, location_preferences";
const JOB_COLUMNS =
  "id, url, title, company, location, description_text, salary_min, salary_max, seniority_level, work_type, years_experience_min, years_experience_max, required_skills, preferred_skills, industry, company_size, offers_visa_sponsorship, employment_type, parsed_at";

/* eslint-disable @typescript-eslint/no-explicit-any */
function toSeeker(s: any): JobSeekerProfile {
  return {
    id: s.id,
    location: s.location,
    seniority: s.seniority,
    salary_min: s.salary_min,
    salary_max: s.salary_max,
    work_type: s.work_type,
    target_titles: s.target_titles ?? [],
    skills: s.skills ?? [],
    resume_text: s.resume_text,
    match_threshold: s.match_threshold,
    preferred_industries: s.preferred_industries ?? [],
    preferred_company_sizes: s.preferred_company_sizes ?? [],
    exclude_keywords: s.exclude_keywords ?? [],
    years_experience: s.years_experience ?? null,
    preferred_locations: s.preferred_locations ?? [],
    open_to_relocation: s.open_to_relocation ?? false,
    requires_visa_sponsorship: s.requires_visa_sponsorship ?? false,
    location_preferences: s.location_preferences ?? [],
  };
}

function toJob(p: any): JobPost {
  return {
    id: p.id,
    url: p.url,
    title: p.title,
    company: p.company,
    location: p.location,
    description_text: p.description_text,
    salary_min: p.salary_min,
    salary_max: p.salary_max,
    seniority_level: p.seniority_level,
    work_type: p.work_type,
    years_experience_min: p.years_experience_min,
    years_experience_max: p.years_experience_max,
    required_skills: p.required_skills ?? [],
    preferred_skills: p.preferred_skills ?? [],
    industry: p.industry,
    company_size: p.company_size,
    offers_visa_sponsorship: p.offers_visa_sponsorship,
    employment_type: p.employment_type,
    parsed_at: p.parsed_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * POST /api/ops/rescore-matches?limit=1000&dry_run=true
 *
 * Re-scores existing (non-archived) job matches and archives any that the
 * hard-disqualifier rules now flag (excluded keyword, unreachable location,
 * salary below floor, no sponsorship). This retroactively cleans unsuitable
 * matches that were scored before the disqualifier gate existed. Only matches
 * that become hard-disqualified are touched — borderline/low matches are left
 * for the AM to review.
 *
 * Auth: OPS_API_KEY via x-ops-key.
 */
export async function POST(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;

  const key = request.headers.get("x-ops-key") ?? "";
  if (!OPS_API_KEY || key !== OPS_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(5000, parseInt(searchParams.get("limit") ?? "1000"));
  const dryRun = searchParams.get("dry_run") === "true";

  const { data: matches, error } = await supabaseAdmin
    .from("job_match_scores")
    .select("id, job_seeker_id, job_post_id")
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!matches || matches.length === 0) {
    return NextResponse.json({ scanned: 0, archived: 0, message: "No active matches." });
  }

  const seekerIds = Array.from(
    new Set(matches.map((m) => m.job_seeker_id).filter(Boolean))
  ) as string[];
  const jobPostIds = Array.from(
    new Set(matches.map((m) => m.job_post_id).filter(Boolean))
  ) as string[];

  const [{ data: seekerRows }, { data: jobRows }] = await Promise.all([
    supabaseAdmin.from("job_seekers").select(SEEKER_COLUMNS).in("id", seekerIds),
    supabaseAdmin.from("job_posts").select(JOB_COLUMNS).in("id", jobPostIds),
  ]);

  const seekerMap = new Map((seekerRows ?? []).map((s) => [s.id, toSeeker(s)]));
  const jobMap = new Map((jobRows ?? []).map((p) => [p.id, toJob(p)]));

  const toArchive: { id: string; reason: string }[] = [];
  let skipped = 0;

  for (const m of matches) {
    const seeker = seekerMap.get(m.job_seeker_id);
    const job = jobMap.get(m.job_post_id);
    if (!seeker || !job) {
      skipped += 1;
      continue;
    }
    const result = computeMatchScore(seeker, job);
    if (result.reasons.disqualifiers.length > 0) {
      toArchive.push({
        id: m.id,
        reason: `Re-scored — ${result.reasons.disqualifiers.join("; ")}`.slice(0, 300),
      });
    }
  }

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      scanned: matches.length,
      would_archive: toArchive.length,
      skipped_missing_data: skipped,
    });
  }

  let archived = 0;
  const nowIso = new Date().toISOString();
  const chunkSize = 200;
  for (let i = 0; i < toArchive.length; i += chunkSize) {
    const chunk = toArchive.slice(i, i + chunkSize);
    // Reasons vary per row; group identical reasons into one update each.
    const byReason = new Map<string, string[]>();
    for (const item of chunk) {
      const arr = byReason.get(item.reason) ?? [];
      arr.push(item.id);
      byReason.set(item.reason, arr);
    }
    for (const [reason, ids] of Array.from(byReason.entries())) {
      const { error: updErr } = await supabaseAdmin
        .from("job_match_scores")
        .update({ archived_at: nowIso, archive_reason: reason })
        .in("id", ids);
      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }
      archived += ids.length;
    }
  }

  return NextResponse.json({
    scanned: matches.length,
    archived,
    skipped_missing_data: skipped,
  });
}
