import { requireOpsAuth } from "@/lib/ops-auth";
import { enforceBackgroundRateLimit } from "@/lib/rate-limit-presets";
import { supabaseServer } from "@/lib/supabase/server";
import { computeMatchScore, parseJobPostSmart } from "@/lib/matching";
import { tailorResume } from "@/lib/resume-tailor";
import {
  tailorResumeStructured,
  buildStructuredResumeFromSeeker,
} from "@/lib/resume-tailor";
import { buildPagedPdf } from "@/lib/pdf";
import { renderResumePdf } from "@/lib/resume-templates";
import type { ResumeTemplateId } from "@/lib/resume-templates";
import { buildInterviewPrepContent } from "@/lib/interview-prep";
import { buildInterviewPrepContentWithAI } from "@/lib/interview-prep-ai";
import { isOpenAIConfigured } from "@/lib/openai";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { sendAndLogEmail } from "@/lib/messaging/send-and-log";
import { interviewPrepReadyEmail } from "@/lib/email-templates/interview-prep-ready";
import { scanAllInboxes, scanSeekerInbox } from "@/lib/gmail/inbox-scanner";
import { findMatchesForContact, findMatchesForJobPost } from "@/lib/network/matching";
import { maybeUpsertResumeHardeningAlert } from "@/lib/resume-bank-alerts";
import { createRetellPhoneCall } from "@/lib/voice/retell";
import {
  evaluateAutoApplyPreflight,
  loadSavedRunnerStorageState,
} from "@/lib/auto-apply-preflight";
import { applyHostGraduation } from "@/lib/host-graduation";
import { decide, recordDecision, routeDecision } from "@/lib/consultant/decision-engine";
import {
  appendVoiceConversationNote,
  isUpsellOptedOut,
  normalizePhone,
  resolveAssignedAccountManagerId,
} from "@/lib/voice/service";
import { normalizeVoiceCallType, type VoiceCallType } from "@/lib/voice/types";
import { randomUUID } from "crypto";

type BackgroundJobRow = {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  attempts: number | null;
  max_attempts: number | null;
};

type JobPostRow = {
  id: string;
  url: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
  description_text: string | null;
  salary_min: number | null;
  salary_max: number | null;
  seniority_level: string | null;
  work_type: string | null;
  years_experience_min: number | null;
  years_experience_max: number | null;
  required_skills: string[] | null;
  preferred_skills: string[] | null;
  industry: string | null;
  company_size: string | null;
  offers_visa_sponsorship: boolean | null;
  employment_type: string | null;
  parsed_at: string | null;
};

type StaleApplicationRunRow = {
  id: string;
  queue_id: string | null;
  job_seeker_id: string;
  ats_type: string | null;
  current_step: string;
  status: string;
  attempt_count: number | null;
  max_retries: number | null;
  locked_at: string | null;
};

const RETRY_BASE_MS = 60 * 1000;
const RETRY_MAX_MS = 30 * 60 * 1000;
const IS_PROD =
  process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
const DEFAULT_THRESHOLD = Number(process.env.AUTO_QUEUE_DEFAULT_THRESHOLD ?? 60);
const AUTO_QUEUE_ALLOWED_RECOMMENDATIONS = new Set(
  (process.env.AUTO_QUEUE_ALLOWED_RECOMMENDATIONS ?? "strong_match,good_match")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
);
const AUTO_TAILOR_ENABLED = resolveFlag(
  "AUTO_TAILOR_ENABLED",
  Boolean(process.env.OPENAI_API_KEY)
);
const AUTO_TAILOR_REQUIRED = resolveFlag("AUTO_TAILOR_REQUIRED", false);
const AUTO_APPLY_ENABLED = resolveFlag("AUTO_APPLY_ENABLED", IS_PROD);
const AUTO_APPLY_ALLOWED_ATS = new Set(
  (process.env.AUTO_APPLY_ALLOWED_ATS ?? "LINKEDIN,GREENHOUSE,WORKDAY,LEVER,SMARTRECRUITERS,GENERIC")
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean)
);
const AUTO_APPLY_MAX_RETRIES = Number(process.env.AUTO_APPLY_MAX_RETRIES ?? 2);
const AUTO_OUTREACH_ENABLED = resolveFlag("AUTO_OUTREACH_ENABLED", IS_PROD);
const AUTO_OUTREACH_CONTACT_LIMIT = Math.max(
  Number(process.env.AUTO_OUTREACH_CONTACT_LIMIT ?? 1),
  1
);
const RETELL_OUTBOUND_ENABLED = resolveFlag("RETELL_OUTBOUND_ENABLED", false);
const FACT_GATE_ENFORCED = resolveFlag("FACT_GATE_ENFORCED", false);
const AUTO_APPLY_REQUIRED_FACTS = ["work_authorization", "requires_sponsorship"];
const AUTO_APPLY_STALE_RUN_MINUTES = Math.max(
  Number(process.env.AUTO_APPLY_STALE_RUN_MINUTES ?? 60),
  5
);

function normalizeList(value?: string | null) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveFlag(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
}

function wrapTextToLines(text: string, maxLen = 90) {
  const lines: string[] = [];
  const paragraphs = (text ?? "").split(/\r?\n/);
  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      lines.push("");
      continue;
    }
    const words = trimmed.split(/\s+/);
    let current = "";
    for (const word of words) {
      if (!current) {
        current = word;
        continue;
      }
      if ((current + " " + word).length > maxLen) {
        lines.push(current);
        current = word;
      } else {
        current = `${current} ${word}`;
      }
    }
    if (current) {
      lines.push(current);
    }
  }
  return lines.length > 0 ? lines : [""];
}

function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

function pickJobPostIds(payload: Record<string, unknown>) {
  const ids = new Set<string>();
  const single = payload.job_post_id;
  if (typeof single === "string" && single.trim()) {
    ids.add(single.trim());
  }
  const list = payload.job_post_ids;
  if (Array.isArray(list)) {
    for (const value of list) {
      if (typeof value === "string" && value.trim()) {
        ids.add(value.trim());
      }
    }
  }
  return Array.from(ids);
}

function getAmId(payload: Record<string, unknown>) {
  const amId = payload.am_id;
  if (typeof amId === "string" && amId.trim()) {
    return amId.trim();
  }
  return null;
}

function getPayloadString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return null;
}

function getPayloadStringArray(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

type ActiveVoicePlaybook = {
  id: string;
  assistant_goal: string | null;
  system_prompt: string;
  max_retry_attempts: number | null;
};

async function loadActivePlaybook(
  callType: VoiceCallType
): Promise<ActiveVoicePlaybook | null> {
  const { data } = await supabaseServer
    .from("voice_playbooks")
    .select("id, assistant_goal, system_prompt, max_retry_attempts")
    .eq("call_type", callType)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return null;
  }

  return data as unknown as ActiveVoicePlaybook;
}

function buildWeights(customWeights: Record<string, number> | null) {
  if (!customWeights) {
    return undefined;
  }
  return {
    skills: customWeights.skills ?? 35,
    title: customWeights.title ?? 20,
    experience: customWeights.experience ?? 10,
    salary: customWeights.salary ?? 10,
    location: customWeights.location ?? 15,
    company_fit: customWeights.company_fit ?? 10,
    max_penalty: customWeights.max_penalty ?? 15,
  };
}

async function flagQueueAttention(
  queueId: string,
  reason: string,
  message?: string
) {
  const nowIso = new Date().toISOString();
  await supabaseServer
    .from("application_queue")
    .update({
      status: "NEEDS_ATTENTION",
      category: "needs_attention",
      last_error: message ?? reason,
      updated_at: nowIso,
    })
    .eq("id", queueId);

  await supabaseServer.from("attention_items").insert({
    queue_id: queueId,
    status: "OPEN",
    reason,
  });
}

async function recoverStaleApplicationRuns(nowIso: string) {
  const staleBeforeIso = new Date(
    Date.now() - AUTO_APPLY_STALE_RUN_MINUTES * 60 * 1000
  ).toISOString();

  const { data: staleRows, error: staleError } = await supabaseServer
    .from("application_runs")
    .select(
      "id, queue_id, job_seeker_id, ats_type, current_step, status, attempt_count, max_retries, locked_at"
    )
    .eq("status", "RUNNING")
    .not("locked_at", "is", null)
    .lte("locked_at", staleBeforeIso)
    .order("locked_at", { ascending: true })
    .limit(100);

  if (staleError) {
    console.error("Failed to load stale application runs:", staleError);
    return { recovered: 0, escalated: 0 };
  }

  const staleRuns = (staleRows ?? []) as StaleApplicationRunRow[];
  if (staleRuns.length === 0) {
    return { recovered: 0, escalated: 0 };
  }

  let recovered = 0;
  let escalated = 0;
  const reason = "RUN_STALE_TIMEOUT";

  for (const run of staleRuns) {
    const staleSince = run.locked_at ?? nowIso;
    const message = `Recovered stale RUNNING lock older than ${AUTO_APPLY_STALE_RUN_MINUTES} minutes.`;
    const nextAttempt = (run.attempt_count ?? 0) + 1;
    const maxRetries = run.max_retries ?? 2;
    const exhaustedRetries = nextAttempt > maxRetries;

    if (exhaustedRetries) {
      const { error: runUpdateError } = await supabaseServer
        .from("application_runs")
        .update({
          status: "NEEDS_ATTENTION",
          needs_attention_reason: reason,
          attempt_count: nextAttempt,
          step_attempts: 0,
          last_error: message,
          last_error_code: reason,
          locked_at: null,
          locked_by: null,
          claim_token: null,
          updated_at: nowIso,
        })
        .eq("id", run.id)
        .eq("status", "RUNNING");

      if (runUpdateError) {
        console.error("Failed to escalate stale run:", run.id, runUpdateError);
        continue;
      }

      if (run.queue_id) {
        await supabaseServer
          .from("application_queue")
          .update({
            status: "NEEDS_ATTENTION",
            category: "needs_attention",
            last_error: message,
            updated_at: nowIso,
          })
          .eq("id", run.queue_id);

        const { data: existingAttention } = await supabaseServer
          .from("attention_items")
          .select("id")
          .eq("queue_id", run.queue_id)
          .eq("status", "OPEN")
          .maybeSingle();

        if (!existingAttention) {
          await supabaseServer.from("attention_items").insert({
            queue_id: run.queue_id,
            status: "OPEN",
            reason,
          });
        }
      }

      await supabaseServer.from("application_step_events").insert({
        run_id: run.id,
        step: run.current_step,
        event_type: "NEEDS_ATTENTION",
        message: `${message} Max retries exceeded.`,
        meta: {
          reason,
          stale_locked_at: staleSince,
          stale_timeout_minutes: AUTO_APPLY_STALE_RUN_MINUTES,
        },
      });

      await supabaseServer.from("apply_run_events").insert({
        run_id: run.id,
        level: "WARN",
        event_type: "NEEDS_ATTENTION",
        actor: "SYSTEM",
        payload: {
          reason,
          step: run.current_step,
          message: `${message} Max retries exceeded.`,
          stale_locked_at: staleSince,
          stale_timeout_minutes: AUTO_APPLY_STALE_RUN_MINUTES,
        },
      });

      escalated++;
      continue;
    }

    const { error: retryError } = await supabaseServer
      .from("application_runs")
      .update({
        status: "RETRYING",
        attempt_count: nextAttempt,
        step_attempts: 0,
        last_error: message,
        last_error_code: reason,
        locked_at: null,
        locked_by: null,
        claim_token: null,
        updated_at: nowIso,
      })
      .eq("id", run.id)
      .eq("status", "RUNNING");

    if (retryError) {
      console.error("Failed to retry stale run:", run.id, retryError);
      continue;
    }

    if (run.queue_id) {
      await supabaseServer
        .from("application_queue")
        .update({
          status: "READY",
          category: "in_progress",
          last_error: message,
          updated_at: nowIso,
        })
        .eq("id", run.queue_id);
    }

    await supabaseServer.from("application_step_events").insert({
      run_id: run.id,
      step: run.current_step,
      event_type: "RETRY",
      message,
      meta: {
        reason,
        stale_locked_at: staleSince,
        stale_timeout_minutes: AUTO_APPLY_STALE_RUN_MINUTES,
      },
    });

    await supabaseServer.from("apply_run_events").insert({
      run_id: run.id,
      level: "INFO",
      event_type: "RETRY",
      actor: "SYSTEM",
      payload: {
        note: message,
        stale_locked_at: staleSince,
        stale_timeout_minutes: AUTO_APPLY_STALE_RUN_MINUTES,
      },
    });

    recovered++;
  }

  return { recovered, escalated };
}

async function ensureParsedJobPost(jobPost: JobPostRow) {
  if (jobPost.parsed_at || !jobPost.description_text) {
    return jobPost;
  }

  const parsed = await parseJobPostSmart(
    jobPost.title ?? "",
    jobPost.company ?? null,
    jobPost.location ?? null,
    jobPost.description_text
  );

  const parsedAt = new Date().toISOString();
  await supabaseServer
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
      parsed_at: parsedAt,
    })
    .eq("id", jobPost.id);

  return { ...jobPost, ...parsed, parsed_at: parsedAt };
}

async function runAutoMatch(payload: Record<string, unknown>) {
  const jobPostIds = pickJobPostIds(payload);
  if (jobPostIds.length === 0) {
    return;
  }

  const amId = getAmId(payload);
  let seekerIds: string[] | null = null;

  if (amId) {
    const { data: assignments } = await supabaseServer
      .from("job_seeker_assignments")
      .select("job_seeker_id")
      .eq("account_manager_id", amId);
    seekerIds = (assignments ?? []).map((row) => row.job_seeker_id);
    if (seekerIds.length === 0) {
      return;
    }
  }

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

  if (seekerIds) {
    seekerQuery = seekerQuery.in("id", seekerIds);
  }

  const { data: seekers } = await seekerQuery;
  if (!seekers || seekers.length === 0) {
    return;
  }

  const { data: rawJobPosts } = await supabaseServer
    .from("job_posts")
    .select(`
      id, url, title, company, location, description_text,
      salary_min, salary_max, seniority_level, work_type,
      years_experience_min, years_experience_max,
      required_skills, preferred_skills, industry, company_size,
      offers_visa_sponsorship, employment_type, parsed_at
    `)
    .in("id", jobPostIds);

  if (!rawJobPosts || rawJobPosts.length === 0) {
    return;
  }

  const jobPosts: JobPostRow[] = [];
  for (const jobPost of rawJobPosts as JobPostRow[]) {
    const parsed = await ensureParsedJobPost(jobPost);
    jobPosts.push(parsed);
  }

  for (const seekerData of seekers) {
    const seeker = {
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

    const threshold =
      typeof seekerData.match_threshold === "number"
        ? seekerData.match_threshold
        : DEFAULT_THRESHOLD;
    const customWeights = seekerData.match_weights as Record<string, number> | null;
    const weights = buildWeights(customWeights);

    const { data: routingDecisions } = await supabaseServer
      .from("job_routing_decisions")
      .select("job_post_id, decision")
      .eq("job_seeker_id", seeker.id)
      .in("job_post_id", jobPostIds);

    const decisionMap = new Map(
      (routingDecisions ?? []).map((decision) => [decision.job_post_id, decision.decision])
    );

    const candidates: Array<{ job_post_id: string }> = [];
    const nowIso = new Date().toISOString();

    for (const jobPost of jobPosts) {
      const job = {
        id: jobPost.id,
        url: jobPost.url ?? "",
        title: jobPost.title ?? "",
        company: jobPost.company,
        location: jobPost.location,
        description_text: jobPost.description_text,
        salary_min: jobPost.salary_min,
        salary_max: jobPost.salary_max,
        seniority_level: jobPost.seniority_level,
        work_type: jobPost.work_type,
        years_experience_min: jobPost.years_experience_min,
        years_experience_max: jobPost.years_experience_max,
        required_skills: jobPost.required_skills ?? [],
        preferred_skills: jobPost.preferred_skills ?? [],
        industry: jobPost.industry,
        company_size: jobPost.company_size,
        offers_visa_sponsorship: jobPost.offers_visa_sponsorship,
        employment_type: jobPost.employment_type,
        parsed_at: jobPost.parsed_at,
      };

      const matchResult = computeMatchScore(seeker, job, weights);

      await supabaseServer.from("job_match_scores").upsert(
        {
          job_post_id: jobPost.id,
          job_seeker_id: seeker.id,
          score: matchResult.score,
          confidence: matchResult.confidence,
          recommendation: matchResult.recommendation,
          reasons: {
            ...matchResult.reasons,
            component_scores: matchResult.component_scores,
          },
          updated_at: nowIso,
        },
        { onConflict: "job_post_id,job_seeker_id" }
      );

      const decision = decisionMap.get(jobPost.id);
      if (decision === "OVERRIDDEN_OUT") {
        continue;
      }

      const recommendation = String(matchResult.recommendation ?? "").toLowerCase();
      const eligibleByScore =
        matchResult.score >= threshold &&
        AUTO_QUEUE_ALLOWED_RECOMMENDATIONS.has(recommendation);
      const eligible = decision === "OVERRIDDEN_IN" || eligibleByScore;

      if (eligible) {
        candidates.push({ job_post_id: jobPost.id });
      }
    }

    if (candidates.length === 0) {
      continue;
    }

    const candidateIds = candidates.map((c) => c.job_post_id);
    const { data: existingQueue } = await supabaseServer
      .from("application_queue")
      .select("job_post_id")
      .eq("job_seeker_id", seeker.id)
      .in("job_post_id", candidateIds);

    const { data: existingRuns } = await supabaseServer
      .from("application_runs")
      .select("job_post_id")
      .eq("job_seeker_id", seeker.id)
      .in("job_post_id", candidateIds);

    const alreadyQueued = new Set([
      ...(existingQueue ?? []).map((row) => row.job_post_id),
      ...(existingRuns ?? []).map((row) => row.job_post_id),
    ]);

    const queueRows = candidateIds
      .filter((id) => !alreadyQueued.has(id))
      .map((jobPostId) => ({
        job_seeker_id: seeker.id,
        job_post_id: jobPostId,
        status: "QUEUED",
        category: "auto_matched",
        updated_at: nowIso,
      }));

    if (queueRows.length === 0) {
      continue;
    }

    const { data: insertedRows } = await supabaseServer
      .from("application_queue")
      .insert(queueRows)
      .select("id, job_seeker_id, job_post_id");

    if (!AUTO_APPLY_ENABLED || !insertedRows) {
      continue;
    }

    for (const row of insertedRows) {
      if (AUTO_TAILOR_ENABLED) {
        await enqueueBackgroundJob("TAILOR_RESUME", {
          queue_id: row.id,
          job_seeker_id: row.job_seeker_id,
          job_post_id: row.job_post_id,
        });
      } else {
        await enqueueBackgroundJob("AUTO_START_RUN", {
          queue_id: row.id,
          job_seeker_id: row.job_seeker_id,
          job_post_id: row.job_post_id,
        });
      }
    }
  }

  // After scoring, check network contacts for matches against these job posts
  if (amId) {
    for (const postId of jobPostIds) {
      try {
        await findMatchesForJobPost(postId, amId);
      } catch (err) {
        console.error("Network contact matching failed for post", postId, err);
      }
    }
  }
}

async function runTailorResume(payload: Record<string, unknown>) {
  const jobSeekerId = getPayloadString(payload, "job_seeker_id");
  const jobPostId = getPayloadString(payload, "job_post_id");
  const queueId = getPayloadString(payload, "queue_id");

  if (!jobSeekerId || !jobPostId) {
    throw new Error("Missing job_seeker_id or job_post_id.");
  }

  const { data: existingTailored } = await supabaseServer
    .from("tailored_resumes")
    .select("id")
    .eq("job_seeker_id", jobSeekerId)
    .eq("job_post_id", jobPostId)
    .maybeSingle();

  if (existingTailored?.id) {
    if (AUTO_APPLY_ENABLED && queueId) {
      await enqueueBackgroundJob("AUTO_START_RUN", {
        queue_id: queueId,
        job_seeker_id: jobSeekerId,
        job_post_id: jobPostId,
      });
    }
    return;
  }

  if (!AUTO_TAILOR_ENABLED) {
    if (AUTO_APPLY_ENABLED && queueId) {
      await enqueueBackgroundJob("AUTO_START_RUN", {
        queue_id: queueId,
        job_seeker_id: jobSeekerId,
        job_post_id: jobPostId,
      });
    }
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    if (AUTO_TAILOR_REQUIRED && queueId) {
      await flagQueueAttention(queueId, "TAILOR_REQUIRED", "OpenAI not configured.");
    }
    return;
  }

  const { data: seeker } = await supabaseServer
    .from("job_seekers")
    .select(
      "resume_text, full_name, email, phone, linkedin_url, address_city, address_state, skills, work_history, education, bio, resume_template_id"
    )
    .eq("id", jobSeekerId)
    .maybeSingle();

  const { data: jobPost } = await supabaseServer
    .from("job_posts")
    .select("title, company, description_text, required_skills, preferred_skills")
    .eq("id", jobPostId)
    .maybeSingle();

  if ((!seeker?.resume_text && !seeker?.email) || !jobPost?.description_text) {
    if (queueId) {
      await flagQueueAttention(queueId, "TAILOR_INPUT_MISSING", "Resume or job description missing.");
    }
    return;
  }

  const templateId = (seeker.resume_template_id || "classic") as ResumeTemplateId;
  const nowIso = new Date().toISOString();
  let tailoredResumeUrl: string | null = null;

  // Try structured tailoring first, fall back to plain text
  let tailoredText: string;
  let changesSummary: string;
  let tailoredData: unknown = null;
  let usedTemplateId: string = templateId;

  try {
    const baseResume = buildStructuredResumeFromSeeker({
      full_name: seeker.full_name ?? null,
      email: seeker.email ?? "",
      phone: seeker.phone ?? null,
      linkedin_url: seeker.linkedin_url ?? null,
      address_city: seeker.address_city ?? null,
      address_state: seeker.address_state ?? null,
      bio: seeker.bio ?? null,
      skills: seeker.skills ?? null,
      work_history: seeker.work_history,
      education: seeker.education,
      resume_text: seeker.resume_text ?? null,
    });

    const structuredResult = await tailorResumeStructured({
      baseResume,
      jobTitle: jobPost.title ?? "",
      company: jobPost.company ?? null,
      jobDescription: jobPost.description_text ?? null,
      requiredSkills: (jobPost.required_skills as string[] | null) ?? null,
      preferredSkills: (jobPost.preferred_skills as string[] | null) ?? null,
    });

    tailoredText = structuredResult.tailoredText;
    changesSummary = structuredResult.changesSummary;
    tailoredData = structuredResult.tailoredData;
    usedTemplateId = templateId;

    // Safety gate: if the tailored resume failed a blocking check (invented
    // skill, altered identity), route it to a human instead of auto-applying.
    if (structuredResult.safety && !structuredResult.safety.ok && queueId) {
      const blockers = structuredResult.safety.issues
        .filter((i) => i.severity === "block")
        .map((i) => i.message)
        .join("; ");
      await flagQueueAttention(
        queueId,
        "RESUME_SAFETY",
        `Tailored resume failed safety check: ${blockers}`.slice(0, 300)
      );
    }

    // Generate formatted PDF from structured data
    try {
      const pdfBuffer = renderResumePdf(structuredResult.tailoredData, templateId);
      const storagePath = `${jobSeekerId}/tailored/${jobPostId}.pdf`;
      const { error: uploadError } = await supabaseServer.storage
        .from("resumes")
        .upload(storagePath, pdfBuffer, {
          contentType: "application/pdf",
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const { data: signedUrlData } = await supabaseServer.storage
        .from("resumes")
        .createSignedUrl(storagePath, 365 * 24 * 60 * 60);

      if (signedUrlData?.signedUrl) {
        tailoredResumeUrl = signedUrlData.signedUrl;
      } else {
        const { data: urlData } = supabaseServer.storage
          .from("resumes")
          .getPublicUrl(storagePath);
        tailoredResumeUrl = urlData.publicUrl ?? null;
      }
    } catch (pdfError) {
      console.error("Structured PDF upload failed:", pdfError);
    }
  } catch (structuredError) {
    console.error("Structured tailoring failed, falling back to plain text:", structuredError);

    if (!seeker.resume_text) {
      if (queueId) {
        await flagQueueAttention(queueId, "TAILOR_INPUT_MISSING", "Resume text missing and structured tailoring failed.");
      }
      return;
    }

    const result = await tailorResume({
      resumeText: seeker.resume_text,
      jobTitle: jobPost.title ?? "",
      company: jobPost.company ?? null,
      jobDescription: jobPost.description_text ?? null,
      requiredSkills: (jobPost.required_skills as string[] | null) ?? null,
      preferredSkills: (jobPost.preferred_skills as string[] | null) ?? null,
    });

    tailoredText = result.tailoredText;
    changesSummary = result.changesSummary;

    // Fall back to plain text PDF
    try {
      const lines = wrapTextToLines(result.tailoredText);
      const pdfBuffer = buildPagedPdf(lines);
      const storagePath = `${jobSeekerId}/tailored/${jobPostId}.pdf`;
      const { error: uploadError } = await supabaseServer.storage
        .from("resumes")
        .upload(storagePath, pdfBuffer, {
          contentType: "application/pdf",
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const { data: signedUrlData } = await supabaseServer.storage
        .from("resumes")
        .createSignedUrl(storagePath, 365 * 24 * 60 * 60);

      if (signedUrlData?.signedUrl) {
        tailoredResumeUrl = signedUrlData.signedUrl;
      } else {
        const { data: urlData } = supabaseServer.storage
          .from("resumes")
          .getPublicUrl(storagePath);
        tailoredResumeUrl = urlData.publicUrl ?? null;
      }
    } catch (error) {
      console.error("Tailored resume file upload failed:", error);
    }
  }

  await supabaseServer.from("tailored_resumes").upsert(
    {
      job_seeker_id: jobSeekerId,
      job_post_id: jobPostId,
      original_text: seeker.resume_text ?? "",
      tailored_text: tailoredText,
      tailored_data: tailoredData,
      template_id: usedTemplateId,
      changes_summary: changesSummary,
      resume_url: tailoredResumeUrl,
      updated_at: nowIso,
    },
    { onConflict: "job_seeker_id,job_post_id" }
  );

  await maybeUpsertResumeHardeningAlert({
    supabase: supabaseServer,
    jobSeekerId,
    jobTitle: jobPost.title ?? "",
    threshold: 5,
  });

  if (AUTO_TAILOR_REQUIRED && !tailoredResumeUrl && queueId) {
    await flagQueueAttention(
      queueId,
      "TAILOR_FAILED",
      "Tailored resume file unavailable."
    );
    return;
  }

  if (AUTO_APPLY_ENABLED && queueId) {
    await enqueueBackgroundJob("AUTO_START_RUN", {
      queue_id: queueId,
      job_seeker_id: jobSeekerId,
      job_post_id: jobPostId,
    });
  }
}

async function runInterviewPrepReady(payload: Record<string, unknown>) {
  const jobSeekerId = getPayloadString(payload, "job_seeker_id");
  const jobPostId = getPayloadString(payload, "job_post_id");
  const interviewId = getPayloadString(payload, "interview_id");

  if (!jobSeekerId || !jobPostId) {
    throw new Error("Missing job_seeker_id or job_post_id for interview prep.");
  }

  let interviewMeta: { accountManagerId: string | null; scheduledAt: string | null } | null = null;
  if (interviewId) {
    const { data: interview } = await supabaseServer
      .from("interviews")
      .select("account_manager_id, scheduled_at")
      .eq("id", interviewId)
      .limit(1)
      .maybeSingle();

    if (interview) {
      interviewMeta = {
        accountManagerId:
          (interview.account_manager_id as string | undefined) ?? null,
        scheduledAt: (interview.scheduled_at as string | undefined) ?? null,
      };
    }
  }

  const { data: jobPost } = await supabaseServer
    .from("job_posts")
    .select("id, title, company, description_text, location")
    .eq("id", jobPostId)
    .single();

  if (!jobPost) {
    throw new Error("Job post not found.");
  }

  const { data: jobSeeker } = await supabaseServer
    .from("job_seekers")
    .select("id, full_name, email, phone, seniority, work_type, skills")
    .eq("id", jobSeekerId)
    .single();

  if (!jobSeeker) {
    throw new Error("Job seeker not found.");
  }

  let content;
  if (isOpenAIConfigured()) {
    content = await buildInterviewPrepContentWithAI({
      jobTitle: jobPost.title ?? "Role",
      companyName: jobPost.company,
      descriptionText: jobPost.description_text,
      location: jobPost.location,
      seniority: jobSeeker.seniority,
      workType: jobSeeker.work_type,
      seekerSkills: jobSeeker.skills,
    });
  } else {
    content = buildInterviewPrepContent({
      jobTitle: jobPost.title ?? "Role",
      companyName: jobPost.company,
      descriptionText: jobPost.description_text,
      location: jobPost.location,
      seniority: jobSeeker.seniority,
      workType: jobSeeker.work_type,
    });
  }

  const nowIso = new Date().toISOString();
  const { data: prep, error: prepError } = await supabaseServer
    .from("interview_prep")
    .upsert(
      {
        job_seeker_id: jobSeekerId,
        job_post_id: jobPostId,
        content,
        updated_at: nowIso,
      },
      { onConflict: "job_seeker_id,job_post_id" }
    )
    .select("id")
    .single();

  if (prepError || !prep) {
    throw new Error("Failed to save interview prep.");
  }

  if (jobSeeker.email) {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000";
    const prepUrl = `${baseUrl}/portal/interview-prep/${prep.id}`;
    const template = interviewPrepReadyEmail({
      recipientName: jobSeeker.full_name ?? "Candidate",
      jobTitle: jobPost.title ?? "Interview",
      company: jobPost.company,
      prepUrl,
    });

    await sendAndLogEmail({
      to: jobSeeker.email,
      subject: template.subject,
      html: template.html,
      text: template.text,
      template_key: "interview_prep_ready",
      job_seeker_id: jobSeekerId,
      job_post_id: jobPostId,
      interview_id: interviewId ?? undefined,
    });
  }

  const seekerPhone = normalizePhone((jobSeeker.phone as string | undefined) ?? "");
  if (!seekerPhone) {
    return;
  }

  try {
    const playbook = await loadActivePlaybook("interview_warmup");
    if (!playbook) {
      return;
    }

    const task =
      String(playbook.assistant_goal ?? "").trim() ||
      String(playbook.system_prompt ?? "").trim();
    if (!task) {
      return;
    }

    const accountManagerId =
      interviewMeta?.accountManagerId ?? (await resolveAssignedAccountManagerId(jobSeekerId));

    const requestPayload: Record<string, unknown> = {
      dispatch_source: "interview_prep_ready",
      interview_id: interviewId ?? null,
      job_post_id: jobPostId,
    };

    const { data: voiceCall } = await supabaseServer
      .from("voice_calls")
      .insert({
        provider: "retell",
        direction: "outbound",
        call_type: "interview_warmup",
        status: "queued",
        job_seeker_id: jobSeekerId,
        account_manager_id: accountManagerId,
        playbook_id: playbook.id,
        from_number: process.env.RETELL_DEFAULT_FROM_NUMBER ?? null,
        to_number: seekerPhone,
        contact_name: (jobSeeker.full_name as string | undefined) ?? null,
        task,
        max_retries: playbook.max_retry_attempts ?? 2,
        request_payload: requestPayload,
        response_payload: {},
      })
      .select("id")
      .single();

    const voiceCallId = (voiceCall?.id as string | undefined) ?? null;
    if (!voiceCallId) {
      return;
    }

    let runAt: Date | undefined;
    if (interviewMeta?.scheduledAt) {
      const scheduledAt = new Date(interviewMeta.scheduledAt);
      if (!Number.isNaN(scheduledAt.getTime())) {
        const target = new Date(scheduledAt.getTime() - 24 * 60 * 60 * 1000);
        const minDispatchTime = new Date(Date.now() + 2 * 60 * 1000);
        runAt = target > minDispatchTime ? target : minDispatchTime;
      }
    }

    await enqueueBackgroundJob(
      "VOICE_FOLLOWUP",
      {
        voice_call_id: voiceCallId,
        job_seeker_id: jobSeekerId,
        interview_id: interviewId ?? undefined,
        call_type: "interview_warmup",
      },
      {
        runAt,
        maxAttempts: 1,
      }
    );
  } catch (error) {
    console.error("Failed to queue interview prep voice call:", error);
  }
}


async function runAutoStartRun(payload: Record<string, unknown>) {
  if (!AUTO_APPLY_ENABLED) {
    return;
  }

  const queueId = getPayloadString(payload, "queue_id");
  const jobSeekerId = getPayloadString(payload, "job_seeker_id");
  const jobPostId = getPayloadString(payload, "job_post_id");

  let queueItem:
    | {
        id: string;
        job_seeker_id: string;
        job_post_id: string;
        status: string;
      }
    | null = null;

  if (queueId) {
    const { data } = await supabaseServer
      .from("application_queue")
      .select("id, job_seeker_id, job_post_id, status")
      .eq("id", queueId)
      .maybeSingle();
    queueItem = data ?? null;
  } else if (jobSeekerId && jobPostId) {
    const { data } = await supabaseServer
      .from("application_queue")
      .select("id, job_seeker_id, job_post_id, status")
      .eq("job_seeker_id", jobSeekerId)
      .eq("job_post_id", jobPostId)
      .maybeSingle();
    queueItem = data ?? null;
  }

  if (!queueItem) {
    return;
  }

  if (["NEEDS_ATTENTION", "FAILED", "CANCELLED", "APPLIED", "COMPLETED"].includes(queueItem.status)) {
    return;
  }

  const { data: existingRun } = await supabaseServer
    .from("application_runs")
    .select("id")
    .eq("queue_id", queueItem.id)
    .maybeSingle();

  if (existingRun?.id) {
    return;
  }

  let hasTailoredResumeUrl = false;
  if (AUTO_TAILOR_REQUIRED) {
    const { data: tailored } = await supabaseServer
      .from("tailored_resumes")
      .select("id, resume_url")
      .eq("job_seeker_id", queueItem.job_seeker_id)
      .eq("job_post_id", queueItem.job_post_id)
      .maybeSingle();

    hasTailoredResumeUrl = Boolean(tailored?.id && tailored.resume_url);
    if (!hasTailoredResumeUrl) {
      if (AUTO_TAILOR_ENABLED) {
        await supabaseServer
          .from("application_queue")
          .update({
            category: "tailor_pending",
            last_error: "TAILOR_PENDING",
            updated_at: new Date().toISOString(),
          })
          .eq("id", queueItem.id);
        await enqueueBackgroundJob("TAILOR_RESUME", {
          queue_id: queueItem.id,
          job_seeker_id: queueItem.job_seeker_id,
          job_post_id: queueItem.job_post_id,
        });
      } else {
        await flagQueueAttention(queueItem.id, "TAILOR_REQUIRED", "Tailored resume required.");
      }
      return;
    }
  }

  // Verify seeker has a resume before starting an application run
  const { data: seekerForResume } = await supabaseServer
    .from("job_seekers")
    .select("resume_url")
    .eq("id", queueItem.job_seeker_id)
    .maybeSingle();

  if (!seekerForResume?.resume_url && !hasTailoredResumeUrl) {
    await flagQueueAttention(
      queueItem.id,
      "RESUME_MISSING",
      "Job seeker has no resume uploaded. Upload a resume before applying."
    );
    return;
  }

  const { data: jobPost } = await supabaseServer
    .from("job_posts")
    .select("id, source, url")
    .eq("id", queueItem.job_post_id)
    .maybeSingle();

  if (!jobPost?.id) {
    await flagQueueAttention(queueItem.id, "JOB_POST_MISSING", "Job post not found.");
    return;
  }

  const [{ data: matchScore }, storageState] = await Promise.all([
    supabaseServer
      .from("job_match_scores")
      .select("score, confidence, recommendation, reasons")
      .eq("job_seeker_id", queueItem.job_seeker_id)
      .eq("job_post_id", queueItem.job_post_id)
      .maybeSingle(),
    loadSavedRunnerStorageState(queueItem.job_seeker_id),
  ]);

  let preflight = evaluateAutoApplyPreflight({
    source: jobPost.source,
    url: jobPost.url,
    matchScore,
    storageState,
    allowedAts: AUTO_APPLY_ALLOWED_ATS,
  });

  // Mode 3 graduation: a host proven by interactive autofill can auto-run even
  // without a curated host rule (flag-gated; only relaxes HOST_UNSUPPORTED).
  preflight = await applyHostGraduation(preflight);

  if (!preflight.eligible) {
    await flagQueueAttention(
      queueItem.id,
      preflight.reasonCode || "AUTO_APPLY_PREFLIGHT_FAILED",
      preflight.message || "Autonomous apply preflight failed."
    );
    return;
  }

  // Fact gate (Org Singularity): never auto-answer unconfirmed sensitive fields.
  // Always record the decision (shadow); only block the run when FACT_GATE_ENFORCED.
  const gate = await decide({
    jobSeekerId: queueItem.job_seeker_id,
    subjectType: "application",
    subjectRef: queueItem.id,
    requiredFactKeys: AUTO_APPLY_REQUIRED_FACTS,
  });
  if (gate.verdict !== "act") {
    const decisionId = await recordDecision(gate);
    await routeDecision(gate, decisionId);
    if (FACT_GATE_ENFORCED) {
      await flagQueueAttention(
        queueItem.id,
        gate.verdict === "escalate" ? "FACT_GATE_ESCALATE" : "FACT_GATE_ASK",
        gate.recommendedAction
      );
      return;
    }
  }

  const atsType = preflight.atsType;
  const initialStep = preflight.initialStep ?? "OPEN_JOB";
  const nowIso = new Date().toISOString();
  const maxRetries = Number.isFinite(AUTO_APPLY_MAX_RETRIES) ? AUTO_APPLY_MAX_RETRIES : 2;

  const { data: createdRun, error: createError } = await supabaseServer
    .from("application_runs")
    .insert({
      queue_id: queueItem.id,
      job_seeker_id: queueItem.job_seeker_id,
      job_post_id: queueItem.job_post_id,
      ats_type: atsType,
      status: "READY",
      current_step: initialStep,
      max_retries: maxRetries,
      updated_at: nowIso,
    })
    .select("id")
    .single();

  if (createError || !createdRun) {
    throw new Error("Failed to create application run.");
  }

  await supabaseServer
    .from("application_queue")
    .update({ status: "READY", category: "in_progress", updated_at: nowIso })
    .eq("id", queueItem.id);

  await supabaseServer.from("application_step_events").insert({
    run_id: createdRun.id,
    step: initialStep,
    event_type: "READY",
    message: "Run ready for execution.",
  });

  await supabaseServer.from("apply_run_events").insert({
    run_id: createdRun.id,
    level: "INFO",
    event_type: "READY",
    actor: "SYSTEM",
    payload: { step: initialStep },
  });
}

async function runAutoOutreach(payload: Record<string, unknown>) {
  if (!AUTO_OUTREACH_ENABLED) {
    return;
  }

  const jobSeekerId = getPayloadString(payload, "job_seeker_id");
  const jobPostId = getPayloadString(payload, "job_post_id");
  if (!jobSeekerId || !jobPostId) {
    throw new Error("Missing job_seeker_id or job_post_id for outreach.");
  }

  const contactIds = getPayloadStringArray(payload, "contact_ids");
  let draftQuery = supabaseServer
    .from("outreach_drafts")
    .select(
      "id, contact_id, subject, body, status, outreach_contacts (id, full_name, email, role, company_name)"
    )
    .eq("job_seeker_id", jobSeekerId)
    .eq("job_post_id", jobPostId)
    .eq("status", "DRAFT")
    .order("created_at", { ascending: true })
    .limit(AUTO_OUTREACH_CONTACT_LIMIT);

  if (contactIds.length > 0) {
    draftQuery = draftQuery.in("contact_id", contactIds);
  }

  const { data: drafts } = await draftQuery;
  if (!drafts || drafts.length === 0) {
    return;
  }

  const opsKey = process.env.OPS_API_KEY;
  if (!opsKey) {
    throw new Error("OPS_API_KEY is required for auto outreach.");
  }

  const baseUrl = getBaseUrl();

  for (const draftRow of drafts) {
    const contact = Array.isArray(draftRow.outreach_contacts)
      ? draftRow.outreach_contacts[0]
      : draftRow.outreach_contacts;
    const email = contact?.email ?? null;

    if (!draftRow.subject || !draftRow.body || !email) {
      await supabaseServer
        .from("outreach_drafts")
        .update({
          status: "FAILED",
          last_error: "Missing subject, body, or contact email.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", draftRow.id);
      continue;
    }

    const { data: existingRecruiter } = await supabaseServer
      .from("recruiters")
      .select("id")
      .eq("email", email)
      .limit(1)
      .maybeSingle();

    let recruiterId = existingRecruiter?.id ?? null;
    if (!recruiterId) {
      const { data: insertedRecruiter, error: recruiterError } = await supabaseServer
        .from("recruiters")
        .insert({
          name: contact?.full_name ?? email,
          title: contact?.role ?? null,
          company: contact?.company_name ?? null,
          email,
          source: "auto_apply",
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (recruiterError || !insertedRecruiter) {
        await supabaseServer
          .from("outreach_drafts")
          .update({
            status: "FAILED",
            last_error: "Failed to create recruiter.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", draftRow.id);
        continue;
      }
      recruiterId = insertedRecruiter.id;
    }

    const { data: thread } = await supabaseServer
      .from("recruiter_threads")
      .select("id")
      .eq("recruiter_id", recruiterId)
      .eq("job_seeker_id", jobSeekerId)
      .maybeSingle();

    if (thread?.id) {
      const { data: outboundMessages } = await supabaseServer
        .from("outreach_messages")
        .select("id")
        .eq("recruiter_thread_id", thread.id)
        .eq("direction", "OUTBOUND")
        .limit(1);

      if ((outboundMessages ?? []).length > 0) {
        await supabaseServer
          .from("outreach_drafts")
          .update({
            status: "SKIPPED",
            last_error: "Existing outreach message found.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", draftRow.id);
        continue;
      }
    }

    const response = await fetch(`${baseUrl}/api/outreach/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ops-key": opsKey,
      },
      body: JSON.stringify({
        recruiter_id: recruiterId,
        job_seeker_id: jobSeekerId,
        subject: draftRow.subject,
        body: draftRow.body,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      await supabaseServer
        .from("outreach_drafts")
        .update({
          status: "FAILED",
          last_error: errorText || `Send failed (${response.status}).`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", draftRow.id);
      continue;
    }

    await supabaseServer
      .from("outreach_drafts")
      .update({
        status: "SENT",
        sent_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", draftRow.id);
  }
}

async function runScanInbox(payload: Record<string, unknown>) {
  const seekerId = getPayloadString(payload, "job_seeker_id");
  if (seekerId) {
    // Scan a specific seeker's inbox
    await scanSeekerInbox(seekerId);
  } else {
    // Scan all active Gmail connections
    await scanAllInboxes();
  }
}

async function runMatchNetworkContacts(payload: Record<string, unknown>) {
  const contactId = getPayloadString(payload, "network_contact_id");
  if (!contactId) {
    throw new Error("Missing network_contact_id.");
  }
  await findMatchesForContact(contactId);
}

type VoicePlaybookJoin = {
  id: string;
  pathway_id: string | null;
  retell_agent_id: string | null;
  system_prompt: string;
  assistant_goal: string | null;
  max_retry_attempts: number | null;
  retry_backoff_minutes: number | null;
  metadata: unknown;
  escalation_rules: unknown;
};

type VoiceCallRow = {
  id: string;
  status: string;
  direction: string;
  call_type: string;
  job_seeker_id: string | null;
  lead_submission_id: string | null;
  account_manager_id: string | null;
  to_number: string;
  from_number: string | null;
  contact_name: string | null;
  retry_count: number | null;
  max_retries: number | null;
  task: string | null;
  request_payload: unknown;
  provider_call_id: string | null;
  voice_playbooks: VoicePlaybookJoin | VoicePlaybookJoin[] | null;
};

function resolveAppBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.endsWith("/") ? configured.slice(0, -1) : configured;
  }
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (!vercelUrl) return null;
  const withProtocol = vercelUrl.startsWith("http")
    ? vercelUrl
    : `https://${vercelUrl}`;
  return withProtocol.endsWith("/") ? withProtocol.slice(0, -1) : withProtocol;
}

function resolveVoiceWebhookUrl() {
  const base = resolveAppBaseUrl();
  if (!base) return null;
  return `${base}/api/voice/webhook/retell`;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizePlaybook(value: VoiceCallRow["voice_playbooks"]) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function scheduleVoiceRetry(voiceCallId: string, runAt: Date) {
  await enqueueBackgroundJob(
    "VOICE_RETRY",
    { voice_call_id: voiceCallId },
    { runAt, maxAttempts: 1 }
  );
}

async function runVoiceDispatch(payload: Record<string, unknown>) {
  const voiceCallId = getPayloadString(payload, "voice_call_id");
  if (!voiceCallId) {
    throw new Error("Missing voice_call_id.");
  }

  const { data: row, error } = await supabaseServer
    .from("voice_calls")
    .select(`
      id,
      status,
      direction,
      call_type,
      job_seeker_id,
      lead_submission_id,
      account_manager_id,
      to_number,
      from_number,
      contact_name,
      retry_count,
      max_retries,
      task,
      request_payload,
      provider_call_id,
      voice_playbooks (
        id,
        pathway_id,
        retell_agent_id,
        system_prompt,
        assistant_goal,
        max_retry_attempts,
        retry_backoff_minutes,
        metadata,
        escalation_rules
      )
    `)
    .eq("id", voiceCallId)
    .single();

  if (error || !row) {
    throw new Error("Voice call row not found.");
  }

  const voiceCall = row as unknown as VoiceCallRow;
  const playbook = normalizePlaybook(voiceCall.voice_playbooks);
  const callType = normalizeVoiceCallType(voiceCall.call_type);

  if (!callType) {
    throw new Error(`Invalid voice call type: ${voiceCall.call_type}`);
  }

  if (voiceCall.direction !== "outbound") {
    return;
  }

  if (!RETELL_OUTBOUND_ENABLED) {
    const nowIso = new Date().toISOString();
    await supabaseServer
      .from("voice_calls")
      .update({
        status: "failed",
        response_payload: {
          error: "Retell outbound calling is disabled. Set RETELL_OUTBOUND_ENABLED=true.",
          failed_at: nowIso,
        },
        updated_at: nowIso,
      })
      .eq("id", voiceCall.id);

    if (voiceCall.job_seeker_id && voiceCall.account_manager_id) {
      await appendVoiceConversationNote({
        jobSeekerId: voiceCall.job_seeker_id,
        accountManagerId: voiceCall.account_manager_id,
        callType: callType as VoiceCallType,
        status: "failed",
        summary: "Voice call not sent because RETELL_OUTBOUND_ENABLED is false.",
      });
    }
    return;
  }

  if (callType === "upsell_retention" && (await isUpsellOptedOut(voiceCall.to_number))) {
    await supabaseServer
      .from("voice_calls")
      .update({
        status: "opted_out",
        updated_at: new Date().toISOString(),
      })
      .eq("id", voiceCall.id);
    return;
  }

  const requestPayload = asRecord(voiceCall.request_payload);
  const nowIso = new Date().toISOString();
  const task =
    String(voiceCall.task ?? "").trim() ||
    String(playbook?.assistant_goal ?? "").trim() ||
    String(playbook?.system_prompt ?? "").trim();

  if (!task) {
    throw new Error("Voice task/prompt is required before dispatch.");
  }

  try {
    const result = await createRetellPhoneCall({
      toNumber: voiceCall.to_number,
      fromNumber: voiceCall.from_number,
      agentId: playbook?.retell_agent_id ?? null,
      dynamicVariables: {
        contact_name: voiceCall.contact_name ?? undefined,
        call_type: callType,
        task,
      },
      metadata: {
        voice_call_id: voiceCall.id,
        call_type: callType,
        job_seeker_id: voiceCall.job_seeker_id,
        lead_submission_id: voiceCall.lead_submission_id,
        account_manager_id: voiceCall.account_manager_id,
        webhook_url: resolveVoiceWebhookUrl(),
        ...(requestPayload.request_data && typeof requestPayload.request_data === "object"
          ? (requestPayload.request_data as Record<string, unknown>)
          : {}),
      },
    });

    await supabaseServer
      .from("voice_calls")
      .update({
        status: "initiated",
        provider_call_id: result.providerCallId ?? voiceCall.provider_call_id,
        request_payload: {
          ...requestPayload,
          dispatch_started_at: nowIso,
        },
        response_payload: result.raw,
        call_started_at: nowIso,
        next_retry_at: null,
        updated_at: nowIso,
      })
      .eq("id", voiceCall.id);

    if (voiceCall.job_seeker_id && voiceCall.account_manager_id) {
      await appendVoiceConversationNote({
        jobSeekerId: voiceCall.job_seeker_id,
        accountManagerId: voiceCall.account_manager_id,
        callType: callType as VoiceCallType,
        status: "initiated",
        summary: "Automated voice call initiated.",
        providerCallId: result.providerCallId,
      });
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown voice dispatch error.";
    const currentRetry = voiceCall.retry_count ?? 0;
    const maxRetries = Math.max(
      voiceCall.max_retries ?? playbook?.max_retry_attempts ?? 3,
      0
    );
    const nextRetryCount = currentRetry + 1;

    if (nextRetryCount <= maxRetries) {
      const backoffMinutes = Math.max(playbook?.retry_backoff_minutes ?? 120, 1);
      const retryAt = new Date(Date.now() + backoffMinutes * 60 * 1000);
      await supabaseServer
        .from("voice_calls")
        .update({
          status: "queued",
          retry_count: nextRetryCount,
          next_retry_at: retryAt.toISOString(),
          response_payload: {
            error: detail,
            failed_at: nowIso,
            retry_count: nextRetryCount,
          },
          updated_at: nowIso,
        })
        .eq("id", voiceCall.id);
      await scheduleVoiceRetry(voiceCall.id, retryAt);
      return;
    }

    await supabaseServer
      .from("voice_calls")
      .update({
        status: "failed",
        retry_count: nextRetryCount,
        next_retry_at: null,
        response_payload: {
          error: detail,
          failed_at: nowIso,
          retry_count: nextRetryCount,
        },
        updated_at: nowIso,
      })
      .eq("id", voiceCall.id);

    if (voiceCall.job_seeker_id && voiceCall.account_manager_id) {
      await appendVoiceConversationNote({
        jobSeekerId: voiceCall.job_seeker_id,
        accountManagerId: voiceCall.account_manager_id,
        callType: callType as VoiceCallType,
        status: "failed",
        summary: `Voice call failed after retries: ${detail}`,
      });
    }
  }
}

async function runVoiceRetry(payload: Record<string, unknown>) {
  await runVoiceDispatch(payload);
}

async function runVoiceFollowup(payload: Record<string, unknown>) {
  await runVoiceDispatch(payload);
}

async function runDiagnoseFailure(payload: Record<string, unknown>) {
  const runId = typeof payload.run_id === "string" ? payload.run_id : null;
  if (!runId) {
    throw new Error("DIAGNOSE_FAILURE requires payload.run_id");
  }
  // Lazy import keeps Next from pulling the Vision-LLM module into other
  // routes that don't need it.
  const { diagnoseRunFailure } = await import("@/lib/failure-diagnosis");
  await diagnoseRunFailure({ runId });
}

async function handleJob(job: BackgroundJobRow) {
  if (!job.payload || typeof job.payload !== "object" || Array.isArray(job.payload)) {
    throw new Error("Invalid payload.");
  }

  switch (job.type) {
    case "AUTO_MATCH_JOB_POST":
    case "AUTO_MATCH_JOB_POSTS":
      await runAutoMatch(job.payload);
      return;
    case "TAILOR_RESUME":
      await runTailorResume(job.payload);
      return;
    case "AUTO_START_RUN":
      await runAutoStartRun(job.payload);
      return;
    case "AUTO_OUTREACH":
      await runAutoOutreach(job.payload);
      return;
    case "INTERVIEW_PREP_READY":
      await runInterviewPrepReady(job.payload);
      return;
    case "SCAN_INBOX":
      await runScanInbox(job.payload);
      return;
    case "MATCH_NETWORK_CONTACTS":
      await runMatchNetworkContacts(job.payload);
      return;
    case "VOICE_DISPATCH":
      await runVoiceDispatch(job.payload);
      return;
    case "VOICE_RETRY":
      await runVoiceRetry(job.payload);
      return;
    case "VOICE_FOLLOWUP":
      await runVoiceFollowup(job.payload);
      return;
    case "DIAGNOSE_FAILURE":
      await runDiagnoseFailure(job.payload);
      return;
    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

async function runJobs(request: Request) {
  const rl = await enforceBackgroundRateLimit(request);
  if (!rl.allowed) return rl.response;

  const auth = requireOpsAuth(request.headers, request.url);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? "5");
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, 20)
      : 5;
  const nowIso = new Date().toISOString();
  const staleRunRecovery = await recoverStaleApplicationRuns(nowIso);
  const workerId = `background:${process.env.VERCEL_REGION ?? "local"}:${randomUUID()}`;

  const { data: queuedJobs, error } = await supabaseServer
    .from("background_jobs")
    .select("id, type, payload, attempts, max_attempts")
    .in("status", ["QUEUED", "RETRY"])
    .lte("run_at", nowIso)
    .is("locked_at", null)
    .order("run_at", { ascending: true })
    .limit(limit);

  if (error) {
    return Response.json({ success: false, error: "Failed to load jobs." }, { status: 500 });
  }

  const results: Array<{ id: string; status: string; error?: string }> = [];

  for (const job of (queuedJobs ?? []) as BackgroundJobRow[]) {
    const { data: lockedJob } = await supabaseServer
      .from("background_jobs")
      .update({
        status: "RUNNING",
        locked_at: nowIso,
        locked_by: workerId,
        updated_at: nowIso,
      })
      .eq("id", job.id)
      .is("locked_at", null)
      .in("status", ["QUEUED", "RETRY"])
      .select("id, type, payload, attempts, max_attempts")
      .single();

    if (!lockedJob) {
      continue;
    }

    try {
      await handleJob(lockedJob as BackgroundJobRow);
      await supabaseServer
        .from("background_jobs")
        .update({
          status: "DONE",
          locked_at: null,
          locked_by: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lockedJob.id);
      results.push({ id: lockedJob.id, status: "DONE" });
    } catch (err) {
      const attempts = (lockedJob.attempts ?? 0) + 1;
      const maxAttempts = lockedJob.max_attempts ?? 3;
      const retry = attempts < maxAttempts;
      const delayMs = Math.min(RETRY_BASE_MS * 2 ** Math.max(attempts - 1, 0), RETRY_MAX_MS);
      const nextRunAt = new Date(Date.now() + delayMs).toISOString();
      const errorMessage = err instanceof Error ? err.message : "Job failed.";

      if (!retry && lockedJob.payload && typeof lockedJob.payload === "object" && !Array.isArray(lockedJob.payload)) {
        const payload = lockedJob.payload as Record<string, unknown>;
        const queueId = getPayloadString(payload, "queue_id");
        if (queueId && lockedJob.type === "TAILOR_RESUME") {
          await flagQueueAttention(queueId, "TAILOR_FAILED", errorMessage);
        }
        if (queueId && lockedJob.type === "AUTO_START_RUN") {
          await flagQueueAttention(queueId, "AUTO_START_FAILED", errorMessage);
        }
      }

      await supabaseServer
        .from("background_jobs")
        .update({
          status: retry ? "RETRY" : "FAILED",
          attempts,
          last_error: errorMessage,
          locked_at: null,
          locked_by: null,
          run_at: retry ? nextRunAt : nowIso,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lockedJob.id);

      results.push({
        id: lockedJob.id,
        status: retry ? "RETRY" : "FAILED",
        error: errorMessage,
      });
    }
  }

  return Response.json({
    success: true,
    processed: results.length,
    results,
    stale_runs: staleRunRecovery,
  });
}

export async function POST(request: Request) {
  return runJobs(request);
}

export async function GET(request: Request) {
  return runJobs(request);
}
