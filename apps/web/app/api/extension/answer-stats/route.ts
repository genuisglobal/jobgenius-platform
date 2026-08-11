import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { verifyExtensionSession } from "@/lib/extension-auth";

/**
 * POST /api/extension/answer-stats
 *
 * Records how many of an application's fields were answered from AI vs memory
 * vs the seeker's saved answers vs deterministic defaults, captured at Mode-3
 * fill time (the extension knows each field's source from the resolver). Stored
 * in a side table keyed (seeker, job_post); the outcome rollup joins these onto
 * real submissions only. Fire-and-forget from the extension — best effort.
 *
 * Body: { job_post_id, ai_count, memory_count, screening_count, default_count }
 */
function toCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export async function POST(request: Request) {
  const session = await verifyExtensionSession(request);
  if (!session) {
    return NextResponse.json({ error: "Invalid or expired token." }, { status: 401 });
  }

  const jobSeekerId = session.active_job_seeker_id;
  if (!jobSeekerId) {
    return NextResponse.json({ error: "No active job seeker selected." }, { status: 400 });
  }

  let body: {
    job_post_id?: unknown;
    ai_count?: unknown;
    memory_count?: unknown;
    screening_count?: unknown;
    default_count?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const jobPostId = typeof body.job_post_id === "string" ? body.job_post_id : null;
  if (!jobPostId) {
    // No captured job to attribute to — nothing to record, not an error.
    return NextResponse.json({ success: true, recorded: false });
  }

  // The AM operating the extension must be assigned to this seeker.
  const { data: assignment } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("id")
    .eq("account_manager_id", session.account_manager_id)
    .eq("job_seeker_id", jobSeekerId)
    .maybeSingle();
  if (!assignment) {
    return NextResponse.json({ error: "Not authorized for this job seeker." }, { status: 403 });
  }

  const { error } = await supabaseAdmin.from("application_answer_stats").upsert(
    {
      job_seeker_id: jobSeekerId,
      job_post_id: jobPostId,
      ai_answer_count: toCount(body.ai_count),
      memory_answer_count: toCount(body.memory_count),
      screening_answer_count: toCount(body.screening_count),
      default_answer_count: toCount(body.default_count),
      captured_at: new Date().toISOString(),
    },
    { onConflict: "job_seeker_id,job_post_id" }
  );

  if (error) {
    return NextResponse.json({ error: "Failed to record answer stats." }, { status: 500 });
  }

  return NextResponse.json({ success: true, recorded: true });
}
