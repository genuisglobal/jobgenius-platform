import { requireJobSeeker } from "@/lib/auth";
import {
  loadInterviewContext,
  normalizePersona,
  buildRealtimeInstructions,
} from "@/lib/portal/interview-context";

const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-mini";
const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE || "alloy";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "OpenAI is not configured." }, { status: 500 });
  }

  let body: { persona?: string } = {};
  try {
    body = await request.json();
  } catch {
    // optional body
  }
  const persona = normalizePersona(body.persona);

  // loadInterviewContext also verifies the prep belongs to this seeker.
  const context = await loadInterviewContext(params.id, auth.user.id);
  if (!context) {
    return Response.json({ error: "Interview prep not found." }, { status: 404 });
  }

  // Build résumé + JD grounded instructions server-side so the candidate's
  // résumé never has to be assembled on the client.
  const instructions = buildRealtimeInstructions(persona, context);

  const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.OPENAI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: REALTIME_MODEL,
      voice: REALTIME_VOICE,
      modalities: ["audio", "text"],
      instructions,
      input_audio_transcription: { model: "whisper-1" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return Response.json(
      { error: errorText || "Failed to create realtime session." },
      { status: 500 }
    );
  }

  const data = await response.json();
  const token = data?.client_secret?.value;
  if (!token) {
    return Response.json({ error: "Missing realtime token." }, { status: 500 });
  }

  return Response.json({
    token,
    expires_at: data?.client_secret?.expires_at,
    instructions,
    resume_grounded: context.hasResume,
  });
}
