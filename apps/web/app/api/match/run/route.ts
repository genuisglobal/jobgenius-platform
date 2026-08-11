import { supabaseServer } from "@/lib/supabase/server";
import { getAccountManagerFromRequest, hasJobSeekerAccess } from "@/lib/am-access";
import { requireOpsAuth } from "@/lib/ops-auth";
import {
  computeMatchScore,
  parseJobPostSmart,
  type JobSeekerProfile,
  type JobPost,
} from "@/lib/matching";
import { buildMatchExplanation } from "@/lib/matching/explanations";
import { isActiveClient } from "@/lib/intake";
import { logActivity } from "@/lib/feedback-loop";
import {
  recordMatchFeatures,
  featuresFromBreakdown,
  blendScore,
  readBlendAlpha,
  getActiveModel,
} from "@/lib/learned-ranker";

type MatchPayload = {
  job_seeker_id?: string;
  job_post_id?: string;
  reparse_jobs?: boolean; // Force re-parsing of job structured data
};

/**
 * POST /api/match/run
 *
 * Computes intelligent match scores between job seekers and job posts.
 *
 * Request body:
 * - job_seeker_id (required): UUID of the job seeker
 * - job_post_id (optional): UUID of specific job post, or omit to score all
 * - reparse_jobs (optional): Force re-extraction of structured data from job descriptions
 *
 * The scoring algorithm considers:
 * - Skills overlap (35 points max) - required vs preferred skills
 * - Title alignment (20 points max) - target titles vs job title
 * - Experience match (10 points max) - years of experience fit
 * - Salary fit (10 points max) - salary range overlap
 * - Location match (15 points max) - location/remote/hybrid preferences
 * - Company fit (10 points max) - industry and company size preferences
 * - Penalties (up to -15 points) - exclude keywords, visa mismatch
 */
export async function POST(request: Request) {
  let payload: MatchPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.job_seeker_id) {
    return Response.json(
      { success: false, error: "Missing job_seeker_id." },
      { status: 400 }
    );
  }

  // Authorize: OPS key or AM with access to this job seeker.
  const opsAuth = requireOpsAuth(request.headers, request.url);
  if (!opsAuth.ok) {
    const amResult = await getAccountManagerFromRequest(request.headers);
    if ("error" in amResult) {
      return Response.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const allowed = await hasJobSeekerAccess(
      amResult.accountManager.id,
      payload.job_seeker_id
    );

    if (!allowed) {
      return Response.json(
        { success: false, error: "Not authorized for this job seeker." },
        { status: 403 }
      );
    }
  }

  // Fetch job seeker with all preference fields including custom weights
  const { data: seekerData, error: seekerError } = await supabaseServer
    .from("job_seekers")
    .select(`
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
    `)
    .eq("id", payload.job_seeker_id)
    .single();

  if (seekerError || !seekerData) {
    return Response.json(
      { success: false, error: "Job seeker not found." },
      { status: 404 }
    );
  }

  // Transform to JobSeekerProfile type with defaults for new fields
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

  // Fetch job posts
  let jobPostsQuery = supabaseServer.from("job_posts").select(`
      id,
      url,
      title,
      company,
      location,
      description_text,
      salary_min,
      salary_max,
      seniority_level,
      work_type,
      years_experience_min,
      years_experience_max,
      required_skills,
      preferred_skills,
      industry,
      company_size,
      offers_visa_sponsorship,
      employment_type,
      parsed_at
    `);

  if (payload.job_post_id) {
    jobPostsQuery = jobPostsQuery.eq("id", payload.job_post_id);
  }

  const { data: jobPosts, error: jobPostsError } = await jobPostsQuery;

  if (jobPostsError) {
    return Response.json(
      { success: false, error: "Failed to load job posts." },
      { status: 500 }
    );
  }

  const posts = jobPosts ?? [];

  let matchedCount = 0;
  let parsedCount = 0;
  const errors: string[] = [];

  // Optionally blend the learned ranker into the heuristic. No-op when
  // RANKER_BLEND_ALPHA is unset/0. Fetch the active model once for the loop.
  const blendAlpha = readBlendAlpha();
  const activeModel = blendAlpha > 0 ? await getActiveModel() : null;

  for (const post of posts) {
    try {
      // Parse job post if needed (no structured data or reparse requested)
      let jobData: JobPost = {
        id: post.id,
        url: post.url,
        title: post.title,
        company: post.company,
        location: post.location,
        description_text: post.description_text,
        salary_min: post.salary_min,
        salary_max: post.salary_max,
        seniority_level: post.seniority_level,
        work_type: post.work_type,
        years_experience_min: post.years_experience_min,
        years_experience_max: post.years_experience_max,
        required_skills: post.required_skills ?? [],
        preferred_skills: post.preferred_skills ?? [],
        industry: post.industry,
        company_size: post.company_size,
        offers_visa_sponsorship: post.offers_visa_sponsorship,
        employment_type: post.employment_type,
        parsed_at: post.parsed_at,
      };

      // Extract structured data if not already parsed or if reparse requested
      const needsParsing = !post.parsed_at || payload.reparse_jobs;

      if (needsParsing && post.description_text) {
        const parsed = await parseJobPostSmart(
          post.title,
          post.company,
          post.location,
          post.description_text
        );

        // Update job post with parsed data
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
          .eq("id", post.id);

        if (!updateError) {
          // Use parsed data for scoring
          jobData = {
            ...jobData,
            ...parsed,
            parsed_at: new Date().toISOString(),
          };
          parsedCount++;
        }
      }

      // Use custom weights if configured by the AM for this seeker
      const customWeights = seekerData.match_weights as Record<string, number> | null;
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

      // Compute match score
      const matchResult = computeMatchScore(seeker, jobData, weights);

      const features = featuresFromBreakdown(matchResult.component_scores, weights);
      const finalScore = activeModel
        ? blendScore({
            heuristic: matchResult.score,
            features,
            weights: activeModel.weights,
            alpha: blendAlpha,
          })
        : matchResult.score;

      // Upsert match score
      const { error: upsertError } = await supabaseServer
        .from("job_match_scores")
        .upsert(
          {
            job_post_id: post.id,
            job_seeker_id: seeker.id,
            score: finalScore,
            confidence: matchResult.confidence,
            recommendation: matchResult.recommendation,
            reasons: {
              ...matchResult.reasons,
              component_scores: matchResult.component_scores,
              ...(activeModel
                ? {
                    learned: {
                      model_id: activeModel.id,
                      version: activeModel.version,
                      alpha: blendAlpha,
                      heuristic: matchResult.score,
                    },
                  }
                : {}),
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "job_post_id,job_seeker_id" }
        );

      if (upsertError) {
        errors.push(`Failed to save score for job ${post.id}: ${upsertError.message}`);
        continue;
      }

      // Snapshot features for the learned ranker (non-blocking, never throws).
      void recordMatchFeatures({
        jobSeekerId: seeker.id,
        jobPostId: post.id,
        heuristicScore: matchResult.score,
        features,
      });

      matchedCount++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Error processing job ${post.id}: ${message}`);
    }
  }

  // Auto-queue strong/good matches above threshold
  let autoQueuedCount = 0;
  let autoBlockedCount = 0;
  const threshold = seekerData.match_threshold ?? 60;

  // Gather all scored jobs for this seeker that are above threshold
  const { data: highScores } = await supabaseServer
    .from("job_match_scores")
    .select("job_post_id, score, confidence, recommendation, reasons")
    .eq("job_seeker_id", seeker.id)
    .gte("score", threshold);

  const qualifiedJobs = (highScores ?? []).filter((row) => {
    if (
      row.recommendation !== "strong_match" &&
      row.recommendation !== "good_match"
    ) {
      return false;
    }

    const explanation = buildMatchExplanation(row.reasons, {
      score: row.score ?? null,
      confidence: row.confidence ?? null,
      recommendation: row.recommendation ?? null,
    });

    if (explanation.queueBlocked) {
      autoBlockedCount += 1;
      return false;
    }

    return true;
  });

  if (qualifiedJobs.length > 0) {
    const qualifiedJobIds = qualifiedJobs.map((j) => j.job_post_id);

    // Check which are already in application_queue or application_runs
    const { data: existingQueue } = await supabaseServer
      .from("application_queue")
      .select("job_post_id")
      .eq("job_seeker_id", seeker.id)
      .in("job_post_id", qualifiedJobIds);

    const { data: existingRuns } = await supabaseServer
      .from("application_runs")
      .select("job_post_id")
      .eq("job_seeker_id", seeker.id)
      .in("job_post_id", qualifiedJobIds);

    const alreadyQueued = new Set([
      ...(existingQueue ?? []).map((q) => q.job_post_id),
      ...(existingRuns ?? []).map((r) => r.job_post_id),
    ]);

    const toQueue = qualifiedJobs
      .filter((j) => !alreadyQueued.has(j.job_post_id))
      .map((j) => ({
        job_seeker_id: seeker.id,
        job_post_id: j.job_post_id,
        status: "QUEUED",
        category: "auto_matched",
      }));

    if (toQueue.length > 0 && (await isActiveClient(seeker.id))) {
      const { error: queueError } = await supabaseServer
        .from("application_queue")
        .insert(toQueue);

      if (queueError) {
        errors.push(`Auto-queue insert failed: ${queueError.message}`);
      } else {
        autoQueuedCount = toQueue.length;
        // Log auto-queued jobs to activity feed (non-blocking)
        logActivity(seeker.id, {
          eventType: "jobs_auto_queued",
          title: `${toQueue.length} job${toQueue.length > 1 ? "s" : ""} auto-queued`,
          description: `Matched above ${threshold}% threshold and queued for application`,
          meta: { count: toQueue.length, threshold },
        }).catch((err) => console.error("[match:run] activity log failed:", err));
      }
    }
  }

  return Response.json({
    success: errors.length === 0,
    matched: matchedCount,
    parsed: parsedCount,
    auto_queued: autoQueuedCount,
    auto_blocked: autoBlockedCount,
    errors: errors.length > 0 ? errors : undefined,
  });
}

/**
 * GET /api/match/run
 *
 * Returns information about the matching algorithm and scoring weights.
 */
export async function GET(request: Request) {
  const opsAuth = requireOpsAuth(request.headers, request.url);
  if (!opsAuth.ok) {
    const amResult = await getAccountManagerFromRequest(request.headers);
    if ("error" in amResult) {
      return Response.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }
  }

  return Response.json({
    algorithm: "intelligent_match_v1",
    weights: {
      skills: { max: 35, description: "Skills overlap between seeker and job requirements" },
      title: { max: 20, description: "Target title alignment with job title" },
      experience: { max: 10, description: "Years of experience fit" },
      salary: { max: 10, description: "Salary range overlap percentage" },
      location: { max: 15, description: "Location/remote/hybrid preference match" },
      company_fit: { max: 10, description: "Industry and company size preferences" },
      penalties: { max: -15, description: "Exclude keywords, visa mismatch deductions" },
    },
    confidence_levels: {
      high: "Both seeker and job have rich data (70%+ fields populated)",
      medium: "Moderate data available (40-70% fields populated)",
      low: "Limited data for matching (under 40% fields populated)",
    },
    recommendations: {
      strong_match: "Score >= 75, excellent fit across multiple dimensions",
      good_match: "Score 55-74, solid fit with minor gaps",
      marginal: "Score 40-54, some alignment but notable gaps",
      poor_fit: "Score < 40, significant mismatches",
    },
  });
}
