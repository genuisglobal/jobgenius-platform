import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";

// GET /api/am/follow-ups — pending drafts for the AM's assigned seekers.
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
  if (seekerIds.length === 0) return NextResponse.json({ drafts: [] });

  const { data: drafts } = await supabaseAdmin
    .from("follow_up_drafts")
    .select("id, run_id, job_seeker_id, follow_up_day, draft_text, created_at")
    .eq("status", "PENDING")
    .in("job_seeker_id", seekerIds)
    .order("created_at", { ascending: true })
    .limit(50);

  const runIds = (drafts ?? []).map((d) => d.run_id as string);
  const [{ data: runs }, { data: seekers }] = await Promise.all([
    runIds.length
      ? supabaseAdmin
          .from("application_runs")
          .select("id, job_post_id, updated_at")
          .in("id", runIds)
      : Promise.resolve({ data: [] as never[] }),
    supabaseAdmin.from("job_seekers").select("id, full_name").in("id", seekerIds),
  ]);

  const postIds = Array.from(
    new Set((runs ?? []).map((r) => r.job_post_id as string).filter(Boolean))
  );
  const { data: posts } = postIds.length
    ? await supabaseAdmin.from("job_posts").select("id, title, company, url").in("id", postIds)
    : { data: [] as never[] };

  const runById = new Map((runs ?? []).map((r) => [r.id as string, r]));
  const postById = new Map((posts ?? []).map((p) => [p.id as string, p]));
  const seekerById = new Map((seekers ?? []).map((s) => [s.id as string, s]));

  return NextResponse.json({
    drafts: (drafts ?? []).map((draft) => {
      const run = runById.get(draft.run_id as string);
      const post = run ? postById.get(run.job_post_id as string) : null;
      return {
        ...draft,
        applied_at: run?.updated_at ?? null,
        job: post ? { title: post.title, company: post.company, url: post.url } : null,
        seeker: seekerById.get(draft.job_seeker_id as string) ?? null,
      };
    }),
  });
}

// POST /api/am/follow-ups — mark a draft handled (sent by the AM through
// their channel of choice) or dismissed. Never sends anything itself.
export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let payload: { draft_id?: string; action?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const action = payload.action ?? "";
  if (!payload.draft_id || !["handled", "dismissed"].includes(action)) {
    return NextResponse.json(
      { error: "draft_id and action (handled|dismissed) are required." },
      { status: 400 }
    );
  }

  // Scope to the AM's assigned seekers.
  const { data: draft } = await supabaseAdmin
    .from("follow_up_drafts")
    .select("id, job_seeker_id, status")
    .eq("id", payload.draft_id)
    .maybeSingle();
  if (!draft) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }
  const { data: assignment } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("job_seeker_id")
    .eq("account_manager_id", auth.user.id)
    .eq("job_seeker_id", draft.job_seeker_id as string)
    .maybeSingle();
  if (!assignment) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from("follow_up_drafts")
    .update({
      status: action === "handled" ? "HANDLED" : "DISMISSED",
      handled_at: new Date().toISOString(),
      handled_by: auth.user.id,
    })
    .eq("id", draft.id);
  if (error) {
    return NextResponse.json({ error: "Failed to update draft." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
