import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { getWeekStart, toIsoDate } from "@/lib/client-reports";

// GET /api/am/client-reports?week=YYYY-MM-DD — the AM's weekly report queue
// (drafts + already-sent) for their assigned seekers. Defaults to this week.
export async function GET(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const weekParam = searchParams.get("week");
  const weekStart = weekParam
    ? toIsoDate(getWeekStart(new Date(`${weekParam}T00:00:00Z`)))
    : toIsoDate(getWeekStart());

  const { data: assignments } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("job_seeker_id")
    .eq("account_manager_id", auth.user.id);
  const seekerIds = (assignments ?? []).map((a) => a.job_seeker_id as string);
  if (seekerIds.length === 0) {
    return NextResponse.json({ week_start: weekStart, reports: [] });
  }

  const [{ data: reports }, { data: seekers }] = await Promise.all([
    supabaseAdmin
      .from("client_reports")
      .select(
        "id, job_seeker_id, week_start, stats, am_note, status, generated_at, sent_at"
      )
      .eq("week_start", weekStart)
      .in("job_seeker_id", seekerIds)
      .order("status", { ascending: true }) // DRAFT before SENT
      .order("generated_at", { ascending: true }),
    supabaseAdmin
      .from("job_seekers")
      .select("id, full_name, email")
      .in("id", seekerIds),
  ]);

  const seekerById = new Map((seekers ?? []).map((s) => [s.id as string, s]));

  return NextResponse.json({
    week_start: weekStart,
    reports: (reports ?? []).map((report) => ({
      ...report,
      seeker: seekerById.get(report.job_seeker_id as string) ?? null,
    })),
  });
}
