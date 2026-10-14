import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import {
  buildAdjacentOpportunity,
  buildMatchExplanation,
} from "@/lib/matching/explanations";
import { resolveQueueCategory } from "@/lib/queue-categories";

// GET: Get queue items for a seeker
export async function GET(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const job_seeker_id = searchParams.get("job_seeker_id");
  const status = searchParams.get("status");

  if (!job_seeker_id) {
    return NextResponse.json({ error: "job_seeker_id is required." }, { status: 400 });
  }

  if (!(await hasJobSeekerAccess(auth.user.id, job_seeker_id))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "25", 10) || 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabaseAdmin
    .from("application_queue")
    .select(`
      id, status, category, created_at, updated_at, last_error,
      job_posts (id, title, company, location, url)
    `, { count: "exact" })
    .eq("job_seeker_id", job_seeker_id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to load queue." }, { status: 500 });
  }

  return NextResponse.json({
    queue: data,
    pagination: {
      page,
      pageSize,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    },
  });
}

// POST: Add a job to the queue
export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { job_seeker_id, job_post_id, category } = body;

  if (!job_seeker_id || !job_post_id) {
    return NextResponse.json(
      { error: "job_seeker_id and job_post_id are required." },
      { status: 400 }
    );
  }

  if (!(await hasJobSeekerAccess(auth.user.id, job_seeker_id))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  // Check if already in queue
  const { data: existing } = await supabaseAdmin
    .from("application_queue")
    .select("id")
    .eq("job_seeker_id", job_seeker_id)
    .eq("job_post_id", job_post_id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "Job already in queue." }, { status: 400 });
  }

  const { data: matchScore } = await supabaseAdmin
    .from("job_match_scores")
    .select("score, confidence, recommendation, reasons")
    .eq("job_seeker_id", job_seeker_id)
    .eq("job_post_id", job_post_id)
    .maybeSingle();

  const { data: seeker } = await supabaseAdmin
    .from("job_seekers")
    .select("match_threshold")
    .eq("id", job_seeker_id)
    .maybeSingle();

  const explanation = buildMatchExplanation(matchScore?.reasons, {
    score: matchScore?.score ?? null,
    confidence: matchScore?.confidence ?? null,
    recommendation: matchScore?.recommendation ?? null,
  });

  if (explanation.queueBlocked) {
    return NextResponse.json(
      {
        error: explanation.queueBlockReason || "This match is blocked from queueing.",
        queue_blocked: true,
        reason: explanation.queueBlockCode,
      },
      { status: 400 }
    );
  }

  const adjacent = buildAdjacentOpportunity(matchScore?.reasons, {
    score: matchScore?.score ?? null,
    confidence: matchScore?.confidence ?? null,
    recommendation: matchScore?.recommendation ?? null,
    threshold: seeker?.match_threshold ?? 60,
  });
  const queueCategory = resolveQueueCategory({
    requestedCategory: category,
    defaultCategory: "manual",
    adjacentEligible: adjacent.eligible,
  });

  const { data, error } = await supabaseAdmin
    .from("application_queue")
    .insert({
      job_seeker_id,
      job_post_id,
      status: "QUEUED",
      category: queueCategory,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to add to queue." }, { status: 500 });
  }

  return NextResponse.json({ queue_item: data }, { status: 201 });
}

// DELETE: Remove a job from the queue
export async function DELETE(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const job_seeker_id = searchParams.get("job_seeker_id");

  if (!id || !job_seeker_id) {
    return NextResponse.json({ error: "id and job_seeker_id are required." }, { status: 400 });
  }

  if (!(await hasJobSeekerAccess(auth.user.id, job_seeker_id))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  // Only allow deleting QUEUED items
  const { error } = await supabaseAdmin
    .from("application_queue")
    .delete()
    .eq("id", id)
    .eq("job_seeker_id", job_seeker_id)
    .eq("status", "QUEUED");

  if (error) {
    return NextResponse.json({ error: "Failed to remove from queue." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
