import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { verifyExtensionSession } from "@/lib/extension-auth";
import {
  computeMatchScore,
  type JobSeekerProfile,
  type JobPost,
} from "@/lib/matching";
import { parseJobPost } from "@/lib/matching/extractors";

type ScoreJobBody = {
  title?: string | null;
  company?: string | null;
  location?: string | null;
  description_text?: string | null;
  salary_text?: string | null;
  url?: string | null;
};

/**
 * POST /api/extension/score-job
 *
 * Live, run-less match scoring for the on-page Job Intelligence overlay. The
 * extension scrapes the job the AM is looking at (title/company/location/JD)
 * and this returns a match score + matched skills + missing keywords for the
 * active seeker — WITHOUT persisting anything or requiring the job to exist in
 * our DB.
 *
 * Uses the synchronous heuristic parser (parseJobPost) rather than the LLM
 * parser: the overlay fires on every job the AM browses, so it must be fast and
 * free. This is read-only intelligence, so — unlike live apply — it does NOT
 * gate on active-client status; any assigned seeker can be scored while
 * browsing.
 */
export async function POST(request: Request) {
  const session = await verifyExtensionSession(request);
  if (!session) {
    return NextResponse.json(
      { error: "Invalid or expired token." },
      { status: 401 }
    );
  }

  const jobSeekerId = session.active_job_seeker_id;
  if (!jobSeekerId) {
    return NextResponse.json(
      { error: "No active job seeker selected." },
      { status: 400 }
    );
  }

  // The AM operating the extension must be assigned to this seeker.
  const { data: assignment } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("id")
    .eq("account_manager_id", session.account_manager_id)
    .eq("job_seeker_id", jobSeekerId)
    .maybeSingle();

  if (!assignment) {
    return NextResponse.json(
      { error: "Not authorized for this job seeker." },
      { status: 403 }
    );
  }

  let body: ScoreJobBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  if (!title) {
    return NextResponse.json(
      { error: "A job title is required to score." },
      { status: 400 }
    );
  }

  const { data: seekerData, error: seekerError } = await supabaseAdmin
    .from("job_seekers")
    .select(
      `
      id,
      location,
      seniority,
      salary_min,
      salary_max,
      work_type,
      target_titles,
      skills,
      resume_text,
      match_threshold,
      match_weights,
      preferred_industries,
      preferred_company_sizes,
      exclude_keywords,
      years_experience,
      preferred_locations,
      open_to_relocation,
      requires_visa_sponsorship,
      location_preferences
    `
    )
    .eq("id", jobSeekerId)
    .single();

  if (seekerError || !seekerData) {
    return NextResponse.json(
      { error: "Job seeker profile not found." },
      { status: 404 }
    );
  }

  const seeker: JobSeekerProfile = {
    id: seekerData.id,
    location: seekerData.location,
    seniority: seekerData.seniority,
    salary_min: seekerData.salary_min,
    salary_max: seekerData.salary_max,
    work_type: seekerData.work_type,
    target_titles: seekerData.target_titles ?? [],
    skills: seekerData.skills ?? [],
    resume_text: seekerData.resume_text,
    match_threshold: seekerData.match_threshold,
    preferred_industries: seekerData.preferred_industries ?? [],
    preferred_company_sizes: seekerData.preferred_company_sizes ?? [],
    exclude_keywords: seekerData.exclude_keywords ?? [],
    years_experience: seekerData.years_experience ?? null,
    preferred_locations: seekerData.preferred_locations ?? [],
    open_to_relocation: seekerData.open_to_relocation ?? false,
    requires_visa_sponsorship: seekerData.requires_visa_sponsorship ?? false,
    location_preferences: seekerData.location_preferences ?? [],
  };

  const company = (body.company ?? "").trim() || null;
  const location = (body.location ?? "").trim() || null;
  const description = (body.description_text ?? "").trim() || null;

  // Heuristic parse of the scraped JD → structured skills/salary/etc.
  const parsed = parseJobPost(
    title,
    company,
    location,
    description,
    body.salary_text ?? null
  );

  const job: JobPost = {
    id: "live-overlay",
    url: (body.url ?? "").trim() || "",
    title,
    company,
    location,
    description_text: description,
    parsed_at: new Date().toISOString(),
    ...parsed,
  };

  const customWeights = seekerData.match_weights as Record<
    string,
    number
  > | null;
  const weights = customWeights
    ? {
        skills: customWeights.skills ?? 35,
        title: customWeights.title ?? 20,
        experience: customWeights.experience ?? 10,
        salary: customWeights.salary ?? 10,
        location: customWeights.location ?? 15,
        company_fit: customWeights.company_fit ?? 10,
        max_penalty: customWeights.max_penalty ?? 15,
      }
    : undefined;

  const result = computeMatchScore(seeker, job, weights);
  const threshold = seekerData.match_threshold ?? 50;

  const skillDetails = result.component_scores.skills.details;

  return NextResponse.json({
    score: result.score,
    confidence: result.confidence,
    recommendation: result.recommendation,
    threshold,
    above_threshold: result.score >= threshold,
    matched_skills: result.reasons.matched_skills,
    missing_skills: result.reasons.missing_skills,
    title_hits: result.reasons.title_hits,
    disqualifiers: result.reasons.disqualifiers,
    skills_coverage_pct: skillDetails.coverage_pct,
    job: { title, company, location },
  });
}
