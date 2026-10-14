import { supabaseServer } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/ops-auth";

type CompleteRunPayload = {
  run_id: string;
  status: "COMPLETED" | "FAILED";
  jobs_found: number;
  jobs_new: number;
  jobs_updated: number;
  pages_scraped: number;
  error_message?: string;
  metadata?: Record<string, unknown>;
};

/**
 * POST /api/discovery/runs/complete
 *
 * Marks a discovery run as completed or failed.
 */
export async function POST(request: Request) {
  const authResult = requireOpsAuth(request.headers);
  if (!authResult.ok) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  let payload: CompleteRunPayload;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload.run_id) {
    return Response.json(
      { success: false, error: "Missing run_id." },
      { status: 400 }
    );
  }

  const { error } = await supabaseServer
    .from("job_discovery_runs")
    .update({
      status: payload.status,
      jobs_found: payload.jobs_found,
      jobs_new: payload.jobs_new,
      jobs_updated: payload.jobs_updated,
      pages_scraped: payload.pages_scraped,
      error_message: payload.error_message,
      metadata: payload.metadata,
      completed_at: new Date().toISOString(),
    })
    .eq("id", payload.run_id);

  if (error) {
    return Response.json(
      { success: false, error: "Failed to update run." },
      { status: 500 }
    );
  }

  // Update last_job_count on the search
  const { data: run } = await supabaseServer
    .from("job_discovery_runs")
    .select("search_id")
    .eq("id", payload.run_id)
    .single();

  if (run?.search_id) {
    await supabaseServer
      .from("job_discovery_searches")
      .update({
        last_job_count: payload.jobs_found,
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.search_id);
  }

  return Response.json({ success: true });
}
