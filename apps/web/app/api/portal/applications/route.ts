import { NextResponse } from "next/server";
import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "25", 10) || 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Get queued applications
  let queueQuery = supabaseAdmin
    .from("application_queue")
    .select("*", { count: "exact" })
    .eq("job_seeker_id", auth.user.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) {
    queueQuery = queueQuery.eq("status", status.toUpperCase());
  }

  const { data: queued, error: queueError, count: queueCount } = await queueQuery;

  // Get application runs
  let runsQuery = supabaseAdmin
    .from("application_runs")
    .select("*", { count: "exact" })
    .eq("job_seeker_id", auth.user.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) {
    runsQuery = runsQuery.eq("status", status.toUpperCase());
  }

  const { data: runs, error: runsError, count: runsCount } = await runsQuery;

  if (queueError || runsError) {
    return NextResponse.json({ error: "Failed to load applications." }, { status: 500 });
  }

  return NextResponse.json({
    queued: queued || [],
    runs: runs || [],
    pagination: {
      page,
      pageSize,
      queuedTotal: queueCount ?? 0,
      runsTotal: runsCount ?? 0,
      queuedTotalPages: Math.ceil((queueCount ?? 0) / pageSize),
      runsTotalPages: Math.ceil((runsCount ?? 0) / pageSize),
    },
  });
}
