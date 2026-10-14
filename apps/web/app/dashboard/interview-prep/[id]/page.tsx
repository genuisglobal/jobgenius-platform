import { getCurrentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type PageProps = {
  params: { id: string };
};


type FeedbackReport = {
  summary?: string;
  strengths?: string[];
  weaknesses?: string[];
  star_breakdown?: {
    situation?: string;
    task?: string;
    action?: string;
    result?: string;
  };
  improvement_plan?: string[];
  competencies?: {
    communication?: number;
    relevance?: number;
    star?: number;
  };
};

type VoiceSession = {
  id: string;
  interviewer_persona: string;
  status: string;
  overall_score: number | null;
  overall_feedback: string | null;
  star_score: number | null;
  communication_score: number | null;
  relevance_score: number | null;
  am_coaching_note: string | null;
  feedback_report: FeedbackReport | null;
  scored_by: string | null;
  created_at: string;
};

type VoiceTurn = {
  id: string;
  session_id: string;
  turn_number: number;
  speaker: string;
  content: string;
  score: number | null;
  feedback: string | null;
  star_score: number | null;
  relevance_score: number | null;
  specificity_score: number | null;
  confidence_coaching: string | null;
  rewrite_suggestions: string[] | null;
};

type PrepRow = {
  id: string;
  job_seeker_id: string;
  job_post_id: string;
  content: {
    role_summary?: string;
    company_notes?: string[];
    likely_questions?: string[];
    answer_structure?: string[];
    technical_topics?: string[];
    behavioral_topics?: string[];
    checklist?: string[];
    thirty_sixty_ninety?: string[];
  };
  job_posts:
    | {
        title: string;
        company: string | null;
      }
    | Array<{
        title: string;
        company: string | null;
      }>
    | null;
  job_seekers:
    | {
        full_name: string | null;
        email: string | null;
      }
    | Array<{
        full_name: string | null;
        email: string | null;
      }>
    | null;
};

function renderList(items?: string[]) {
  if (!items || items.length === 0) {
    return <p>-</p>;
  }
  return (
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default async function InterviewPrepDetailPage({ params }: PageProps) {
  const prepId = params.id;
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    redirect("/login");
  }

  const { data: prep, error: prepError } = await supabaseServer
    .from("interview_prep")
    .select(
      "id, job_seeker_id, job_post_id, content, job_posts (title, company), job_seekers (full_name, email)"
    )
    .eq("id", prepId)
    .single();

  if (prepError || !prep) {
    return (
      <main>
        <h1>Interview Prep</h1>
        <p>Interview prep not found.</p>
      </main>
    );
  }

  const { data: assignment, error: assignmentError } = await supabaseServer
    .from("job_seeker_assignments")
    .select("id")
    .eq("account_manager_id", user.id)
    .eq("job_seeker_id", prep.job_seeker_id)
    .maybeSingle();

  if (assignmentError || !assignment) {
    return (
      <main>
        <h1>Interview Prep</h1>
        <p>Not authorized for this job seeker.</p>
      </main>
    );
  }

  const { data: voiceSessions } = await supabaseServer
    .from("voice_interview_sessions")
    .select(
      "id, interviewer_persona, status, overall_score, overall_feedback, star_score, communication_score, relevance_score, am_coaching_note, feedback_report, scored_by, created_at"
    )
    .eq("interview_prep_id", prepId)
    .order("created_at", { ascending: false });

  const sessionIds = (voiceSessions ?? []).map((s) => s.id);
  let voiceTurns: VoiceTurn[] = [];
  if (sessionIds.length > 0) {
    const { data: turnsData } = await supabaseServer
      .from("voice_interview_turns")
      .select(
        "id, session_id, turn_number, speaker, content, score, feedback, star_score, relevance_score, specificity_score, confidence_coaching, rewrite_suggestions"
      )
      .in("session_id", sessionIds)
      .order("turn_number", { ascending: true });
    voiceTurns = (turnsData ?? []) as VoiceTurn[];
  }

  const turnsBySession = new Map<string, VoiceTurn[]>();
  for (const turn of voiceTurns) {
    const list = turnsBySession.get(turn.session_id) ?? [];
    list.push(turn);
    turnsBySession.set(turn.session_id, list);
  }

  const row = prep as PrepRow;
  const post = Array.isArray(row.job_posts) ? row.job_posts[0] : row.job_posts;
  const seeker = Array.isArray(row.job_seekers)
    ? row.job_seekers[0]
    : row.job_seekers;

  return (
    <main>
      <h1>Interview Prep</h1>
      <p>
        {post?.title ?? "Role"} {post?.company ? `- ${post.company}` : ""}
      </p>
      <p>
        Job seeker: {seeker?.full_name ?? "Unknown"}{" "}
        {seeker?.email ? `(${seeker.email})` : ""}
      </p>
      <a href={`/api/interview-prep/${row.id}/pdf`}>Download PDF</a>
      <section>
        <h2>Role Summary</h2>
        <p>{row.content?.role_summary ?? "-"}</p>
        <h2>Company Notes</h2>
        {renderList(row.content?.company_notes)}
        <h2>Likely Questions</h2>
        {renderList(row.content?.likely_questions)}
        <h2>Suggested Answer Structure</h2>
        {renderList(row.content?.answer_structure)}
        <h2>Technical Topics</h2>
        {renderList(row.content?.technical_topics)}
        <h2>Behavioral Topics</h2>
        {renderList(row.content?.behavioral_topics)}
        <h2>Checklist</h2>
        {renderList(row.content?.checklist)}
        <h2>30/60/90 Day Prompts</h2>
        {renderList(row.content?.thirty_sixty_ninety)}
      </section>

      <section>
        <h2>Voice Interview Transcripts</h2>
        {voiceSessions && voiceSessions.length > 0 ? (
          voiceSessions.map((session) => {
            const sessionTurns = turnsBySession.get(session.id) ?? [];
            return (
              <div key={session.id} style={{ marginBottom: "24px" }}>
                <h3>
                  Session {new Date(session.created_at).toLocaleDateString()} ({session.status})
                </h3>
                {session.overall_score !== null && (
                  <p>
                    Overall score: {session.overall_score}%
                    {session.overall_feedback ? ` - ${session.overall_feedback}` : ""}
                  </p>
                )}
                {session.am_coaching_note && (
                  <p
                    style={{
                      background: "#eef6ff",
                      border: "1px solid #cfe3ff",
                      padding: "8px",
                      borderRadius: "6px",
                    }}
                  >
                    <strong>AM coaching note:</strong> {session.am_coaching_note}
                    {session.scored_by === "heuristic" ? " (rubric-scored)" : ""}
                  </p>
                )}
                {session.feedback_report && (
                  <div>
                    <p>
                      STAR: {session.star_score ?? "-"}% · Communication:{" "}
                      {session.communication_score ?? "-"}% · Relevance:{" "}
                      {session.relevance_score ?? "-"}%
                    </p>
                    {session.feedback_report.strengths &&
                      session.feedback_report.strengths.length > 0 && (
                        <>
                          <h4>Strengths</h4>
                          {renderList(session.feedback_report.strengths)}
                        </>
                      )}
                    {session.feedback_report.weaknesses &&
                      session.feedback_report.weaknesses.length > 0 && (
                        <>
                          <h4>Areas to improve</h4>
                          {renderList(session.feedback_report.weaknesses)}
                        </>
                      )}
                    {session.feedback_report.improvement_plan &&
                      session.feedback_report.improvement_plan.length > 0 && (
                        <>
                          <h4>Improvement plan</h4>
                          {renderList(session.feedback_report.improvement_plan)}
                        </>
                      )}
                  </div>
                )}
                {sessionTurns.length > 0 ? (
                  <div>
                    {sessionTurns.map((turn) => (
                      <div key={turn.id} style={{ marginBottom: "12px" }}>
                        <strong>{turn.speaker === "candidate" ? "Candidate" : "Interviewer"}:</strong> {turn.content}
                        {turn.speaker === "candidate" && turn.score !== null && (
                          <div>
                            <small>
                              Score: {turn.score}%
                              {typeof turn.star_score === "number"
                                ? ` · STAR ${turn.star_score}`
                                : ""}
                              {typeof turn.relevance_score === "number"
                                ? ` · Relevance ${turn.relevance_score}`
                                : ""}
                              {turn.feedback ? ` - ${turn.feedback}` : ""}
                            </small>
                            {turn.confidence_coaching && (
                              <div>
                                <small>Coaching: {turn.confidence_coaching}</small>
                              </div>
                            )}
                            {turn.rewrite_suggestions &&
                              turn.rewrite_suggestions.length > 0 && (
                                <ul>
                                  {turn.rewrite_suggestions.map((s, i) => (
                                    <li key={i}>
                                      <small>{s}</small>
                                    </li>
                                  ))}
                                </ul>
                              )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>No transcript available for this session.</p>
                )}
              </div>
            );
          })
        ) : (
          <p>No voice interview transcripts yet.</p>
        )}
      </section>
    </main>
  );
}
