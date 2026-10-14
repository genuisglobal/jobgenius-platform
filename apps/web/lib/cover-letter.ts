import { chatWithLogging } from "@/lib/ai-logging";
import { OPENAI_MODEL, isOpenAIConfigured } from "@/lib/openai";
import { submitAiOutput } from "@/lib/ai-outputs";
import { createLogger } from "@/lib/logger";

// ============================================================
// Cover letter generator (Phase 4 — PR-V).
//
// Standard HITL pipeline: AM triggers, LLM generates, draft persists
// to ai_outputs as 'pending', admin/AM approves at /dashboard/admin/ai-outputs
// before any send.
// ============================================================

const log = createLogger("cover-letter");

const SYSTEM_PROMPT = `You are a senior career coach writing a cover letter for a job seeker applying to a specific role.

Output STRICT JSON (no markdown):
{
  "subject": string,    // a one-line greeting / hook used as an email subject line if the AM sends this as an email
  "body": string        // 220-320 words, plain text (no markdown, no HTML), 3-4 short paragraphs
}

Rules:
- Open with one specific sentence about WHY this role at THIS company.
- Tie 2-3 concrete experiences from the seeker's background to the job's requirements.
- End with a clear, low-pressure next step (e.g. "I'd welcome the chance to discuss…").
- Use the seeker's own voice when their tone is provided. Default: professional and warm.
- Don't invent achievements, degrees, or numbers the seeker hasn't given you.
- No salutation like "To whom it may concern" — use "Dear [Hiring Team]" if no recruiter name is available.`;

export interface SeekerContext {
  id: string;
  full_name: string | null;
  email: string | null;
  bio: string | null;
  skills: string[] | null;
  work_history: unknown;
  education: unknown;
  seniority: string | null;
}

export interface JobPostContext {
  id: string;
  title: string | null;
  company: string | null;
  description_text: string | null;
  location: string | null;
}

export interface GenerateCoverLetterInput {
  seeker: SeekerContext;
  jobPost: JobPostContext;
  recruiterName?: string | null;
  tone?: "professional" | "warm" | "enthusiastic";
  /** AM who triggered the generation. */
  amId: string;
  /** Optional extra guidance from the AM ("emphasize team leadership"). */
  guidance?: string | null;
}

export interface CoverLetterDraft {
  subject: string;
  body: string;
}

export interface GenerateCoverLetterResult {
  draft: CoverLetterDraft;
  aiOutputId: string | null;
}

function asJsonContext(input: GenerateCoverLetterInput): string {
  return [
    `SEEKER`,
    `  name: ${input.seeker.full_name ?? "(unknown)"}`,
    `  seniority: ${input.seeker.seniority ?? "(unknown)"}`,
    input.seeker.skills?.length ? `  skills: ${input.seeker.skills.join(", ")}` : "",
    input.seeker.bio ? `  bio: ${input.seeker.bio.slice(0, 600)}` : "",
    input.seeker.work_history ? `  work_history: ${JSON.stringify(input.seeker.work_history).slice(0, 1500)}` : "",
    input.seeker.education ? `  education: ${JSON.stringify(input.seeker.education).slice(0, 600)}` : "",
    ``,
    `ROLE`,
    `  title: ${input.jobPost.title ?? "(unknown)"}`,
    `  company: ${input.jobPost.company ?? "(unknown)"}`,
    input.jobPost.location ? `  location: ${input.jobPost.location}` : "",
    input.jobPost.description_text
      ? `  description: ${input.jobPost.description_text.slice(0, 2000)}`
      : "",
    ``,
    `META`,
    `  recruiter_name: ${input.recruiterName ?? "(unknown — use 'Dear Hiring Team')"}`,
    `  tone: ${input.tone ?? "professional"}`,
    input.guidance ? `  am_guidance: ${input.guidance}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateCoverLetter(
  input: GenerateCoverLetterInput
): Promise<GenerateCoverLetterResult | null> {
  if (!isOpenAIConfigured()) {
    log.warn("OPENAI_API_KEY missing — skipping cover letter generation");
    return null;
  }

  let draft: CoverLetterDraft | null = null;
  try {
    const response = await chatWithLogging(
      {
        model: OPENAI_MODEL,
        temperature: 0.6,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: asJsonContext(input) },
        ],
      },
      {
        functionName: "generateCoverLetter",
        route: "/api/am/cover-letter/generate",
        seekerId: input.seeker.id,
        amId: input.amId,
        meta: { job_post_id: input.jobPost.id, tone: input.tone ?? "professional" },
      }
    );
    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const subject = typeof parsed.subject === "string" ? parsed.subject : "Application";
    const body = typeof parsed.body === "string" ? parsed.body : "";
    if (!body.trim()) return null;
    draft = { subject, body };
  } catch (err) {
    log.warn("cover letter generation failed", {
      seekerId: input.seeker.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  const submitted = await submitAiOutput({
    kind: "cover_letter",
    payload: {
      ...draft,
      seeker_id: input.seeker.id,
      job_post_id: input.jobPost.id,
      tone: input.tone ?? "professional",
      recruiter_name: input.recruiterName ?? null,
      guidance: input.guidance ?? null,
    },
    refType: "job_posts",
    refId: input.jobPost.id,
    seekerId: input.seeker.id,
    amId: input.amId,
    createdBy: input.amId,
    autoApprove: false,
    expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(),
  });

  return { draft, aiOutputId: submitted.id };
}
