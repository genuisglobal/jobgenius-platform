import { NextResponse } from "next/server";
import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "25", 10) || 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: interviews, error, count } = await supabaseAdmin
    .from("interviews")
    .select("*", { count: "exact" })
    .eq("job_seeker_id", auth.user.id)
    .order("scheduled_at", { ascending: true })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: "Failed to load interviews." }, { status: 500 });
  }

  // Get prep materials for each interview
  const interviewIds = (interviews || []).map((i: { id: string }) => i.id);
  let prep: Record<string, unknown>[] = [];

  if (interviewIds.length > 0) {
    const { data: prepData } = await supabaseAdmin
      .from("interview_prep")
      .select("*")
      .in("interview_id", interviewIds);
    prep = prepData || [];
  }

  return NextResponse.json({
    interviews: interviews || [],
    prep,
    pagination: {
      page,
      pageSize,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    },
  });
}
