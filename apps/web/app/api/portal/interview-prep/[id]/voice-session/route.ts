import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";
import { normalizePersona } from "@/lib/portal/interview-context";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { data: sessions } = await supabaseAdmin
    .from("voice_interview_sessions")
    .select(
      "id, interviewer_persona, status, total_turns, overall_score, overall_feedback, started_at, completed_at, created_at"
    )
    .eq("interview_prep_id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .order("created_at", { ascending: false });

  return Response.json({ sessions: sessions ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Verify prep ownership
  const { data: prep } = await supabaseAdmin
    .from("interview_prep")
    .select("id")
    .eq("id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .single();

  if (!prep) {
    return Response.json({ error: "Interview prep not found." }, { status: 404 });
  }

  let body: { persona?: string } = {};
  try {
    body = await request.json();
  } catch {
    // defaults
  }

  const persona = normalizePersona(body.persona);

  // Create the session. The live interview is driven by the Realtime client,
  // which connects via the realtime-token route and finalizes via /complete.
  const { data: session, error: sessionError } = await supabaseAdmin
    .from("voice_interview_sessions")
    .insert({
      interview_prep_id: params.id,
      job_seeker_id: auth.user.id,
      interviewer_persona: persona,
      status: "in_progress",
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (sessionError || !session) {
    return Response.json({ error: "Failed to create session." }, { status: 500 });
  }

  return Response.json({ session }, { status: 201 });
}
