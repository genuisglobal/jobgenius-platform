import { supabaseAdmin } from "@/lib/auth";

export type InterviewPersona = "professional" | "technical" | "behavioral" | "stress";

export const INTERVIEW_PERSONAS: InterviewPersona[] = [
  "professional",
  "technical",
  "behavioral",
  "stress",
];

const PERSONA_DESCRIPTIONS: Record<InterviewPersona, string> = {
  professional: "a friendly but thorough HR interviewer",
  technical: "a senior engineer conducting a technical screen",
  behavioral: "a hiring manager focused on culture fit and leadership",
  stress: "a direct, challenging interviewer who pushes back on vague answers",
};

export type InterviewJobContext = {
  title: string;
  company: string | null;
  description: string | null;
};

export type InterviewCandidateContext = {
  fullName: string | null;
  skills: string[];
  workHistory: string[];
  education: string[];
};

export type InterviewContext = {
  job: InterviewJobContext;
  candidate: InterviewCandidateContext;
  hasResume: boolean;
};

export function normalizePersona(value: unknown): InterviewPersona {
  return INTERVIEW_PERSONAS.includes(value as InterviewPersona)
    ? (value as InterviewPersona)
    : "professional";
}

function asStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (out.length >= limit) break;
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (trimmed) out.push(trimmed);
      continue;
    }
    if (entry && typeof entry === "object") {
      // work_history / education are jsonb arrays of objects — flatten the
      // human-readable bits into a single line.
      const record = entry as Record<string, unknown>;
      const parts = [
        record.title ?? record.role ?? record.degree ?? record.position,
        record.company ?? record.school ?? record.institution ?? record.employer,
        record.duration ?? record.dates ?? record.year ?? record.years,
      ]
        .filter((p) => typeof p === "string" && p.trim())
        .map((p) => (p as string).trim());
      if (parts.length > 0) out.push(parts.join(" — "));
    }
  }
  return out;
}

/**
 * Load the job + candidate (resume) context for a given interview prep record.
 * Returns null if the prep record does not exist / is not owned by the seeker.
 */
export async function loadInterviewContext(
  prepId: string,
  jobSeekerId: string
): Promise<InterviewContext | null> {
  const { data: prep } = await supabaseAdmin
    .from("interview_prep")
    .select("id, job_post_id, job_seeker_id")
    .eq("id", prepId)
    .eq("job_seeker_id", jobSeekerId)
    .maybeSingle();

  if (!prep) return null;

  const job: InterviewJobContext = {
    title: "the role",
    company: null,
    description: null,
  };

  if (prep.job_post_id) {
    const { data: jobPost } = await supabaseAdmin
      .from("job_posts")
      .select("title, company, description_text")
      .eq("id", prep.job_post_id)
      .maybeSingle();
    if (jobPost) {
      job.title = (jobPost.title as string | null) ?? "the role";
      job.company = (jobPost.company as string | null) ?? null;
      job.description = (jobPost.description_text as string | null) ?? null;
    }
  }

  const { data: seeker } = await supabaseAdmin
    .from("job_seekers")
    .select("full_name, skills, work_history, education")
    .eq("id", jobSeekerId)
    .maybeSingle();

  const candidate: InterviewCandidateContext = {
    fullName: (seeker?.full_name as string | null) ?? null,
    skills: asStringArray(seeker?.skills, 25),
    workHistory: asStringArray(seeker?.work_history, 8),
    education: asStringArray(seeker?.education, 5),
  };

  const hasResume =
    candidate.skills.length > 0 ||
    candidate.workHistory.length > 0 ||
    candidate.education.length > 0;

  return { job, candidate, hasResume };
}

/** Compact, prompt-ready candidate résumé block (empty string if none). */
export function buildCandidateContextBlock(candidate: InterviewCandidateContext): string {
  const lines: string[] = [];
  if (candidate.skills.length > 0) {
    lines.push(`Candidate skills: ${candidate.skills.join(", ")}`);
  }
  if (candidate.workHistory.length > 0) {
    lines.push(`Candidate work history:\n- ${candidate.workHistory.join("\n- ")}`);
  }
  if (candidate.education.length > 0) {
    lines.push(`Candidate education:\n- ${candidate.education.join("\n- ")}`);
  }
  return lines.join("\n");
}

/**
 * Build the system instructions for the live Realtime interviewer, grounded in
 * the job description AND the candidate's résumé so questions are personalized.
 */
export function buildRealtimeInstructions(
  persona: InterviewPersona,
  context: InterviewContext
): string {
  const personaText = PERSONA_DESCRIPTIONS[persona];
  const company = context.job.company ? ` at ${context.job.company}` : "";
  const description = context.job.description
    ? `\n\nJob description:\n${context.job.description.slice(0, 1500)}`
    : "";
  const resumeBlock = buildCandidateContextBlock(context.candidate);
  const resumeText = resumeBlock ? `\n\n${resumeBlock}` : "";

  return `You are ${personaText}. You are conducting a realistic mock interview for the position of ${context.job.title}${company}.

Rules:
- Ask one question at a time and keep questions concise and role-specific.
- Personalize questions using the candidate's résumé below — probe their actual past roles, skills, and projects.
- Ask natural follow-ups that push for specifics (metrics, scope, their personal contribution).
- Encourage STAR-structured answers (Situation, Task, Action, Result) but do not lecture.
- After 6-8 exchanges, wrap up and ask if the candidate has questions.
- Do not mention that you are an AI.${description}${resumeText}`;
}
