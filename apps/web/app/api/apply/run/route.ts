import { supabaseServer } from "@/lib/supabase/server";
import { requireAMAccessToSeeker } from "@/lib/am-access";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("id");

  if (!runId) {
    return Response.json(
      { success: false, error: "Missing run id." },
      { status: 400 }
    );
  }

  const { data: run, error: runError } = await supabaseServer
    .from("application_runs")
    .select("*")
    .eq("id", runId)
    .single();

  if (runError || !run) {
    return Response.json(
      { success: false, error: "Run not found." },
      { status: 404 }
    );
  }

  const access = await requireAMAccessToSeeker(request.headers, run.job_seeker_id);
  if (!access.ok) return access.response;

  const { data: events, error: eventsError } = await supabaseServer
    .from("application_step_events")
    .select("step, event_type, message, meta, created_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (eventsError) {
    return Response.json(
      { success: false, error: "Failed to load run events." },
      { status: 500 }
    );
  }

  return Response.json({ success: true, run, events });
}
