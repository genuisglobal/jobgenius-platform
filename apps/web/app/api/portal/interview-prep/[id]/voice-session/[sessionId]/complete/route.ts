import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";
import { loadInterviewContext, normalizePersona } from "@/lib/portal/interview-context";
import { evaluateInterview, type QAPair } from "@/lib/portal/interview-evaluator";
import { resolveAssignedAccountManagerId } from "@/lib/voice/service";
import { logActivity } from "@/lib/feedback-loop";

type TurnPayload = {
  speaker: "interviewer" | "candidate";
  content: string;
};

type TurnRow = {
  session_id: string;
  turn_number: number;
  speaker: "interviewer" | "candidate";
  content: string;
  score?: number | null;
  feedback?: string | null;
  star_score?: number | null;
  relevance_score?: number | null;
  specificity_score?: number | null;
  confidence_coaching?: string | null;
  rewrite_suggestions?: unknown;
};

export async function POST(
  request: Request,
  { params }: { params: { id: string; sessionId: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { data: session } = await supabaseAdmin
    .from("voice_interview_sessions")
    .select("*")
    .eq("id", params.sessionId)
    .eq("interview_prep_id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .single();

  if (!session) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }

  let body: { turns?: TurnPayload[] } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawTurns = Array.isArray(body.turns) ? body.turns : [];
  const cleaned = rawTurns
    .filter((t) => t && typeof t.content === "string" && t.content.trim().length > 0)
    .map((t) => ({
      speaker: t.speaker === "interviewer" ? ("interviewer" as const) : ("candidate" as const),
      content: t.content.trim(),
    }));

  if (cleaned.length === 0) {
    return Response.json({ error: "No transcript content to save." }, { status: 400 });
  }

  // Pair each candidate answer with the preceding interviewer question (in order).
  const qaPairs: QAPair[] = [];
  let lastQuestion = "Interview response";
  for (const turn of cleaned) {
    if (turn.speaker === "interviewer") {
      lastQuestion = turn.content;
    } else {
      qaPairs.push({ question: lastQuestion, answer: turn.content });
    }
  }

  // Load grounding context (résumé + JD) and run the evaluator (AI w/ fallback).
  const context = await loadInterviewContext(params.id, auth.user.id);
  const persona = normalizePersona(session.interviewer_persona);
  const evaluation = context
    ? await evaluateInterview({ context, persona, qaPairs })
    : null;

  // Fallback evaluation when prep context could not be loaded.
  const evalResult =
    evaluation ??
    (await evaluateInterview({
      context: {
        job: { title: "the role", company: null, description: null },
        candidate: { fullName: null, skills: [], workHistory: [], education: [] },
        hasResume: false,
      },
      persona,
      qaPairs,
    }));

  // Build turn rows, consuming per-answer evaluations in order for candidate turns.
  const { error: deleteError } = await supabaseAdmin
    .from("voice_interview_turns")
    .delete()
    .eq("session_id", params.sessionId);

  if (deleteError) {
    console.error("[portal:voice-complete] failed to delete old turns:", deleteError);
  }

  const rows: TurnRow[] = [];
  let answerIndex = 0;
  for (const turn of cleaned) {
    const turnNumber = rows.length;
    if (turn.speaker === "interviewer") {
      rows.push({
        session_id: params.sessionId,
        turn_number: turnNumber,
        speaker: "interviewer",
        content: turn.content,
      });
      continue;
    }

    const answer = evalResult.answers[answerIndex];
    answerIndex += 1;
    rows.push({
      session_id: params.sessionId,
      turn_number: turnNumber,
      speaker: "candidate",
      content: turn.content,
      score: answer?.score ?? null,
      feedback: answer?.feedback ?? null,
      star_score: answer?.star_score ?? null,
      relevance_score: answer?.relevance_score ?? null,
      specificity_score: answer?.specificity_score ?? null,
      confidence_coaching: answer?.confidence_coaching ?? null,
      rewrite_suggestions: answer?.rewrite_suggestions ?? [],
    });
  }

  const { error: insertError } = await supabaseAdmin
    .from("voice_interview_turns")
    .insert(rows);

  if (insertError) {
    return Response.json({ error: "Failed to save transcript." }, { status: 500 });
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("voice_interview_sessions")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      total_turns: rows.length,
      overall_score: qaPairs.length > 0 ? evalResult.overallScore : null,
      overall_feedback: qaPairs.length > 0 ? evalResult.summary : null,
      star_score: qaPairs.length > 0 ? evalResult.starScore : null,
      communication_score: qaPairs.length > 0 ? evalResult.communicationScore : null,
      relevance_score: qaPairs.length > 0 ? evalResult.relevanceScore : null,
      feedback_report: qaPairs.length > 0 ? evalResult.report : null,
      am_coaching_note: qaPairs.length > 0 ? evalResult.amCoachingNote : null,
      scored_by: evalResult.scoredBy,
      resume_grounded: context?.hasResume ?? false,
    })
    .eq("id", params.sessionId)
    .select("*")
    .single();

  if (updateError || !updated) {
    return Response.json({ error: "Failed to complete session." }, { status: 500 });
  }

  // Surface results to the candidate's Account Manager via the activity timeline.
  if (qaPairs.length > 0) {
    try {
      await logActivity(auth.user.id, {
        eventType: "mock_interview_completed",
        title: `Mock interview completed — ${evalResult.overallScore}%`,
        description: evalResult.amCoachingNote,
        meta: {
          interview_prep_id: params.id,
          persona,
          overall_score: evalResult.overallScore,
          star_score: evalResult.starScore,
          communication_score: evalResult.communicationScore,
          relevance_score: evalResult.relevanceScore,
          scored_by: evalResult.scoredBy,
        },
        refType: "interview_prep_session",
        refId: params.sessionId,
      });
    } catch (err) {
      console.error("[portal:voice-complete] failed to log activity:", err);
    }
  }

  const { data: storedTurns } = await supabaseAdmin
    .from("voice_interview_turns")
    .select("*")
    .eq("session_id", params.sessionId)
    .order("turn_number", { ascending: true });

  return Response.json({ session: updated, turns: storedTurns ?? [] });
}
