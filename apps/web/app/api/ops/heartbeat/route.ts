import { supabaseServer } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/ops-auth";
import { enforceOpsRateLimit } from "@/lib/rate-limit-presets";

type HeartbeatPayload = {
  runner_id?: string;
  meta?: Record<string, unknown>;
};

export async function POST(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;

  const auth = requireOpsAuth(request.headers, request.url);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: 401 });
  }

  let payload: HeartbeatPayload;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.runner_id) {
    return Response.json(
      { success: false, error: "Missing runner_id." },
      { status: 400 }
    );
  }

  const { error: insertError } = await supabaseServer.from("runner_heartbeats").insert({
    runner_id: payload.runner_id,
    ts: new Date().toISOString(),
    meta: payload.meta ?? {},
  });

  if (insertError) {
    return Response.json({ success: false, error: "Failed to record heartbeat." }, { status: 500 });
  }

  return Response.json({ success: true });
}
