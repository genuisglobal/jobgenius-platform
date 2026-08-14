import { requireAMAccessToSeeker } from "@/lib/am-access";
import { getActorFromHeaders } from "@/lib/actor";
import { isActiveClient } from "@/lib/intake";
import { supabaseServer } from "@/lib/supabase/server";

type ResumePayload = {
  run_id?: string;
  note?: string;
};

export async function POST(request: Request) {
  let payload: ResumePayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.run_id) {
    return Response.json(
      { success: false, error: "Missing run_id." },
      { status: 400 }
    );
  }

  const { data: run, error: runError } = await supabaseServer
    .from("application_runs")
    .select("id, queue_id, ats_type, current_step, job_seeker_id")
    .eq("id", payload.run_id)
    .single();

  if (runError || !run) {
    return Response.json(
      { success: false, error: "Application run not found." },
      { status: 404 }
    );
  }

  const access = await requireAMAccessToSeeker(request.headers, run.job_seeker_id);
  if (!access.ok) return access.response;

  if (!(await isActiveClient(run.job_seeker_id))) {
    return Response.json(
      {
        success: false,
        error: "Live applications are only allowed for active clients.",
      },
      { status: 409 }
    );
  }

  const nowIso = new Date().toISOString();

  const { error } = await supabaseServer
    .from("application_runs")
    .update({
      status: "READY",
      step_attempts: 0,
      last_error: null,
      last_error_code: null,
      needs_attention_reason: null,
      locked_at: null,
      locked_by: null,
      claim_token: null,
      updated_at: nowIso,
    })
    .eq("id", run.id);

  if (error) {
    return Response.json(
      { success: false, error: "Failed to resume run." },
      { status: 500 }
    );
  }

  const { error: stepError } = await supabaseServer.from("application_step_events").insert({
    run_id: run.id,
    step: run.current_step,
    event_type: "RESUMED",
    message: payload.note ?? "Resumed by AM.",
  });

  if (stepError) {
    console.error("[apply:resume] failed to insert step event:", stepError);
  }

  const { error: runEventError } = await supabaseServer.from("apply_run_events").insert({
    run_id: run.id,
    level: "INFO",
    event_type: "RESUMED",
    actor: getActorFromHeaders(request.headers),
    payload: { note: payload.note ?? null },
  });

  if (runEventError) {
    console.error("[apply:resume] failed to insert run event:", runEventError);
  }

  if (run.queue_id) {
    const { error: queueError } = await supabaseServer
      .from("application_queue")
      .update({ status: "READY", category: "in_progress", updated_at: nowIso })
      .eq("id", run.queue_id);

    if (queueError) {
      console.error("[apply:resume] failed to update queue status:", queueError);
    }

    const { error: attentionError } = await supabaseServer
      .from("attention_items")
      .update({ status: "RESOLVED", resolved_at: nowIso })
      .eq("queue_id", run.queue_id)
      .eq("status", "OPEN");

    if (attentionError) {
      console.error("[apply:resume] failed to update attention items:", attentionError);
    }
  }

  return Response.json({
    success: true,
    run_id: run.id,
    status: "READY",
    ats_type: run.ats_type,
    current_step: run.current_step,
  });
}
