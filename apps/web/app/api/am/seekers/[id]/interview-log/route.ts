import { NextResponse } from "next/server";
import { requireAMAccessToSeeker } from "@/lib/am-access";
import { supabaseAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/feedback-loop";
import { findOrCreateJobPost, parseZonedDateTime, validateManualJob } from "@/lib/manual-capture";

const TYPES = ["phone", "video", "in_person"] as const;
type InterviewType = (typeof TYPES)[number];

function text(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}

/**
 * POST /api/am/seekers/[id]/interview-log
 * Quick-log an interview the AM arranged off-platform (WhatsApp, email, phone).
 * Saved as a confirmed interview so it counts in reports and, later, gets an
 * Emi prep call. Pass job_post_id to attach it to an existing application.
 * The client is not emailed: the AM already coordinated with them.
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

  const scheduledAt = parseZonedDateTime(body.scheduled_at);
  if (!scheduledAt) {
    return NextResponse.json({ error: "Interview date and time are required." }, { status: 400 });
  }

  const interviewType: InterviewType = TYPES.includes(body.interview_type as InterviewType)
    ? (body.interview_type as InterviewType)
    : "video";

  const duration = Number(body.duration_min ?? 30);
  if (!Number.isFinite(duration) || duration < 5 || duration > 480) {
    return NextResponse.json({ error: "Duration must be between 5 and 480 minutes." }, { status: 400 });
  }

  let jobPostId: string | null = typeof body.job_post_id === "string" ? body.job_post_id : null;
  if (jobPostId) {
    // Only jobs this seeker actually has a run for, so an AM can't attach a stranger's job.
    const { data: owned } = await supabaseAdmin
      .from("application_runs")
      .select("id")
      .eq("job_seeker_id", params.id)
      .eq("job_post_id", jobPostId)
      .limit(1)
      .maybeSingle();
    if (!owned) {
      return NextResponse.json({ error: "That application is not on this client's record." }, { status: 400 });
    }
  } else {
    const job = validateManualJob({ company: body.company, title: body.title, url: body.url });
    if ("error" in job) return NextResponse.json({ error: job.error }, { status: 400 });
    try {
      jobPostId = (await findOrCreateJobPost(params.id, job)).id;
    } catch (error) {
      console.error("Interview log job post failed:", error);
      return NextResponse.json({ error: "Could not save the job." }, { status: 500 });
    }
  }

  const nowIso = new Date().toISOString();
  const { data: interview, error } = await supabaseAdmin
    .from("interviews")
    .insert({
      job_post_id: jobPostId,
      job_seeker_id: params.id,
      account_manager_id: access.amId,
      interview_type: interviewType,
      duration_min: Math.round(duration),
      scheduled_at: scheduledAt.toISOString(),
      status: "confirmed",
      confirmed_at: nowIso,
      meeting_link: text(body.meeting_link, 1000),
      phone_number: text(body.phone_number, 50),
      address: text(body.address, 500),
      notes_internal: text(body.notes_internal, 2000),
      round: text(body.round, 100),
      interviewer: text(body.interviewer, 200),
      note_for_emi: text(body.note_for_emi, 1000),
      emi_prep_enabled: body.emi_prep_enabled !== false,
      source: "manual_log",
      logged_by_am_id: access.amId,
    })
    .select("id")
    .single();

  if (error || !interview) {
    console.error("Interview log insert failed:", error);
    return NextResponse.json({ error: "Could not log the interview." }, { status: 500 });
  }

  const { data: post } = await supabaseAdmin
    .from("job_posts")
    .select("title, company")
    .eq("id", jobPostId)
    .maybeSingle();

  logActivity(params.id, {
    eventType: "interview_scheduled",
    title: "Interview scheduled",
    description: `${post?.title ?? "Interview"}${post?.company ? ` at ${post.company}` : ""} on ${scheduledAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    meta: { interview_id: interview.id, job_post_id: jobPostId, type: interviewType, source: "manual_log" },
    refType: "interviews",
    refId: interview.id as string,
  }).catch((err) => console.error("[interview-log] activity log failed:", err));

  return NextResponse.json({ ok: true, interview_id: interview.id, job_post_id: jobPostId });
}
