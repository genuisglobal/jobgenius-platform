import { buildSimplePdf } from "@/lib/pdf";
import { requireAMAccessToSeeker } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  context: { params: { id: string } }
) {
  const runId = context.params.id;
  if (!runId) {
    return Response.json(
      { success: false, error: "Missing run id." },
      { status: 400 }
    );
  }

  const { data: run, error: runError } = await supabaseServer
    .from("application_runs")
    .select(
      "id, job_seeker_id, job_post_id, ats_type, status, current_step, updated_at, job_posts (title, company, url), job_seekers (full_name, email)"
    )
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

  const { data: events } = await supabaseServer
    .from("apply_run_events")
    .select("ts, level, event_type, payload")
    .eq("run_id", runId)
    .order("ts", { ascending: true })
    .limit(50);

  const post = Array.isArray(run.job_posts) ? run.job_posts[0] : run.job_posts;
  const seeker = Array.isArray(run.job_seekers)
    ? run.job_seekers[0]
    : run.job_seekers;

  const lines: string[] = [];
  lines.push("Application Report");
  lines.push("");
  lines.push(`Status: ${run.status}`);
  lines.push(`ATS: ${run.ats_type}`);
  lines.push(`Updated: ${new Date(run.updated_at).toLocaleString()}`);
  lines.push("");
  lines.push(`Job: ${post?.title ?? "Untitled"}${post?.company ? ` - ${post.company}` : ""}`);
  if (post?.url) {
    lines.push(`URL: ${post.url}`);
  }
  lines.push(`Job Seeker: ${seeker?.full_name ?? "Unknown"}${seeker?.email ? ` (${seeker.email})` : ""}`);
  lines.push("");
  lines.push("Events:");
  (events ?? []).forEach((event) => {
    lines.push(
      `- ${new Date(event.ts).toLocaleString()} [${event.level}] ${event.event_type}`
    );
  });

  const pdfBuffer = buildSimplePdf(lines);

  return new Response(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"application-report-${run.id}.pdf\"`,
    },
  });
}
