import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { jobSeekerId, reason, contextNotes } = body as {
    jobSeekerId: string;
    reason: "missed_interviews" | "no_offer_25_interviews";
    contextNotes?: string;
  };

  if (!jobSeekerId || !reason) {
    return NextResponse.json({ error: "jobSeekerId and reason are required." }, { status: 400 });
  }

  const validReasons = ["missed_interviews", "no_offer_25_interviews"];
  if (!validReasons.includes(reason)) {
    return NextResponse.json({ error: "Invalid escalation reason." }, { status: 400 });
  }

  const { data: escalation, error } = await supabaseAdmin
    .from("termination_escalations")
    .insert({
      job_seeker_id: jobSeekerId,
      escalated_by: auth.user.id,
      reason,
      context_notes: contextNotes ?? null,
    })
    .select()
    .single();

  if (error || !escalation) {
    return NextResponse.json({ error: "Failed to create escalation." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, escalation }, { status: 201 });
}
