import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { escalationId, decision, decisionNotes } = body as {
    escalationId: string;
    decision: "cleared" | "terminated";
    decisionNotes?: string;
  };

  if (!escalationId || !decision) {
    return NextResponse.json({ error: "escalationId and decision are required." }, { status: 400 });
  }

  if (!["cleared", "terminated"].includes(decision)) {
    return NextResponse.json({ error: "Decision must be 'cleared' or 'terminated'." }, { status: 400 });
  }

  const { data: escalation } = await supabaseAdmin
    .from("termination_escalations")
    .select("*")
    .eq("id", escalationId)
    .single();

  if (!escalation) {
    return NextResponse.json({ error: "Escalation not found." }, { status: 404 });
  }

  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("termination_escalations")
    .update({
      decision,
      decision_by: auth.user.id,
      decision_at: now,
      decision_notes: decisionNotes ?? null,
    })
    .eq("id", escalationId);

  if (error) {
    return NextResponse.json({ error: "Failed to record decision." }, { status: 500 });
  }

  // If terminated, deactivate seeker account
  if (decision === "terminated") {
    const { error: terminateError } = await supabaseAdmin
      .from("job_seekers")
      .update({ status: "terminated" })
      .eq("id", escalation.job_seeker_id);

    if (terminateError) {
      return NextResponse.json({ error: "Failed to terminate seeker account." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, decision });
}
