import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";

// GET /api/am/outreach/scheduling-links — pending detected scheduling links
// across the AM's assigned seekers, newest first.
export async function GET(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data: assignments } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("job_seeker_id")
    .eq("account_manager_id", auth.user.id);
  const seekerIds = (assignments ?? []).map((a) => a.job_seeker_id as string);
  if (seekerIds.length === 0) return NextResponse.json({ links: [] });

  const { data: threads } = await supabaseAdmin
    .from("recruiter_threads")
    .select("id, job_seeker_id, recruiter_id")
    .in("job_seeker_id", seekerIds);
  const threadIds = (threads ?? []).map((t) => t.id as string);
  if (threadIds.length === 0) return NextResponse.json({ links: [] });

  const { data: messages } = await supabaseAdmin
    .from("outreach_messages")
    .select("id, recruiter_thread_id, body, detected_scheduling_link, detected_scheduling_provider, created_at")
    .in("recruiter_thread_id", threadIds)
    .eq("scheduling_link_status", "PENDING")
    .order("created_at", { ascending: false })
    .limit(50);
  if (!messages || messages.length === 0) return NextResponse.json({ links: [] });

  const threadById = new Map((threads ?? []).map((t) => [t.id as string, t]));
  const recruiterIds = Array.from(
    new Set(messages.map((m) => threadById.get(m.recruiter_thread_id as string)?.recruiter_id).filter(Boolean))
  ) as string[];
  const seekerIdsInvolved = Array.from(
    new Set(messages.map((m) => threadById.get(m.recruiter_thread_id as string)?.job_seeker_id).filter(Boolean))
  ) as string[];

  // Recent applied jobs per involved seeker, for the "which role is this
  // interview for" picker — recruiters usually follow up about a role the
  // seeker actually applied to, so this covers the common case without a
  // full search UI. AM can leave it unselected if none match.
  const { data: recentRuns } = seekerIdsInvolved.length
    ? await supabaseAdmin
        .from("application_runs")
        .select("job_seeker_id, job_post_id, updated_at")
        .in("job_seeker_id", seekerIdsInvolved)
        .eq("status", "COMPLETED")
        .order("updated_at", { ascending: false })
        .limit(200)
    : { data: [] as never[] };
  const postIds = Array.from(
    new Set((recentRuns ?? []).map((r) => r.job_post_id as string).filter(Boolean))
  );

  const [{ data: recruiters }, { data: seekers }, { data: jobPosts }] = await Promise.all([
    recruiterIds.length
      ? supabaseAdmin.from("recruiters").select("id, name, company").in("id", recruiterIds)
      : Promise.resolve({ data: [] as never[] }),
    seekerIdsInvolved.length
      ? supabaseAdmin.from("job_seekers").select("id, full_name").in("id", seekerIdsInvolved)
      : Promise.resolve({ data: [] as never[] }),
    postIds.length
      ? supabaseAdmin.from("job_posts").select("id, title, company").in("id", postIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);
  const recruiterById = new Map((recruiters ?? []).map((r) => [r.id as string, r]));
  const seekerById = new Map((seekers ?? []).map((s) => [s.id as string, s]));
  const jobPostById = new Map((jobPosts ?? []).map((p) => [p.id as string, p]));

  const recentJobsBySeeker = new Map<string, Array<{ job_post_id: string; title: string; company: string }>>();
  for (const run of recentRuns ?? []) {
    const seekerId = run.job_seeker_id as string;
    const post = jobPostById.get(run.job_post_id as string);
    if (!post) continue;
    const list = recentJobsBySeeker.get(seekerId) ?? [];
    if (list.length >= 8 || list.some((j) => j.job_post_id === run.job_post_id)) continue;
    list.push({ job_post_id: run.job_post_id as string, title: post.title as string, company: post.company as string });
    recentJobsBySeeker.set(seekerId, list);
  }

  return NextResponse.json({
    links: messages.map((m) => {
      const thread = threadById.get(m.recruiter_thread_id as string);
      const recruiter = thread ? recruiterById.get(thread.recruiter_id as string) : null;
      const seeker = thread ? seekerById.get(thread.job_seeker_id as string) : null;
      return {
        message_id: m.id,
        thread_id: m.recruiter_thread_id,
        job_seeker_id: thread?.job_seeker_id ?? null,
        seeker_name: seeker?.full_name ?? "Unknown seeker",
        recruiter_name: recruiter?.name ?? "Unknown recruiter",
        recruiter_company: recruiter?.company ?? null,
        scheduling_link: m.detected_scheduling_link,
        scheduling_provider: m.detected_scheduling_provider,
        body_excerpt: (m.body as string | null)?.slice(0, 240) ?? "",
        created_at: m.created_at,
        recent_jobs: thread ? recentJobsBySeeker.get(thread.job_seeker_id as string) ?? [] : [],
      };
    }),
  });
}

// POST /api/am/outreach/scheduling-links — dismiss or mark converted.
// Creating the actual interview is a separate call to POST /api/interviews;
// this route only updates the message's status once that's done (or the AM
// dismisses it without booking).
export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let payload: { message_id?: string; action?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const action = payload.action ?? "";
  if (!payload.message_id || !["converted", "dismissed"].includes(action)) {
    return NextResponse.json(
      { error: "message_id and action (converted|dismissed) are required." },
      { status: 400 }
    );
  }

  const { data: message } = await supabaseAdmin
    .from("outreach_messages")
    .select("id, recruiter_thread_id")
    .eq("id", payload.message_id)
    .maybeSingle();
  if (!message) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }

  const { data: thread } = await supabaseAdmin
    .from("recruiter_threads")
    .select("job_seeker_id")
    .eq("id", message.recruiter_thread_id as string)
    .maybeSingle();
  const { data: assignment } = thread
    ? await supabaseAdmin
        .from("job_seeker_assignments")
        .select("job_seeker_id")
        .eq("account_manager_id", auth.user.id)
        .eq("job_seeker_id", thread.job_seeker_id as string)
        .maybeSingle()
    : { data: null };
  if (!assignment) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from("outreach_messages")
    .update({ scheduling_link_status: action === "converted" ? "CONVERTED" : "DISMISSED" })
    .eq("id", message.id);
  if (error) {
    return NextResponse.json({ error: "Failed to update." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
