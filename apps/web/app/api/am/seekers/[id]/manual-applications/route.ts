import { NextResponse } from "next/server";
import { requireAMAccessToSeeker } from "@/lib/am-access";
import { supabaseAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/feedback-loop";
import { findRecentDuplicateRun } from "@/lib/apply/duplicate-check";
import { findOrCreateJobPost, parseZonedDateTime, validateManualJob } from "@/lib/manual-capture";

/**
 * POST /api/am/seekers/[id]/manual-applications
 * Log an application the AM submitted by hand (company portal, email, referral).
 * Stored as an APPLIED application_run with source = 'manual', so reports, the
 * client's tracker and the automated runner's duplicate guard all see it.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const access = await requireAMAccessToSeeker(request.headers, params.id);
  if (!access.ok) return access.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const job = validateManualJob({
    company: body.company,
    title: body.title,
    url: body.url,
    location: body.location,
  });
  if ("error" in job) return NextResponse.json({ error: job.error }, { status: 400 });

  const now = new Date();
  let appliedAt = now;
  if (body.applied_at !== undefined && body.applied_at !== null && body.applied_at !== "") {
    const parsed = parseZonedDateTime(body.applied_at);
    if (!parsed || parsed.getTime() > now.getTime() + 5 * 60_000) {
      return NextResponse.json({ error: "Applied date must be a past date and time." }, { status: 400 });
    }
    appliedAt = parsed;
  }

  let jobPostId: string;
  try {
    jobPostId = (await findOrCreateJobPost(params.id, job)).id;
  } catch (error) {
    console.error("Manual application job post failed:", error);
    return NextResponse.json({ error: "Could not save the job." }, { status: 500 });
  }

  // Same company + role in the last 30 days → ask before double-logging.
  if (body.confirm_duplicate !== true) {
    const { data: sameJob } = await supabaseAdmin
      .from("application_runs")
      .select("id, status")
      .eq("job_seeker_id", params.id)
      .eq("job_post_id", jobPostId)
      .in("status", ["APPLIED", "COMPLETED"])
      .limit(1)
      .maybeSingle();
    const duplicate = sameJob ?? (await findRecentDuplicateRun(params.id, jobPostId));
    if (duplicate) {
      return NextResponse.json(
        {
          error: `Already recorded: ${job.title} at ${job.company}. Log it again anyway?`,
          duplicate: true,
        },
        { status: 409 }
      );
    }
  }

  const appliedIso = appliedAt.toISOString();
  const { data: run, error } = await supabaseAdmin
    .from("application_runs")
    .insert({
      job_seeker_id: params.id,
      job_post_id: jobPostId,
      ats_type: "MANUAL",
      status: "APPLIED",
      current_step: "DONE",
      source: "manual",
      logged_by_am_id: access.amId,
      applied_at: appliedIso,
      last_seen_url: job.url,
      created_at: appliedIso,
      updated_at: now.toISOString(),
    })
    .select("id")
    .single();

  if (error || !run) {
    console.error("Manual application insert failed:", error);
    return NextResponse.json({ error: "Could not log the application." }, { status: 500 });
  }

  logActivity(params.id, {
    eventType: "application_submitted",
    title: "Application submitted",
    description: `${job.title} at ${job.company}`,
    meta: { run_id: run.id, job_post_id: jobPostId, source: "manual", logged_by_am_id: access.amId },
    refType: "application_runs",
    refId: run.id as string,
  }).catch((err) => console.error("[manual-applications] activity log failed:", err));

  return NextResponse.json({ ok: true, run_id: run.id, job_post_id: jobPostId });
}
