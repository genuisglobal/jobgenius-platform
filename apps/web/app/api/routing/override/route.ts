import { requireAMAccessToSeeker } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

type OverridePayload = {
  job_seeker_id?: string;
  job_post_id?: string;
  decision?: "OVERRIDDEN_IN" | "OVERRIDDEN_OUT";
  note?: string;
};

export async function POST(request: Request) {
  let payload: OverridePayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.job_seeker_id || !payload?.job_post_id || !payload?.decision) {
    return Response.json(
      {
        success: false,
        error: "Missing required fields: job_seeker_id, job_post_id, decision.",
      },
      { status: 400 }
    );
  }

  if (!["OVERRIDDEN_IN", "OVERRIDDEN_OUT"].includes(payload.decision)) {
    return Response.json(
      { success: false, error: "Invalid decision value." },
      { status: 400 }
    );
  }

  const access = await requireAMAccessToSeeker(request.headers, payload.job_seeker_id);
  if (!access.ok) return access.response;

  const { data: seeker, error: seekerError } = await supabaseServer
    .from("job_seekers")
    .select("match_threshold")
    .eq("id", payload.job_seeker_id)
    .single();

  if (seekerError || !seeker) {
    return Response.json(
      { success: false, error: "Job seeker not found." },
      { status: 404 }
    );
  }

  const { error } = await supabaseServer
    .from("job_routing_decisions")
    .upsert(
      {
        job_post_id: payload.job_post_id,
        job_seeker_id: payload.job_seeker_id,
        threshold: seeker.match_threshold ?? 60,
        decision: payload.decision,
        decided_by: "AM",
        note: payload.note ?? null,
      },
      { onConflict: "job_post_id,job_seeker_id" }
    );

  if (error) {
    return Response.json(
      { success: false, error: "Failed to save override." },
      { status: 500 }
    );
  }

  return Response.json({ success: true });
}
