import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: { id: string; sessionId: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { data: session, error } = await supabaseAdmin
    .from("voice_interview_sessions")
    .select("*")
    .eq("id", params.sessionId)
    .eq("interview_prep_id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .single();

  if (error || !session) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }

  const { data: turns } = await supabaseAdmin
    .from("voice_interview_turns")
    .select("*")
    .eq("session_id", params.sessionId)
    .order("turn_number", { ascending: true });

  return Response.json({ session, turns: turns ?? [] });
}
