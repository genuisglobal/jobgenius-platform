import { supabaseServer } from "@/lib/supabase/server";
import { getAccountManagerFromRequest } from "@/lib/am-access";
import { requireOpsAuth } from "@/lib/ops-auth";
import {
  computeMatchScore,
  parseJobPostSmart,
  type JobSeekerProfile,
  type JobPost,
} from "@/lib/matching";
import {
  recordMatchFeatures,
  featuresFromBreakdown,
  blendScore,
  readBlendAlpha,
  getActiveModel,
} from "@/lib/learned-ranker";

// Allow the unattended pipeline run to complete its sequential scoring writes.
// (Effective on Vercel plans that permit longer functions; a no-op otherwise.)
export const maxDuration = 300;

type RunAllPayload = {
  job_seeker_ids?: string[];
  reparse_jobs?: boolean;
  only_unscored?: boolean;
};

/**
 * POST /api/match/run-all
 *
 * Sorting Agent: Runs the matching algorithm for all active job seekers
 * against all jobs in the central Job Bank.
 *
 * This is the core "sorting agent" that:
 * 1. Loads all active seeker profiles (or specific ones)
 * 2. Loads all active job posts from the Job Bank
 * 3. Computes match scores using per-seeker custom weights
 * 4. Stores results in job_match_scores
 * 5. Jobs above each seeker's threshold become available in the extension
 *
 * Auth: AM session (runs for their assigned seekers) or OPS_AUTH (runs for all)
 */
export async function POST(request: Request) {
  let isOps = false;
  let amId: string | null = null;

  // Try OPS auth first (for cron/admin calls)
  const opsAuth = requireOpsAuth(request.headers);
  if (opsAuth.ok) {
    isOps = true;
  } else {
    // Try AM auth
    const amResult = await getAccountManagerFromRequest(request.headers);
    if ("error" in amResult) {
      return Response.json(
        { success: false, error: "Unauthorized. Requires AM session or OPS API key." },
        { status: 401 }
      );
    }
    amId = amResult.accountManager.id;
  }

  let payload: RunAllPayload = {};
  try {
    payload = await request.json();
  } catch {
    // OK - use defaults
  }

  // Get seekers to match
  let seekerIds: string[] = [];

  if (payload.job_seeker_ids && payload.job_seeker_ids.length > 0) {
    seekerIds = payload.job_seeker_ids;
  } else if (amId) {
    // Get seekers assigned to this AM
    const { data: assignments } = await supabaseServer
      .from("job_seeker_assignments")
      .select("job_seeker_id")
      .eq("account_manager_id", amId);
    seekerIds = (assignments || []).map((a) => a.job_seeker_id);
  }

  // Build seeker query
  let seekerQuery = supabaseServer
    .from("job_seekers")
    .select(`
      id, location, seniority, salary_min, salary_max, work_type,
      target_titles, skills, resume_text, match_threshold, match_weights,
      preferred_industries, preferred_company_sizes, exclude_keywords,
      years_experience, preferred_locations, open_to_relocation,
      requires_visa_sponsorship, location_preferences
    `)
    .eq("status", "active");

  if (!isOps && seekerIds.length > 0) {
    seekerQuery = seekerQuery.in("id", seekerIds);
  }

  const { data: seekers, error: seekerError } = await seekerQuery;

  if (seekerError || !seekers || seekers.length === 0) {
    return Response.json({
      success: true,
      message: "No active seekers found to match.",
      seekers_processed: 0,
      jobs_scored: 0,
    });
  }

  // Get active job posts. Capped well above the current Job Bank size (a
  // few thousand) so a run can cover the whole bank in one pass, while
  // still bounding memory/runtime if the bank grows much larger later.
  const { data: jobPosts, error: jobPostsError } = await supabaseServer
    .from("job_posts")
    .select(`
      id, url, title, company, location, description_text,
      salary_min, salary_max, seniority_level, work_type,
      years_experience_min, years_experience_max,
      required_skills, preferred_skills, industry, company_size,
      offers_visa_sponsorship, employment_type, parsed_at
    `)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (jobPostsError || !jobPosts || jobPosts.length === 0) {
    return Response.json({
      success: true,
      message: "No active jobs in the Job Bank.",
      seekers_processed: seekers.length,
      jobs_scored: 0,
    });
  }

  // Get existing scores to optionally skip already-scored pairs
  let existingScoreKeys = new Set<string>();
  if (payload.only_unscored) {
    const seekerIdList = seekers.map((s) => s.id);
    const { data: existingScores } = await supabaseServer
      .from("job_match_scores")
      .select("job_post_id, job_seeker_id")
      .in("job_seeker_id", seekerIdList);

    if (existingScores) {
      existingScoreKeys = new Set(
        existingScores.map((s) => `${s.job_seeker_id}:${s.job_post_id}`)
      );
    }
  }

  let totalScored = 0;
  let totalParsed = 0;
  const errors: string[] = [];

  // Parse jobs that need parsing. Each parse is an LLM call, so at cap-sized
  // volumes running them fully sequentially risks the function timeout on
  // its own; a small concurrency window keeps wall-clock time down without
  // hammering the LLM provider.
  const PARSE_CONCURRENCY = 8;
  const postsNeedingParse = jobPosts.filter(
    (post) => (!post.parsed_at || payload.reparse_jobs) && post.description_text
  );

  for (let i = 0; i < postsNeedingParse.length; i += PARSE_CONCURRENCY) {
    const batch = postsNeedingParse.slice(i, i + PARSE_CONCURRENCY);
    await Promise.all(
      batch.map(async (post) => {
        try {
          const parsed = await parseJobPostSmart(
            post.title,
            post.company,
            post.location,
            post.description_text
          );

          await supabaseServer
            .from("job_posts")
            .update({
              ...parsed,
              parsed_at: new Date().toISOString(),
            })
            .eq("id", post.id);

          // Update in-memory data
          Object.assign(post, parsed);
          post.parsed_at = new Date().toISOString();
          totalParsed++;
        } catch {
          // Continue with unparsed data
        }
      })
    );
  }

  // Optionally blend the learned ranker into the heuristic. Fetched once
  // up front; no-op when RANKER_BLEND_ALPHA is unset/0.
  const blendAlpha = readBlendAlpha();
  const activeModel = blendAlpha > 0 ? await getActiveModel() : null;

  // Score each seeker against each job
  for (const seekerData of seekers) {
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

    // Use custom weights if configured by the AM
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

    // Compute in-memory first, write in bulk after — at cap-sized volumes
    // (thousands of jobs x multiple seekers) one upsert per pair risks the
    // function timeout on round-trips alone; batching cuts DB calls by ~500x.
    const scoreRows: Record<string, unknown>[] = [];

    for (const post of jobPosts) {
      // Skip if only_unscored and already scored
      if (payload.only_unscored && existingScoreKeys.has(`${seeker.id}:${post.id}`)) {
        continue;
      }

      try {
        const job: JobPost = {
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

        const matchResult = computeMatchScore(seeker, job, weights);
        const features = featuresFromBreakdown(matchResult.component_scores, weights);
        const finalScore = activeModel
          ? blendScore({
              heuristic: matchResult.score,
              features,
              weights: activeModel.weights,
              alpha: blendAlpha,
            })
          : matchResult.score;

        scoreRows.push({
          job_post_id: post.id,
          job_seeker_id: seeker.id,
          score: finalScore,
          confidence: matchResult.confidence,
          recommendation: matchResult.recommendation,
          // A rescore always reflects current data — clear any prior
          // soft-archive (see api/ops/clean-matches) so it's not hidden
          // from the Job Hub despite being freshly computed.
          archived_at: null,
          archive_reason: null,
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
        });

        void recordMatchFeatures({
          jobSeekerId: seeker.id,
          jobPostId: post.id,
          heuristicScore: matchResult.score,
          features,
        });

        totalScored++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`Error scoring seeker ${seeker.id} / job ${post.id}: ${message}`);
      }
    }

    const UPSERT_CHUNK_SIZE = 500;
    for (let i = 0; i < scoreRows.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = scoreRows.slice(i, i + UPSERT_CHUNK_SIZE);
      const { error: upsertError } = await supabaseServer
        .from("job_match_scores")
        .upsert(chunk, { onConflict: "job_post_id,job_seeker_id" });
      if (upsertError) {
        errors.push(
          `Error writing ${chunk.length} scores for seeker ${seeker.id}: ${upsertError.message}`
        );
      }
    }
  }

  return Response.json({
    success: errors.length === 0,
    seekers_processed: seekers.length,
    jobs_in_bank: jobPosts.length,
    jobs_parsed: totalParsed,
    jobs_scored: totalScored,
    errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
  });
}

/**
 * GET /api/match/run-all
 *
 * Returns sorting agent status and documentation.
 */
export async function GET() {
  const { count: totalJobs } = await supabaseServer
    .from("job_posts")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  const { count: totalSeekers } = await supabaseServer
    .from("job_seekers")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  const { count: totalScores } = await supabaseServer
    .from("job_match_scores")
    .select("id", { count: "exact", head: true });

  return Response.json({
    agent: "sorting_agent_v1",
    description: "Compares all jobseeker profiles against the central Job Bank and pushes matched jobs based on score percentages.",
    status: {
      active_jobs: totalJobs ?? 0,
      active_seekers: totalSeekers ?? 0,
      total_match_scores: totalScores ?? 0,
    },
    usage: {
      POST: {
        description: "Run sorting agent for all seekers",
        body: {
          job_seeker_ids: "optional - array of specific seeker IDs",
          reparse_jobs: "optional - force re-extraction of job structured data",
          only_unscored: "optional - skip already-scored pairs for efficiency",
        },
        auth: "AM session cookie or OPS_API_KEY header",
      },
    },
  });
}
