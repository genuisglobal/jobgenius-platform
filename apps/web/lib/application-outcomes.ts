import { supabaseAdmin } from "@/lib/auth";

/**
 * Application outcome tracking (Lean v1) — the DB rollup.
 *
 * NOTE: distinct from `lib/outcomes.ts`, which is the business funnel EVENT
 * ledger (leads → consultations → payments → placements). This module is only
 * about application→interview CONVERSION for the auto-apply pipeline.
 *
 * The pure summary logic lives in `application-outcomes-summary.ts` and is
 * re-exported here so callers have a single import surface. `refreshOutcomes`
 * materializes the rows from existing tables and re-evaluates still-pending
 * applications so late interviews / rejections are caught.
 */

export {
  summarizeOutcomes,
  MIN_SAMPLE,
} from "@/lib/application-outcomes-summary";
export type {
  OutcomeRow,
  Segment,
  KeyedSegment,
  OutcomeSummary,
} from "@/lib/application-outcomes-summary";

// ─── Rollup ───────────────────────────────────────────────────────────

const SUBMITTED_STATUSES = ["APPLIED", "COMPLETED"];
const DAY_MS = 24 * 60 * 60 * 1000;

type Candidate = {
  job_seeker_id: string;
  job_post_id: string;
  application_run_id: string | null;
  ats_type: string | null;
  submitted_at: string;
};

function pairKey(seekerId: string, jobId: string) {
  return `${seekerId}::${jobId}`;
}

export interface RefreshResult {
  processed: number;
  interviews: number;
  rejected: number;
  no_response: number;
}

/**
 * Materialize / refresh application_outcomes.
 * @param windowDays  how far back to ingest newly-submitted applications
 * @param noResponseDays  after this long with no interview/rejection → no_response
 */
export async function refreshOutcomes(
  windowDays = 45,
  noResponseDays = 21
): Promise<RefreshResult> {
  const since = new Date(Date.now() - windowDays * DAY_MS).toISOString();

  const candidates = new Map<string, Candidate>();

  // (a) Newly-submitted applications in the window.
  const { data: runs } = await supabaseAdmin
    .from("application_runs")
    .select("id, job_seeker_id, job_post_id, ats_type, status, updated_at, created_at")
    .in("status", SUBMITTED_STATUSES)
    .gte("updated_at", since);

  for (const run of runs ?? []) {
    if (!run.job_seeker_id || !run.job_post_id) continue;
    const submittedAt = run.updated_at ?? run.created_at;
    if (!submittedAt) continue;
    const key = pairKey(run.job_seeker_id, run.job_post_id);
    const existing = candidates.get(key);
    // Keep the earliest submission for the pair.
    if (!existing || submittedAt < existing.submitted_at) {
      candidates.set(key, {
        job_seeker_id: run.job_seeker_id,
        job_post_id: run.job_post_id,
        application_run_id: run.id,
        ats_type: run.ats_type ?? null,
        submitted_at: submittedAt,
      });
    }
  }

  // (b) Still-pending outcome rows — re-evaluate so late interviews/rejections
  //     and the no-response cutoff are picked up on subsequent runs.
  const { data: pending } = await supabaseAdmin
    .from("application_outcomes")
    .select("job_seeker_id, job_post_id, application_run_id, ats_type, submitted_at")
    .eq("outcome", "applied");

  for (const row of pending ?? []) {
    const key = pairKey(row.job_seeker_id, row.job_post_id);
    if (!candidates.has(key)) {
      candidates.set(key, {
        job_seeker_id: row.job_seeker_id,
        job_post_id: row.job_post_id,
        application_run_id: row.application_run_id ?? null,
        ats_type: row.ats_type ?? null,
        submitted_at: row.submitted_at,
      });
    }
  }

  if (candidates.size === 0) {
    return { processed: 0, interviews: 0, rejected: 0, no_response: 0 };
  }

  const list = Array.from(candidates.values());
  const seekerIds = Array.from(new Set(list.map((c) => c.job_seeker_id)));
  const jobIds = Array.from(new Set(list.map((c) => c.job_post_id)));

  const [
    { data: scores },
    { data: tailored },
    { data: interviews },
    { data: feedback },
    { data: assignments },
    { data: answerStats },
  ] = await Promise.all([
    supabaseAdmin
      .from("job_match_scores")
      .select("job_seeker_id, job_post_id, score, recommendation")
      .in("job_seeker_id", seekerIds)
      .in("job_post_id", jobIds),
    supabaseAdmin
      .from("tailored_resumes")
      .select("job_seeker_id, job_post_id")
      .in("job_seeker_id", seekerIds)
      .in("job_post_id", jobIds),
    supabaseAdmin
      .from("interviews")
      .select("job_seeker_id, job_post_id, scheduled_at, created_at, status")
      .in("job_seeker_id", seekerIds)
      .in("job_post_id", jobIds),
    supabaseAdmin
      .from("application_feedback")
      .select("job_seeker_id, job_post_id, feedback_type, rejection_category, created_at")
      .in("job_seeker_id", seekerIds)
      .in("job_post_id", jobIds),
    supabaseAdmin
      .from("job_seeker_assignments")
      .select("job_seeker_id, account_manager_id")
      .in("job_seeker_id", seekerIds),
    supabaseAdmin
      .from("application_answer_stats")
      .select(
        "job_seeker_id, job_post_id, ai_answer_count, memory_answer_count, screening_answer_count, default_answer_count"
      )
      .in("job_seeker_id", seekerIds)
      .in("job_post_id", jobIds),
  ]);

  const scoreByPair = new Map<string, { score: number | null; recommendation: string | null }>();
  for (const s of scores ?? []) {
    scoreByPair.set(pairKey(s.job_seeker_id, s.job_post_id), {
      score: s.score,
      recommendation: s.recommendation,
    });
  }

  const tailoredPairs = new Set<string>();
  for (const t of tailored ?? []) {
    tailoredPairs.add(pairKey(t.job_seeker_id, t.job_post_id));
  }

  // Earliest non-cancelled interview per pair = the interview invite.
  const interviewByPair = new Map<string, string>();
  for (const iv of interviews ?? []) {
    if (String(iv.status) === "cancelled") continue;
    const at = iv.scheduled_at ?? iv.created_at;
    if (!at) continue;
    const key = pairKey(iv.job_seeker_id, iv.job_post_id);
    const existing = interviewByPair.get(key);
    if (!existing || at < existing) interviewByPair.set(key, at);
  }

  const rejectionByPair = new Map<string, { at: string; category: string | null }>();
  for (const f of feedback ?? []) {
    if (f.feedback_type !== "application_rejected") continue;
    const key = pairKey(f.job_seeker_id, f.job_post_id);
    if (!rejectionByPair.has(key)) {
      rejectionByPair.set(key, { at: f.created_at, category: f.rejection_category ?? null });
    }
  }

  const amBySeeker = new Map<string, string>();
  for (const a of assignments ?? []) {
    if (!amBySeeker.has(a.job_seeker_id) && a.account_manager_id) {
      amBySeeker.set(a.job_seeker_id, a.account_manager_id);
    }
  }

  const answersByPair = new Map<
    string,
    {
      ai: number | null;
      memory: number | null;
      screening: number | null;
      default: number | null;
    }
  >();
  for (const s of answerStats ?? []) {
    answersByPair.set(pairKey(s.job_seeker_id, s.job_post_id), {
      ai: s.ai_answer_count ?? null,
      memory: s.memory_answer_count ?? null,
      screening: s.screening_answer_count ?? null,
      default: s.default_answer_count ?? null,
    });
  }

  const now = Date.now();
  let interviewsCount = 0;
  let rejectedCount = 0;
  let noResponseCount = 0;

  const upsertRows = list.map((c) => {
    const key = pairKey(c.job_seeker_id, c.job_post_id);
    const score = scoreByPair.get(key);
    const interviewAt = interviewByPair.get(key);
    const rejection = rejectionByPair.get(key);

    let outcome = "applied";
    let firstInterviewAt: string | null = null;
    let daysToInterview: number | null = null;
    let rejectedAt: string | null = null;
    let rejectionCategory: string | null = null;

    if (interviewAt) {
      outcome = "interview";
      firstInterviewAt = interviewAt;
      const delta =
        (new Date(interviewAt).getTime() - new Date(c.submitted_at).getTime()) / DAY_MS;
      daysToInterview = delta >= 0 ? Math.round(delta * 10) / 10 : null;
      interviewsCount += 1;
    } else if (rejection) {
      outcome = "rejected";
      rejectedAt = rejection.at;
      rejectionCategory = rejection.category;
      rejectedCount += 1;
    } else if (now - new Date(c.submitted_at).getTime() > noResponseDays * DAY_MS) {
      outcome = "no_response";
      noResponseCount += 1;
    }

    // Answer-source counts come from the side table (application_answer_stats),
    // captured by the extension at fill time. Null when no fill was recorded.
    const answers = answersByPair.get(key);
    return {
      job_seeker_id: c.job_seeker_id,
      job_post_id: c.job_post_id,
      application_run_id: c.application_run_id,
      account_manager_id: amBySeeker.get(c.job_seeker_id) ?? null,
      ats_type: c.ats_type,
      submitted_at: c.submitted_at,
      match_score: score?.score ?? null,
      recommendation: score?.recommendation ?? null,
      resume_tailored: tailoredPairs.has(key),
      ai_answer_count: answers?.ai ?? null,
      memory_answer_count: answers?.memory ?? null,
      screening_answer_count: answers?.screening ?? null,
      default_answer_count: answers?.default ?? null,
      outcome,
      first_interview_at: firstInterviewAt,
      days_to_interview: daysToInterview,
      rejected_at: rejectedAt,
      rejection_category: rejectionCategory,
      computed_at: new Date().toISOString(),
    };
  });

  // Upsert in batches to stay within statement limits on large backfills.
  const BATCH = 500;
  for (let i = 0; i < upsertRows.length; i += BATCH) {
    const chunk = upsertRows.slice(i, i + BATCH);
    const { error } = await supabaseAdmin
      .from("application_outcomes")
      .upsert(chunk, { onConflict: "job_seeker_id,job_post_id" });
    if (error) {
      throw new Error(`application_outcomes upsert failed: ${error.message}`);
    }
  }

  return {
    processed: upsertRows.length,
    interviews: interviewsCount,
    rejected: rejectedCount,
    no_response: noResponseCount,
  };
}
