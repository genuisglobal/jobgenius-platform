import { chatWithLogging } from "@/lib/ai-logging";
import { OPENAI_MODEL, isOpenAIConfigured } from "@/lib/openai";
import { submitAiOutput } from "@/lib/ai-outputs";
import { createLogger } from "@/lib/logger";

// ============================================================
// Post-interview thank-you / follow-up email generator (PR-V).
// Same HITL pipeline as cover_letter / outreach_draft.
// ============================================================

const log = createLogger("interview-followup");

const SYSTEM_PROMPT = `You are a senior career coach drafting a post-interview thank-you / follow-up email from the candidate to the interviewer(s).

Output STRICT JSON:
{
  "subject": string,    // e.g. "Thank you — [Role] interview"
  "body": string        // 120-220 words, plain text, 2-3 short paragraphs
}

Rules:
- Open by thanking the interviewer by name (if given) and referencing one specific moment from the conversation (use the seeker's notes — if none, use one specific job/company detail).
- Reinforce ONE concrete strength tied to the role.
- If the seeker has a follow-up question or extra context (links to work, a thought from the discussion), include it briefly.
- Close warmly with a light next-step ("Happy to share more on…").
- No fluff. No "thank you for your time and consideration." style filler.
- Don't invent things — only use the data provided.`;

export interface InterviewContext {
  id: string;
  interviewer_name: string | null;
  company: string | null;
  role: string | null;
  scheduled_at: string | null;
  notes: string | null;
}

export interface FollowupSeekerContext {
  id: string;
  full_name: string | null;
  email: string | null;
  skills: string[] | null;
}

export interface GenerateFollowupInput {
  interview: InterviewContext;
  seeker: FollowupSeekerContext;
  amId: string;
  /** Optional extra context from the AM ("they brought up Postgres a lot"). */
  guidance?: string | null;
}

export interface InterviewFollowupDraft {
  subject: string;
  body: string;
}

export interface GenerateFollowupResult {
  draft: InterviewFollowupDraft;
  aiOutputId: string | null;
}

function asJsonContext(input: GenerateFollowupInput): string {
  return [
    `SEEKER`,
    `  name: ${input.seeker.full_name ?? "(unknown)"}`,
    input.seeker.skills?.length ? `  skills: ${input.seeker.skills.join(", ")}` : "",
    ``,
    `INTERVIEW`,
    `  company: ${input.interview.company ?? "(unknown)"}`,
    `  role: ${input.interview.role ?? "(unknown)"}`,
    `  scheduled_at: ${input.interview.scheduled_at ?? "(unknown)"}`,
    `  interviewer_name: ${input.interview.interviewer_name ?? "(unknown — use 'the team')"}`,
    input.interview.notes
      ? `  notes_from_interview: ${input.interview.notes.slice(0, 1500)}`
      : "",
    input.guidance ? `  am_guidance: ${input.guidance}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateInterviewFollowup(
  input: GenerateFollowupInput
): Promise<GenerateFollowupResult | null> {
  if (!isOpenAIConfigured()) {
    log.warn("OPENAI_API_KEY missing — skipping followup generation");
    return null;
  }

  let draft: InterviewFollowupDraft | null = null;
  try {
    const response = await chatWithLogging(
      {
        model: OPENAI_MODEL,
        temperature: 0.6,
        max_tokens: 600,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: asJsonContext(input) },
        ],
      },
      {
        functionName: "generateInterviewFollowup",
        route: "/api/am/interview-followup/generate",
        seekerId: input.seeker.id,
        amId: input.amId,
        meta: { interview_id: input.interview.id },
      }
    );
    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const subject = typeof parsed.subject === "string" ? parsed.subject : `Thank you — ${input.interview.role ?? "interview"}`;
    const body = typeof parsed.body === "string" ? parsed.body : "";
    if (!body.trim()) return null;
    draft = { subject, body };
  } catch (err) {
    log.warn("interview followup generation failed", {
      seekerId: input.seeker.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  const submitted = await submitAiOutput({
    kind: "interview_followup",
    payload: {
      ...draft,
      seeker_id: input.seeker.id,
      interview_id: input.interview.id,
      guidance: input.guidance ?? null,
    },
    refType: "interviews",
    refId: input.interview.id,
    seekerId: input.seeker.id,
    amId: input.amId,
    createdBy: input.amId,
    autoApprove: false,
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  });

  return { draft, aiOutputId: submitted.id };
}
