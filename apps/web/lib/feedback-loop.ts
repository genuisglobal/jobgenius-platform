/**
 * Rejection Feedback Loop
 *
 * Captures rejection signals, categorizes them, and feeds back
 * into the matching algorithm to improve future match quality.
 */

import { supabaseServer } from "@/lib/supabase/server";
import { updateMatchOutcome, type MatchOutcome } from "@/lib/learned-ranker";

function feedbackTypeToMatchOutcome(
  feedbackType: string
): MatchOutcome | null {
  if (feedbackType === "application_rejected" || feedbackType === "interview_rejected") {
    return "rejection";
  }
  if (feedbackType === "ghosted") return "ghosted";
  if (feedbackType === "withdrawn") return "rejection";
  return null; // ats_failure et al. — not a ranking signal
}

export type FeedbackType =
  | "application_rejected"
  | "interview_rejected"
  | "ghosted"
  | "withdrawn"
  | "ats_failure";

export type RejectionCategory =
  | "experience_mismatch"
  | "skills_gap"
  | "overqualified"
  | "underqualified"
  | "salary_mismatch"
  | "location_mismatch"
  | "culture_fit"
  | "visa_sponsorship"
  | "internal_candidate"
  | "position_filled"
  | "company_freeze"
  | "no_response"
  | "other";

type RecordFeedbackInput = {
  jobSeekerId: string;
  jobPostId?: string;
  runId?: string;
  interviewId?: string;
  feedbackType: FeedbackType;
  rejectionReason?: string;
  rejectionCategory?: RejectionCategory;
  source?: "manual" | "auto_detected" | "gmail_scan" | "am_recorded";
  atsType?: string;
  company?: string;
  roleTitle?: string;
  notes?: string;
  createdBy?: string;
};

export async function recordFeedback(input: RecordFeedbackInput) {
  const { data, error } = await supabaseServer
    .from("application_feedback")
    .insert({
      job_seeker_id: input.jobSeekerId,
      job_post_id: input.jobPostId ?? null,
      run_id: input.runId ?? null,
      interview_id: input.interviewId ?? null,
      feedback_type: input.feedbackType,
      rejection_reason: input.rejectionReason ?? null,
      rejection_category: input.rejectionCategory ?? null,
      source: input.source ?? "manual",
      ats_type: input.atsType ?? null,
      company: input.company ?? null,
      role_title: input.roleTitle ?? null,
      notes: input.notes ?? null,
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();

  if (error) throw error;

  // Log to activity feed
  await logActivity(input.jobSeekerId, {
    eventType: "feedback_recorded",
    title: `Feedback: ${input.feedbackType.replace(/_/g, " ")}`,
    description: input.rejectionCategory
      ? `${input.company ?? "Company"} — ${input.rejectionCategory.replace(/_/g, " ")}`
      : `${input.company ?? "Unknown company"} — ${input.feedbackType.replace(/_/g, " ")}`,
    meta: {
      feedback_id: data.id,
      category: input.rejectionCategory,
      company: input.company,
    },
    refType: "application_feedback",
    refId: data.id,
  });

  // Auto-trigger weight adjustment if enough feedback has accumulated
  tryAutoAdjustWeights(input.jobSeekerId).catch((err) =>
    console.error("[feedback-loop] auto weight adjustment failed:", err)
  );

  // Stamp the learned-ranker outcome on the (seeker, job_post) feature row,
  // when we have a job_post_id and the feedback maps to a meaningful label.
  if (input.jobPostId) {
    const outcome = feedbackTypeToMatchOutcome(input.feedbackType);
    if (outcome) {
      void updateMatchOutcome({
        jobSeekerId: input.jobSeekerId,
        jobPostId: input.jobPostId,
        outcome,
      });
    }
  }

  return data;
}

/**
 * Analyze rejection patterns for a seeker and suggest weight adjustments
 */
export async function analyzeRejectionPatterns(jobSeekerId: string) {
  const { data: feedback } = await supabaseServer
    .from("application_feedback")
    .select("rejection_category, feedback_type, ats_type, company, created_at")
    .eq("job_seeker_id", jobSeekerId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!feedback || feedback.length < 3) {
    return { hasEnoughData: false, suggestions: [] };
  }

  const categoryCounts: Record<string, number> = {};
  for (const f of feedback) {
    if (f.rejection_category) {
      categoryCounts[f.rejection_category] = (categoryCounts[f.rejection_category] || 0) + 1;
    }
  }

  const total = feedback.length;
  const suggestions: { weight: string; direction: "increase" | "decrease"; reason: string }[] = [];

  // If >30% rejections are skills_gap, increase skills weight
  if ((categoryCounts["skills_gap"] || 0) / total > 0.3) {
    suggestions.push({
      weight: "skills",
      direction: "increase",
      reason: `${categoryCounts["skills_gap"]} of ${total} rejections cite skills gap`,
    });
  }

  // If >25% are salary_mismatch, increase salary weight
  if ((categoryCounts["salary_mismatch"] || 0) / total > 0.25) {
    suggestions.push({
      weight: "salary",
      direction: "increase",
      reason: `${categoryCounts["salary_mismatch"]} of ${total} rejections cite salary mismatch`,
    });
  }

  // If >25% are experience_mismatch or overqualified/underqualified
  const expIssues = (categoryCounts["experience_mismatch"] || 0) +
    (categoryCounts["overqualified"] || 0) +
    (categoryCounts["underqualified"] || 0);
  if (expIssues / total > 0.25) {
    suggestions.push({
      weight: "experience",
      direction: "increase",
      reason: `${expIssues} of ${total} rejections relate to experience level`,
    });
  }

  // If >20% are location_mismatch, increase location weight
  if ((categoryCounts["location_mismatch"] || 0) / total > 0.2) {
    suggestions.push({
      weight: "location",
      direction: "increase",
      reason: `${categoryCounts["location_mismatch"]} of ${total} rejections cite location issues`,
    });
  }

  // If >15% are visa_sponsorship, increase penalty weight
  if ((categoryCounts["visa_sponsorship"] || 0) / total > 0.15) {
    suggestions.push({
      weight: "max_penalty",
      direction: "increase",
      reason: `${categoryCounts["visa_sponsorship"]} of ${total} rejections cite visa/sponsorship`,
    });
  }

  // ATS-specific failure patterns
  const atsCounts: Record<string, { total: number; rejected: number }> = {};
  for (const f of feedback) {
    if (f.ats_type) {
      if (!atsCounts[f.ats_type]) atsCounts[f.ats_type] = { total: 0, rejected: 0 };
      atsCounts[f.ats_type].total++;
      if (f.feedback_type === "application_rejected" || f.feedback_type === "ats_failure") {
        atsCounts[f.ats_type].rejected++;
      }
    }
  }

  // Flag ATS types with > 60% rejection rate
  const problematicAts: { atsType: string; rejectionRate: number }[] = [];
  for (const [atsType, counts] of Object.entries(atsCounts)) {
    if (counts.total >= 3) {
      const rate = counts.rejected / counts.total;
      if (rate > 0.6) {
        problematicAts.push({ atsType, rejectionRate: Math.round(rate * 100) });
      }
    }
  }

  return {
    hasEnoughData: true,
    totalFeedback: total,
    categoryCounts,
    suggestions,
    problematicAts,
  };
}

/**
 * Apply weight adjustments based on feedback analysis
 */
export async function applyWeightAdjustment(
  jobSeekerId: string,
  triggerType: "rejection_feedback" | "manual" | "auto_tune",
  reason: string
) {
  // Get current weights
  const { data: seeker } = await supabaseServer
    .from("job_seekers")
    .select("match_weights")
    .eq("id", jobSeekerId)
    .single();

  const currentWeights = seeker?.match_weights ?? {
    skills: 35, title: 20, experience: 10, salary: 10,
    location: 15, company_fit: 10, max_penalty: 15,
  };

  const analysis = await analyzeRejectionPatterns(jobSeekerId);
  if (!analysis.hasEnoughData || !analysis.suggestions?.length) return null;

  const newWeights = { ...currentWeights };
  const STEP = 5;

  for (const s of analysis.suggestions) {
    const key = s.weight as keyof typeof newWeights;
    if (key in newWeights) {
      if (s.direction === "increase") {
        newWeights[key] = Math.min(50, (newWeights[key] as number) + STEP);
      } else {
        newWeights[key] = Math.max(5, (newWeights[key] as number) - STEP);
      }
    }
  }

  // Normalize to 100 (excluding max_penalty)
  const mainKeys = ["skills", "title", "experience", "salary", "location", "company_fit"] as const;
  const mainTotal = mainKeys.reduce((s, k) => s + (newWeights[k] as number), 0);
  if (mainTotal !== 100) {
    const factor = 100 / mainTotal;
    for (const k of mainKeys) {
      newWeights[k] = Math.round((newWeights[k] as number) * factor);
    }
  }

  // Record adjustment
  await supabaseServer.from("match_weight_adjustments").insert({
    job_seeker_id: jobSeekerId,
    trigger_type: triggerType,
    previous_weights: currentWeights,
    new_weights: newWeights,
    reason,
  });

  // Apply new weights
  await supabaseServer
    .from("job_seekers")
    .update({ match_weights: newWeights })
    .eq("id", jobSeekerId);

  return { previousWeights: currentWeights, newWeights, suggestions: analysis.suggestions };
}

/**
 * Auto-trigger weight adjustment after feedback accumulates.
 * Only applies if: (a) enough data exists, (b) meaningful suggestions found,
 * and (c) no adjustment was made in the last 7 days for this seeker.
 */
async function tryAutoAdjustWeights(jobSeekerId: string) {
  // Check if we recently adjusted (avoid thrashing)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: recentAdj } = await supabaseServer
    .from("match_weight_adjustments")
    .select("id")
    .eq("job_seeker_id", jobSeekerId)
    .gte("created_at", sevenDaysAgo)
    .limit(1);

  if (recentAdj && recentAdj.length > 0) return; // Already adjusted recently

  const analysis = await analyzeRejectionPatterns(jobSeekerId);
  if (!analysis.hasEnoughData || !analysis.suggestions?.length) return;

  // Only auto-apply if there are strong signals (>= 2 suggestions or one very dominant pattern)
  const dominated = analysis.suggestions.some((s) => {
    const count = analysis.categoryCounts?.[
      s.weight === "max_penalty" ? "visa_sponsorship" :
      s.weight === "experience" ? "experience_mismatch" :
      `${s.weight}_mismatch` as string
    ] ?? 0;
    return count / (analysis.totalFeedback ?? 1) > 0.4;
  });

  if (analysis.suggestions.length < 2 && !dominated) return;

  await applyWeightAdjustment(
    jobSeekerId,
    "auto_tune",
    `Auto-adjusted: ${analysis.suggestions.map((s) => `${s.direction} ${s.weight}`).join(", ")}`
  );

  await logActivity(jobSeekerId, {
    eventType: "weights_auto_adjusted",
    title: "Match weights auto-tuned",
    description: `Based on ${analysis.totalFeedback} rejection signals: ${analysis.suggestions.map((s) => `${s.direction} ${s.weight}`).join(", ")}`,
    meta: { suggestions: analysis.suggestions, totalFeedback: analysis.totalFeedback },
  });
}

// ─── Activity Feed Helper ────────────────────────────────

export async function logActivity(
  jobSeekerId: string,
  event: {
    eventType: string;
    title: string;
    description?: string;
    meta?: Record<string, unknown>;
    refType?: string;
    refId?: string;
  }
) {
  await supabaseServer.from("seeker_activity_feed").insert({
    job_seeker_id: jobSeekerId,
    event_type: event.eventType,
    title: event.title,
    description: event.description ?? null,
    meta: event.meta ?? {},
    ref_type: event.refType ?? null,
    ref_id: event.refId ?? null,
  });
}
