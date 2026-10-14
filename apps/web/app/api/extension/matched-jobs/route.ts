import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { verifyExtensionSession } from "@/lib/extension-auth";
import {
  buildAdjacentOpportunity,
  buildMatchExplanation,
} from "@/lib/matching/explanations";

type JobPostRow = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  work_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  seniority_level: string | null;
  is_active: boolean | null;
  created_at: string;
};

type MatchRow = {
  score: number | null;
  confidence: string | null;
  recommendation: string | null;
  reasons: Record<string, unknown> | null;
  job_posts: JobPostRow | JobPostRow[] | null;
};

type QueueRow = {
  id: string;
  job_post_id: string;
  status: string;
  last_error: string | null;
  updated_at: string | null;
};

type RunRow = {
  id: string;
  job_post_id: string | null;
  status: string;
  current_step: string | null;
  last_error: string | null;
  last_error_code: string | null;
  needs_attention_reason: string | null;
  updated_at: string | null;
};

type MatchScoreRow = {
  job_post_id: string;
  score: number | null;
  confidence: string | null;
  recommendation: string | null;
  reasons: Record<string, unknown> | null;
};

type JobCard = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  work_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  seniority_level: string | null;
  created_at: string;
  score: number | null;
  confidence: string | null;
  recommendation: string | null;
  reasons: Record<string, unknown> | null;
  match_lane: "primary" | "adjacent";
  adjacent_reason: string | null;
  adjacent_supporting_reasons: string[];
};

function resolveSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] ?? null : value;
}

function toEpoch(value: string | null | undefined) {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function putIfNewer<T extends { updated_at: string | null }>(
  map: Map<string, T>,
  key: string,
  row: T
) {
  const existing = map.get(key);
  if (!existing || toEpoch(row.updated_at) >= toEpoch(existing.updated_at)) {
    map.set(key, row);
  }
}

/**
 * GET /api/extension/matched-jobs
 *
 * Returns matched jobs for the active job seeker in the extension session.
 * Includes jobs in NEEDS_ATTENTION so extension can resume/handoff workflows,
 * plus a separate adjacent lane for below-threshold roles with strong
 * underlying fit but weaker title alignment.
 */
export async function GET(request: Request) {
  try {
    const session = await verifyExtensionSession(request);
    if (!session) {
      return NextResponse.json(
        { error: "Invalid or expired token." },
        { status: 401 }
      );
    }

    if (!session.active_job_seeker_id) {
      return NextResponse.json(
        { error: "No active job seeker selected." },
        { status: 400 }
      );
    }

    // Get seeker match threshold
    const { data: seeker } = await supabaseAdmin
      .from("job_seekers")
      .select("match_threshold")
      .eq("id", session.active_job_seeker_id)
      .single();

    const threshold = seeker?.match_threshold ?? 50;
    const adjacentFloor = Math.max(40, threshold - 15);

    // Base list: matched jobs above threshold
    const { data: matches, error: matchError } = await supabaseAdmin
      .from("job_match_scores")
      .select(`
        score,
        confidence,
        recommendation,
        reasons,
        job_posts!inner (
          id,
          title,
          company,
          location,
          url,
          work_type,
          salary_min,
          salary_max,
          seniority_level,
          is_active,
          created_at
        )
      `)
      .eq("job_seeker_id", session.active_job_seeker_id)
      .is("archived_at", null)
      .gte("score", threshold)
      .order("score", { ascending: false })
      .limit(100);

    if (matchError) {
      console.error("Error fetching matched jobs:", matchError);
      return NextResponse.json(
        { error: "Failed to fetch matched jobs." },
        { status: 500 }
      );
    }

    const matchRows = (matches ?? []) as MatchRow[];
    const jobCards = new Map<string, JobCard>();

    for (const matchRow of matchRows) {
      const jobPost = resolveSingle(matchRow.job_posts);
      if (!jobPost?.id) {
        continue;
      }

      jobCards.set(jobPost.id, {
        id: jobPost.id,
        title: jobPost.title,
        company: jobPost.company,
        location: jobPost.location,
        url: jobPost.url,
        work_type: jobPost.work_type,
        salary_min: jobPost.salary_min,
        salary_max: jobPost.salary_max,
        seniority_level: jobPost.seniority_level,
        created_at: jobPost.created_at,
        score: matchRow.score,
        confidence: matchRow.confidence,
        recommendation: matchRow.recommendation,
        reasons: matchRow.reasons,
        match_lane: "primary",
        adjacent_reason: null,
        adjacent_supporting_reasons: [],
      });
    }

    const adjacentCandidates: Array<{
      jobPost: JobPostRow;
      matchRow: MatchRow;
      headline: string;
      supportingReasons: string[];
    }> = [];

    if (threshold > adjacentFloor) {
      const { data: adjacentMatches, error: adjacentError } = await supabaseAdmin
        .from("job_match_scores")
        .select(`
          score,
          confidence,
          recommendation,
          reasons,
          job_posts!inner (
            id,
            title,
            company,
            location,
            url,
            work_type,
            salary_min,
            salary_max,
            seniority_level,
            is_active,
            created_at
          )
        `)
        .eq("job_seeker_id", session.active_job_seeker_id)
        .is("archived_at", null)
        .lt("score", threshold)
        .gte("score", adjacentFloor)
        .order("score", { ascending: false })
        .limit(80);

      if (adjacentError) {
        console.error("Error fetching adjacent matched jobs:", adjacentError);
        return NextResponse.json(
          { error: "Failed to fetch adjacent matched jobs." },
          { status: 500 }
        );
      }

      for (const matchRow of (adjacentMatches ?? []) as MatchRow[]) {
        const jobPost = resolveSingle(matchRow.job_posts);
        if (!jobPost?.id || jobCards.has(jobPost.id)) {
          continue;
        }

        const adjacent = buildAdjacentOpportunity(matchRow.reasons, {
          score: matchRow.score ?? null,
          confidence: matchRow.confidence ?? null,
          recommendation: matchRow.recommendation ?? null,
          threshold,
        });

        if (!adjacent.eligible || !adjacent.headline) {
          continue;
        }

        adjacentCandidates.push({
          jobPost,
          matchRow,
          headline: adjacent.headline,
          supportingReasons: adjacent.supportingReasons,
        });
      }
    }

    // Always include historical NEEDS_ATTENTION runs, even if score fell below threshold.
    const { data: attentionRunRows, error: attentionError } = await supabaseAdmin
      .from("application_runs")
      .select(
        "id, job_post_id, status, current_step, last_error, last_error_code, needs_attention_reason, updated_at"
      )
      .eq("job_seeker_id", session.active_job_seeker_id)
      .eq("status", "NEEDS_ATTENTION");

    if (attentionError) {
      console.error("Error loading needs-attention runs:", attentionError);
      return NextResponse.json(
        { error: "Failed to load needs-attention runs." },
        { status: 500 }
      );
    }

    const attentionRuns = ((attentionRunRows ?? []) as RunRow[]).filter(
      (row) => !!row.job_post_id
    );
    const attentionByJobId = new Map<string, RunRow>();
    for (const run of attentionRuns) {
      if (!run.job_post_id) {
        continue;
      }
      putIfNewer(attentionByJobId, run.job_post_id, run);
    }

    const missingAttentionJobIds = Array.from(attentionByJobId.keys()).filter(
      (jobId) => !jobCards.has(jobId)
    );

    if (missingAttentionJobIds.length > 0) {
      const [{ data: attentionPosts }, { data: attentionScores }] =
        await Promise.all([
          supabaseAdmin
            .from("job_posts")
            .select(
              "id, title, company, location, url, work_type, salary_min, salary_max, seniority_level, created_at"
            )
            .in("id", missingAttentionJobIds),
          supabaseAdmin
            .from("job_match_scores")
            .select("job_post_id, score, confidence, recommendation, reasons")
            .eq("job_seeker_id", session.active_job_seeker_id)
            .in("job_post_id", missingAttentionJobIds),
        ]);

      const scoreByJobId = new Map(
        ((attentionScores ?? []) as MatchScoreRow[]).map((row) => [
          row.job_post_id,
          row,
        ])
      );

      for (const post of (attentionPosts ?? []) as JobPostRow[]) {
        const score = scoreByJobId.get(post.id);
        jobCards.set(post.id, {
          id: post.id,
          title: post.title,
          company: post.company,
          location: post.location,
          url: post.url,
          work_type: post.work_type,
          salary_min: post.salary_min,
          salary_max: post.salary_max,
          seniority_level: post.seniority_level,
          created_at: post.created_at,
          score: score?.score ?? null,
          confidence: score?.confidence ?? null,
          recommendation: score?.recommendation ?? null,
          reasons: score?.reasons ?? null,
          match_lane: "primary",
          adjacent_reason: null,
          adjacent_supporting_reasons: [],
        });
      }
    }

    const adjacentCards = new Map<string, JobCard>();
    for (const candidate of adjacentCandidates) {
      if (jobCards.has(candidate.jobPost.id)) {
        continue;
      }

      adjacentCards.set(candidate.jobPost.id, {
        id: candidate.jobPost.id,
        title: candidate.jobPost.title,
        company: candidate.jobPost.company,
        location: candidate.jobPost.location,
        url: candidate.jobPost.url,
        work_type: candidate.jobPost.work_type,
        salary_min: candidate.jobPost.salary_min,
        salary_max: candidate.jobPost.salary_max,
        seniority_level: candidate.jobPost.seniority_level,
        created_at: candidate.jobPost.created_at,
        score: candidate.matchRow.score,
        confidence: candidate.matchRow.confidence,
        recommendation: candidate.matchRow.recommendation,
        reasons: candidate.matchRow.reasons,
        match_lane: "adjacent",
        adjacent_reason: candidate.headline,
        adjacent_supporting_reasons: candidate.supportingReasons,
      });
    }

    const allJobIds = Array.from(
      new Set(
        Array.from(jobCards.keys()).concat(Array.from(adjacentCards.keys()))
      )
    );
    if (allJobIds.length === 0) {
      return NextResponse.json({
        jobs: [],
        adjacent_jobs: [],
        threshold,
        adjacent_floor: adjacentFloor,
        total: 0,
        tracked_total: 0,
        adjacent_total: 0,
        needs_attention_total: 0,
      });
    }

    const [{ data: queueRows }, { data: runRows }] = await Promise.all([
      supabaseAdmin
        .from("application_queue")
        .select("id, job_post_id, status, last_error, updated_at")
        .eq("job_seeker_id", session.active_job_seeker_id)
        .in("job_post_id", allJobIds),
      supabaseAdmin
        .from("application_runs")
        .select(
          "id, job_post_id, status, current_step, last_error, last_error_code, needs_attention_reason, updated_at"
        )
        .eq("job_seeker_id", session.active_job_seeker_id)
        .in("job_post_id", allJobIds),
    ]);

    const queueByJobId = new Map<string, QueueRow>();
    for (const row of (queueRows ?? []) as QueueRow[]) {
      putIfNewer(queueByJobId, row.job_post_id, row);
    }

    const runByJobId = new Map<string, RunRow>();
    for (const row of (runRows ?? []) as RunRow[]) {
      if (!row.job_post_id) {
        continue;
      }
      putIfNewer(runByJobId, row.job_post_id, row);
    }

    const materializeJob = (job: JobCard) => {
      const queue = queueByJobId.get(job.id);
      const run = runByJobId.get(job.id) ?? attentionByJobId.get(job.id) ?? null;
      const queueStatus = queue?.status ?? run?.status ?? null;
      const needsAttention = queueStatus === "NEEDS_ATTENTION";
      const explanation = buildMatchExplanation(job.reasons, {
        score: job.score ?? null,
        confidence: job.confidence ?? null,
        recommendation: job.recommendation ?? null,
      });
      const { reasons: _reasons, ...jobCard } = job;

      return {
        ...jobCard,
        queue_status: queueStatus,
        queue_id: queue?.id ?? null,
        run_id: run?.id ?? null,
        run_status: run?.status ?? null,
        current_step: run?.current_step ?? null,
        last_error: run?.last_error ?? queue?.last_error ?? null,
        last_error_code: run?.last_error_code ?? null,
        needs_attention_reason: run?.needs_attention_reason ?? null,
        needs_attention: needsAttention,
        updated_at: run?.updated_at ?? queue?.updated_at ?? null,
        score_summary:
          job.match_lane === "adjacent" && job.adjacent_supporting_reasons.length > 0
            ? job.adjacent_supporting_reasons
            : explanation.highlights,
        score_blockers: [...explanation.blockers, ...explanation.cautions],
        queue_blocked: explanation.queueBlocked,
        queue_block_reason: explanation.queueBlockReason,
        manual_review_recommended: job.match_lane === "adjacent",
      };
    };

    const jobs = Array.from(jobCards.values())
      .map(materializeJob)
      .sort((a, b) => {
        if (a.needs_attention !== b.needs_attention) {
          return a.needs_attention ? -1 : 1;
        }
        const scoreA = Number.isFinite(a.score ?? NaN) ? (a.score as number) : -1;
        const scoreB = Number.isFinite(b.score ?? NaN) ? (b.score as number) : -1;
        if (scoreA !== scoreB) {
          return scoreB - scoreA;
        }
        return toEpoch(b.created_at) - toEpoch(a.created_at);
      });

    const adjacentJobs = Array.from(adjacentCards.values())
      .map(materializeJob)
      .sort((a, b) => {
        const scoreA = Number.isFinite(a.score ?? NaN) ? (a.score as number) : -1;
        const scoreB = Number.isFinite(b.score ?? NaN) ? (b.score as number) : -1;
        if (scoreA !== scoreB) {
          return scoreB - scoreA;
        }
        return toEpoch(b.created_at) - toEpoch(a.created_at);
      });

    return NextResponse.json({
      jobs,
      adjacent_jobs: adjacentJobs,
      threshold,
      adjacent_floor: adjacentFloor,
      total: jobs.length + adjacentJobs.length,
      tracked_total: jobs.length,
      adjacent_total: adjacentJobs.length,
      needs_attention_total: jobs.filter((job) => job.needs_attention).length,
    });
  } catch (error) {
    console.error("Extension matched-jobs error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
