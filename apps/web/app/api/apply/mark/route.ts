import { requireAMAccessToSeeker } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

type MarkPayload = {
  run_id?: string;
  status?: "FAILED" | "CANCELLED";
  note?: string;
};

export async function POST(request: Request) {
  let payload: MarkPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.run_id || !payload.status) {
    return Response.json(
      { success: false, error: "Missing run_id or status." },
      { status: 400 }
    );
  }

  if (!["FAILED", "CANCELLED"].includes(payload.status)) {
    return Response.json(
      { success: false, error: "Invalid status value." },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();

  const { data: run, error: runError } = await supabaseServer
    .from("application_runs")
    .select("id, queue_id, current_step, job_seeker_id")
    .eq("id", payload.run_id)
    .single();

  if (runError || !run) {
    return Response.json(
      { success: false, error: "Run not found." },
      { status: 404 }
    );
  }

  const access = await requireAMAccessToSeeker(request.headers, run.job_seeker_id);
  if (!access.ok) return access.response;

  const { error } = await supabaseServer
    .from("application_runs")
    .update({
      status: payload.status,
      last_error: payload.note ?? null,
      updated_at: nowIso,
    })
    .eq("id", run.id);

  if (error) {
    return Response.json(
      { success: false, error: "Failed to update run." },
      { status: 500 }
    );
  }

  const { error: stepError } = await supabaseServer.from("application_step_events").insert({
    run_id: run.id,
    step: run.current_step,
    event_type: "STEP_FAILED",
    message: payload.note ?? `Marked ${payload.status}.`,
  });

  if (stepError) {
    console.error("[apply:mark] failed to insert step event:", stepError);
  }

  if (run.queue_id) {
    const category = "failed";
    const { error: queueError } = await supabaseServer
      .from("application_queue")
      .update({ status: payload.status, category, updated_at: nowIso })
      .eq("id", run.queue_id);

    if (queueError) {
      console.error("[apply:mark] failed to update queue status:", queueError);
    }

    const { error: attentionError } = await supabaseServer
      .from("attention_items")
      .update({
        status: payload.status === "CANCELLED" ? "DISMISSED" : "RESOLVED",
        resolved_at: nowIso,
      })
      .eq("queue_id", run.queue_id);

    if (attentionError) {
      console.error("[apply:mark] failed to update attention items:", attentionError);
    }
  }

  return Response.json({ success: true });
}
