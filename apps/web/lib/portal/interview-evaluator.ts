import { getOpenAIClient, OPENAI_MODEL, isOpenAIConfigured } from "@/lib/openai";
import { scorePracticeAnswer } from "@/lib/portal/practice-scoring";
import {
  buildCandidateContextBlock,
  type InterviewContext,
  type InterviewPersona,
} from "@/lib/portal/interview-context";

export type AnswerEvaluation = {
  score: number;
  star_score: number;
  relevance_score: number;
  specificity_score: number;
  feedback: string;
  confidence_coaching: string;
  rewrite_suggestions: string[];
};

export type InterviewFeedbackReport = {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  star_breakdown: {
    situation: string;
    task: string;
    action: string;
    result: string;
  };
  improvement_plan: string[];
  competencies: {
    communication: number;
    relevance: number;
    star: number;
  };
};

export type InterviewEvaluation = {
  overallScore: number;
  starScore: number;
  communicationScore: number;
  relevanceScore: number;
  summary: string;
  amCoachingNote: string;
  report: InterviewFeedbackReport;
  answers: AnswerEvaluation[];
  scoredBy: "ai" | "heuristic";
};

export type QAPair = { question: string; answer: string };

function clampScore(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.round(value), 0), 100);
}

function asStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim())
    .slice(0, limit);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

// ─── Heuristic fallback ──────────────────────────────────────────────

function heuristicAnswer(qa: QAPair): AnswerEvaluation {
  const scored = scorePracticeAnswer(qa.question, qa.answer);
  return {
    score: scored.score,
    star_score: scored.star_score,
    relevance_score: scored.relevance_score,
    specificity_score: scored.specificity_score,
    feedback: scored.feedback,
    confidence_coaching: scored.confidence_coaching,
    rewrite_suggestions: scored.rewrite_suggestions,
  };
}

export function buildHeuristicEvaluation(qaPairs: QAPair[]): InterviewEvaluation {
  const answers = qaPairs.map(heuristicAnswer);
  const overallScore = average(answers.map((a) => a.score));
  const starScore = average(answers.map((a) => a.star_score));
  const relevanceScore = average(answers.map((a) => a.relevance_score));
  const communicationScore = average(answers.map((a) => a.specificity_score));

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  if (starScore >= 70) strengths.push("Answers generally follow a clear STAR structure.");
  else weaknesses.push("Answers often miss STAR elements (especially a quantified Result).");
  if (relevanceScore >= 70) strengths.push("Responses stay on-topic and address the questions asked.");
  else weaknesses.push("Some answers drift from the question — anchor the first sentence to it.");
  if (communicationScore >= 70) strengths.push("Good use of specifics, metrics, and scope.");
  else weaknesses.push("Add concrete metrics and scope to make impact tangible.");

  const improvement = Array.from(
    new Set(answers.flatMap((a) => a.rewrite_suggestions))
  ).slice(0, 5);

  const summary =
    overallScore >= 80
      ? "Strong mock interview. Communication is clear with well-structured, specific answers."
      : overallScore >= 60
      ? "Solid effort. Focus on quantifying impact and tightening STAR structure."
      : "Keep practicing. Structure answers with STAR and lead with specific, measurable results.";

  return {
    overallScore,
    starScore,
    communicationScore,
    relevanceScore,
    summary,
    amCoachingNote: `Heuristic scoring (AI unavailable). Overall ${overallScore}%. ${
      weaknesses[0] ?? "No major weaknesses detected."
    } Suggested AM focus: ${improvement[0] ?? "reinforce STAR storytelling with metrics."}`,
    report: {
      summary,
      strengths: strengths.slice(0, 4),
      weaknesses: weaknesses.slice(0, 4),
      star_breakdown: {
        situation: "Set scene briefly before diving into the task.",
        task: "State the specific goal or problem you owned.",
        action: "Describe the concrete steps you personally took.",
        result: "Close with a quantified outcome (%, $, time, scale).",
      },
      improvement_plan:
        improvement.length > 0
          ? improvement
          : ["Practice 2-3 STAR stories with measurable results before the real interview."],
      competencies: {
        communication: communicationScore,
        relevance: relevanceScore,
        star: starScore,
      },
    },
    answers,
    scoredBy: "heuristic",
  };
}

// ─── AI evaluation ───────────────────────────────────────────────────

export async function evaluateInterview(params: {
  context: InterviewContext;
  persona: InterviewPersona;
  qaPairs: QAPair[];
}): Promise<InterviewEvaluation> {
  const { context, qaPairs } = params;

  if (qaPairs.length === 0) {
    return buildHeuristicEvaluation(qaPairs);
  }

  if (!isOpenAIConfigured()) {
    return buildHeuristicEvaluation(qaPairs);
  }

  try {
    const client = getOpenAIClient();
    const resumeBlock = buildCandidateContextBlock(context.candidate);
    const jobLine = `${context.job.title}${
      context.job.company ? ` at ${context.job.company}` : ""
    }`;
    const jdBlock = context.job.description
      ? `\nJob description:\n${context.job.description.slice(0, 2000)}`
      : "";

    const transcriptBlock = qaPairs
      .map(
        (qa, i) =>
          `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`
      )
      .join("\n\n");

    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a senior interview coach grading a candidate's mock interview for the role of ${jobLine}. Grade strictly but fairly, grounded in the job requirements and the candidate's résumé.

Score every candidate answer 0-100 on overall quality plus sub-dimensions:
- star_score: how well it follows Situation/Task/Action/Result
- relevance_score: how directly it answers the question and fits the role
- specificity_score: concrete metrics, scope, and the candidate's personal contribution

Return a JSON object with EXACTLY these fields:
{
  "answers": [ { "score": number, "star_score": number, "relevance_score": number, "specificity_score": number, "feedback": string, "confidence_coaching": string, "rewrite_suggestions": string[] } ],  // one entry per Q/A pair, IN ORDER, same length as the transcript
  "overall_score": number,
  "star_score": number,
  "communication_score": number,
  "relevance_score": number,
  "summary": string,            // 2-3 sentences, candidate-facing
  "strengths": string[],        // 2-4 items
  "weaknesses": string[],       // 2-4 items
  "star_breakdown": { "situation": string, "task": string, "action": string, "result": string },  // short coaching per STAR element
  "improvement_plan": string[], // 3-5 concrete, prioritized next steps
  "am_coaching_note": string    // 2-4 sentences for the candidate's Account Manager: readiness level + where to focus coaching
}

The "answers" array MUST have exactly one entry per Q/A pair, in the same order. Keep all text concise and actionable.`,
        },
        {
          role: "user",
          content: `Role: ${jobLine}${jdBlock}\n${
            resumeBlock ? `\n${resumeBlock}\n` : ""
          }\nInterview transcript (${qaPairs.length} answers):\n\n${transcriptBlock}`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) return buildHeuristicEvaluation(qaPairs);

    const parsed = JSON.parse(text) as Record<string, unknown>;
    const rawAnswers = Array.isArray(parsed.answers) ? parsed.answers : [];

    // Map each Q/A to an AI eval, falling back to heuristic for any missing/invalid entry.
    const answers: AnswerEvaluation[] = qaPairs.map((qa, i) => {
      const raw = rawAnswers[i] as Record<string, unknown> | undefined;
      if (!raw || typeof raw !== "object") {
        return heuristicAnswer(qa);
      }
      const fallback = heuristicAnswer(qa);
      return {
        score: clampScore(raw.score, fallback.score),
        star_score: clampScore(raw.star_score, fallback.star_score),
        relevance_score: clampScore(raw.relevance_score, fallback.relevance_score),
        specificity_score: clampScore(raw.specificity_score, fallback.specificity_score),
        feedback:
          typeof raw.feedback === "string" && raw.feedback.trim()
            ? raw.feedback.trim()
            : fallback.feedback,
        confidence_coaching:
          typeof raw.confidence_coaching === "string" && raw.confidence_coaching.trim()
            ? raw.confidence_coaching.trim()
            : fallback.confidence_coaching,
        rewrite_suggestions:
          asStringList(raw.rewrite_suggestions, 4).length > 0
            ? asStringList(raw.rewrite_suggestions, 4)
            : fallback.rewrite_suggestions,
      };
    });

    const overallScore = clampScore(parsed.overall_score, average(answers.map((a) => a.score)));
    const starScore = clampScore(parsed.star_score, average(answers.map((a) => a.star_score)));
    const relevanceScore = clampScore(
      parsed.relevance_score,
      average(answers.map((a) => a.relevance_score))
    );
    const communicationScore = clampScore(
      parsed.communication_score,
      average(answers.map((a) => a.specificity_score))
    );

    const summary =
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : "Mock interview completed.";
    const amCoachingNote =
      typeof parsed.am_coaching_note === "string" && parsed.am_coaching_note.trim()
        ? parsed.am_coaching_note.trim()
        : `Overall ${overallScore}%. Review the transcript and reinforce STAR storytelling with metrics.`;

    const starBreakdownRaw = (parsed.star_breakdown ?? {}) as Record<string, unknown>;
    const pick = (key: string, fb: string) =>
      typeof starBreakdownRaw[key] === "string" && (starBreakdownRaw[key] as string).trim()
        ? (starBreakdownRaw[key] as string).trim()
        : fb;

    const report: InterviewFeedbackReport = {
      summary,
      strengths: asStringList(parsed.strengths, 4),
      weaknesses: asStringList(parsed.weaknesses, 4),
      star_breakdown: {
        situation: pick("situation", "Set the scene briefly."),
        task: pick("task", "State the goal you owned."),
        action: pick("action", "Describe what you personally did."),
        result: pick("result", "Quantify the outcome."),
      },
      improvement_plan: asStringList(parsed.improvement_plan, 5),
      competencies: {
        communication: communicationScore,
        relevance: relevanceScore,
        star: starScore,
      },
    };

    return {
      overallScore,
      starScore,
      communicationScore,
      relevanceScore,
      summary,
      amCoachingNote,
      report,
      answers,
      scoredBy: "ai",
    };
  } catch {
    return buildHeuristicEvaluation(qaPairs);
  }
}
