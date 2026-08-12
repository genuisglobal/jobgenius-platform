/**
 * Outreach Reply Classifier + Draft Generator
 *
 * Two paths:
 *   - classifyReply / generateDraftReply      (sync, regex+template — safe fallback)
 *   - classifyReplyWithAi / generateDraftReplyWithAi (async, LLM via chatWithLogging)
 *
 * The webhook prefers the AI versions and falls back to regex on LLM error
 * or when OpenAI is not configured. AI drafts persist via submitAiOutput
 * (kind='outreach_draft', status='pending') so an AM approves before sending.
 */

import { supabaseServer } from "@/lib/supabase/server";
import { chatWithLogging } from "@/lib/ai-logging";
import { OPENAI_MODEL, isOpenAIConfigured } from "@/lib/openai";
import { submitAiOutput } from "@/lib/ai-outputs";
import { createLogger } from "@/lib/logger";
import { decide, recordDecision, routeDecision } from "@/lib/consultant/decision-engine";
import { scoreScamSignals } from "@/lib/consultant/scam-detector";

const log = createLogger("reply-classifier");

export type ReplyClassification =
  | "positive_interest"
  | "scheduling"
  | "follow_up"
  | "rejection"
  | "info_request"
  | "out_of_office"
  | "other";

const CLASSIFICATION_PATTERNS: { classification: ReplyClassification; patterns: RegExp[] }[] = [
  {
    classification: "scheduling",
    patterns: [
      /schedule|calendar|availab|time slot|set up a (call|meeting|chat)|when (are you|can you)|let('s| us) (find|set|pick)/i,
      /interview.*time|phone screen|zoom link|teams link|google meet/i,
    ],
  },
  {
    classification: "positive_interest",
    patterns: [
      /impressed|great (fit|match|candidate)|love to (chat|talk|meet|discuss)|move forward|next step/i,
      /excited to|perfect for|strong (candidate|background|profile)|would like to (connect|discuss)/i,
    ],
  },
  {
    classification: "rejection",
    patterns: [
      /unfortunately|not (a fit|moving|proceeding)|decided to (go|move) (with|forward with) (another|other)/i,
      /position (has been|was) filled|not the right (fit|match)|wish you (the best|luck)/i,
      /will not be (moving|proceeding)|regret to inform/i,
    ],
  },
  {
    classification: "info_request",
    patterns: [
      /could you (send|share|provide)|do you have|can you (send|share|attach)/i,
      /your (resume|cv|portfolio|salary|expectation)|more (info|information|details) about/i,
    ],
  },
  {
    classification: "out_of_office",
    patterns: [
      /out of (office|the office)|on (vacation|leave|holiday|pto)|will (be back|return) on/i,
      /auto.?reply|automatic reply|limited (access|availability)/i,
    ],
  },
  {
    classification: "follow_up",
    patterns: [
      /follow.?up|checking in|touch base|circling back|any update/i,
      /haven't heard|wanted to (check|see|follow)|still interested/i,
    ],
  },
];

/**
 * Classify a reply message using pattern matching
 */
export function classifyReply(subject: string, body: string): ReplyClassification {
  const text = `${subject} ${body}`;

  for (const { classification, patterns } of CLASSIFICATION_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(text)) return classification;
    }
  }

  return "other";
}

/**
 * Generate an AI draft reply based on classification
 */
export function generateDraftReply(input: {
  classification: ReplyClassification;
  seekerName: string;
  company: string;
  recruiterName: string;
  roleTitle?: string;
}): string | null {
  const { classification, seekerName, company, recruiterName, roleTitle } = input;
  const role = roleTitle ? ` ${roleTitle} role` : " opportunity";

  switch (classification) {
    case "positive_interest":
      return `Hi ${recruiterName},\n\nThank you for your interest in ${seekerName}'s profile! We're excited about the${role} at ${company}.\n\n${seekerName} is available for an initial conversation at your convenience. Would any time this week work for a brief call?\n\nBest regards`;

    case "scheduling":
      return `Hi ${recruiterName},\n\nThank you for reaching out about scheduling. ${seekerName} is available during the following times:\n\n- [Time slot 1]\n- [Time slot 2]\n- [Time slot 3]\n\nPlease let us know what works best, and we'll confirm right away.\n\nBest regards`;

    case "info_request":
      return `Hi ${recruiterName},\n\nThank you for your interest. I've attached the requested information for ${seekerName}'s application to the${role} at ${company}.\n\nPlease let us know if you need anything else.\n\nBest regards`;

    case "rejection":
      return `Hi ${recruiterName},\n\nThank you for letting us know. We appreciate the consideration for the${role} at ${company}.\n\nIf any similar positions open up in the future, we'd love to be considered. ${seekerName} remains very interested in ${company}.\n\nBest regards`;

    case "follow_up":
      return `Hi ${recruiterName},\n\nThank you for following up. ${seekerName} is still very interested in the${role} at ${company} and remains available for next steps.\n\nPlease let us know how we can move forward.\n\nBest regards`;

    case "out_of_office":
      return null; // Don't reply to OOO

    default:
      return null;
  }
}

/**
 * Process a new outreach reply: classify + generate draft
 */
export async function processOutreachReply(messageId: string) {
  // NOTE: this select previously joined non-existent tables
  // (outreach_threads/outreach_recruiters — the real tables are
  // recruiter_threads/recruiters, see migration 019) and an impossible
  // job_posts embed (recruiter_threads has no job_post_id at all). Fixed to
  // match the real schema; roleTitle is consequently never available from
  // this join (recruiter_threads isn't scoped to a specific job post).
  const { data: msg } = await supabaseServer
    .from("outreach_messages")
    .select(`
      id, subject, body, direction, from_email,
      recruiter_threads (
        id, job_seeker_id,
        recruiters (id, name, company)
      )
    `)
    .eq("id", messageId)
    .single();

  if (!msg || msg.direction !== "inbound") return null;

  const thread = msg.recruiter_threads as unknown as {
    id: string;
    job_seeker_id: string;
    recruiters: { id: string; name: string; company: string } | null;
  };

  // Get seeker name
  const { data: seeker } = await supabaseServer
    .from("job_seekers")
    .select("full_name")
    .eq("id", thread.job_seeker_id)
    .single();

  const seekerName = seeker?.full_name ?? "the candidate";
  const recruiterName = thread.recruiters?.name ?? "there";
  const company = thread.recruiters?.company ?? "the company";
  const roleTitle: string | undefined = undefined;

  // Try LLM first; regex is the safety net.
  const aiResult = await classifyReplyWithAi({
    subject: msg.subject ?? "",
    body: msg.body ?? "",
    seekerName,
    company,
    recruiterName,
    roleTitle,
  });

  const classification = aiResult?.classification ?? classifyReply(msg.subject ?? "", msg.body ?? "");
  const draftReply =
    aiResult?.draft ??
    generateDraftReply({
      classification,
      seekerName,
      company,
      recruiterName,
      roleTitle,
    });

  // If the LLM produced a draft, stage it for AM review via the HITL pipeline.
  if (aiResult?.draft) {
    await submitAiOutput({
      kind: "outreach_draft",
      payload: {
        type: "email",
        body: aiResult.draft,
        subject: `Re: ${msg.subject ?? "(no subject)"}`,
        classification,
        in_reply_to_message_id: messageId,
        thread_id: thread.id,
        recruiter_name: recruiterName,
        company,
      },
      refType: "outreach_messages",
      refId: messageId,
      seekerId: thread.job_seeker_id,
      autoApprove: false,
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
  }

  // Update message with classification + the draft text (kept for the
  // legacy bell preview path; the canonical reviewable copy lives in ai_outputs).
  await supabaseServer
    .from("outreach_messages")
    .update({
      reply_classification: classification,
      ai_draft_reply: draftReply,
      ai_draft_status: draftReply ? "generated" : "none",
    })
    .eq("id", messageId);

  // Decision Engine (shadow): scam first → escalate; otherwise Ask when the message
  // hinges on unconfirmed client facts. Non-blocking — never breaks reply processing.
  try {
    const scam = scoreScamSignals({
      subject: msg.subject,
      body: msg.body,
      senderEmail: (msg as { from_email?: string | null }).from_email,
    });

    if (scam.isLikelyScam) {
      const decision = await decide({
        jobSeekerId: thread.job_seeker_id,
        subjectType: "recruiter_message",
        subjectRef: messageId,
        scam: true,
        scamRedFlags: scam.redFlags,
      });
      const decisionId = await recordDecision(decision);
      await routeDecision(decision, decisionId);
    } else if (classification === "info_request" || classification === "scheduling") {
      const requiredFactKeys =
        classification === "scheduling"
          ? ["availability"]
          : ["work_authorization", "requires_sponsorship", "salary_expectations"];
      const decision = await decide({
        jobSeekerId: thread.job_seeker_id,
        subjectType: "recruiter_message",
        subjectRef: messageId,
        requiredFactKeys,
      });
      if (decision.verdict !== "act") {
        const decisionId = await recordDecision(decision);
        await routeDecision(decision, decisionId);
      }
    }
  } catch (err) {
    console.error("[outreach-reply] decision hook failed:", err);
  }

  return { classification, draftReply, source: aiResult ? "llm" : "regex" };
}

// ─── LLM variants ───────────────────────────────────────────

const CLASSIFY_SYSTEM_PROMPT = `You are triaging an inbound recruiter reply. Output strict JSON:
{
  "classification": "positive_interest" | "scheduling" | "follow_up" | "rejection" | "info_request" | "out_of_office" | "other",
  "draft_response": string | null,   // null for out_of_office or when no reply is warranted
  "reasoning": string                  // one short sentence
}

Rules:
- 'positive_interest': clear forward-momentum language (impressed, great fit, move forward, next step).
- 'scheduling': asking to set up a call/interview/availability.
- 'rejection': polite no, position filled, going with another candidate.
- 'info_request': asks for resume, salary expectations, more details.
- 'out_of_office': auto-reply or vacation notice.
- 'follow_up': checking in, circling back, any update.
- 'other': none of the above.

For draft_response:
- 120-160 words, plain text (no markdown).
- Greet by recruiter name; sign off with the SEEKER's name.
- For scheduling: propose 2-3 time-slot placeholders the AM will fill in.
- For info_request: confirm what we'll send and by when.
- For rejection: thank them, ask to stay in touch.
- For follow_up: confirm continued interest, ask for next-step clarity.
- For out_of_office: return null.`;

export interface LlmReplyInput {
  subject: string;
  body: string;
  seekerName: string;
  company: string;
  recruiterName: string;
  roleTitle?: string | null;
}

export interface LlmReplyResult {
  classification: ReplyClassification;
  draft: string | null;
  reasoning: string;
}

const VALID_CLASSIFICATIONS: ReplyClassification[] = [
  "positive_interest",
  "scheduling",
  "follow_up",
  "rejection",
  "info_request",
  "out_of_office",
  "other",
];

export async function classifyReplyWithAi(
  input: LlmReplyInput
): Promise<LlmReplyResult | null> {
  if (!isOpenAIConfigured()) return null;

  try {
    const userContent = [
      `SEEKER: ${input.seekerName}`,
      `RECRUITER: ${input.recruiterName} @ ${input.company}`,
      input.roleTitle ? `ROLE: ${input.roleTitle}` : "",
      `INBOUND SUBJECT: ${input.subject || "(none)"}`,
      `INBOUND BODY:\n${(input.body || "").slice(0, 2500)}`,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await chatWithLogging(
      {
        model: OPENAI_MODEL,
        temperature: 0.3,
        max_tokens: 600,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: CLASSIFY_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      },
      {
        functionName: "classifyReplyWithAi",
        route: "outreach/webhook/resend",
        meta: { recruiter: input.recruiterName, company: input.company },
      }
    );
    const text = response.choices[0]?.message?.content;
    if (!text) return null;
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const classification = VALID_CLASSIFICATIONS.includes(
      parsed.classification as ReplyClassification
    )
      ? (parsed.classification as ReplyClassification)
      : "other";
    const draft =
      typeof parsed.draft_response === "string" && parsed.draft_response.trim()
        ? parsed.draft_response
        : null;
    return {
      classification,
      draft,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    };
  } catch (err) {
    log.warn("classifyReplyWithAi failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
