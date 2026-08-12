import { requireAMAccessToSeeker } from "@/lib/am-access";
import { getActorFromHeaders } from "@/lib/actor";
import { supabaseServer } from "@/lib/supabase/server";

type EventPayload = {
  run_id?: string;
  claim_token?: string;
  level?: "INFO" | "WARN" | "ERROR";
  event_type?: string;
  step?: string;
  message?: string;
  payload?: Record<string, unknown>;
  last_seen_url?: string;
};

function requiresClaimToken(headers: Headers) {
  const runner = (headers.get("x-runner") ?? "").toLowerCase();
  return runner === "extension" || runner === "cloud";
}

export async function POST(request: Request) {
  let payload: EventPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.run_id || !payload.event_type) {
    return Response.json(
      { success: false, error: "Missing run_id or event_type." },
      { status: 400 }
    );
  }

  const { data: run, error: runError } = await supabaseServer
    .from("application_runs")
    .select("id, job_seeker_id, current_step, claim_token")
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

  if (requiresClaimToken(request.headers)) {
    if (!payload.claim_token) {
      return Response.json(
        { success: false, error: "Missing claim_token." },
        { status: 400 }
      );
    }
    if (!run.claim_token || run.claim_token !== payload.claim_token) {
      return Response.json(
        { success: false, error: "Claim token mismatch." },
        { status: 409 }
      );
    }
  }

  const { error: runEventError } = await supabaseServer.from("apply_run_events").insert({
    run_id: run.id,
    level: payload.level ?? "INFO",
    event_type: payload.event_type,
    actor: getActorFromHeaders(request.headers),
    payload: {
      step: payload.step ?? run.current_step,
      message: payload.message ?? null,
      last_seen_url: payload.last_seen_url ?? null,
      ...(payload.payload ?? {}),
    },
  });

  if (runEventError) {
    console.error("[apply:event] failed to insert run event:", runEventError);
  }

  if (payload.step || payload.message) {
    const { error: stepError } = await supabaseServer.from("application_step_events").insert({
      run_id: run.id,
      step: payload.step ?? run.current_step,
      event_type: payload.event_type,
      message: payload.message ?? null,
      meta: payload.payload ?? {},
    });

    if (stepError) {
      console.error("[apply:event] failed to insert step event:", stepError);
    }
  }

  if (payload.last_seen_url) {
    const { error: urlUpdateError } = await supabaseServer
      .from("application_runs")
      .update({ last_seen_url: payload.last_seen_url, updated_at: new Date().toISOString() })
      .eq("id", run.id);

    if (urlUpdateError) {
      console.error("[apply:event] failed to update last_seen_url:", urlUpdateError);
    }
  }

  return Response.json({ success: true });
}
