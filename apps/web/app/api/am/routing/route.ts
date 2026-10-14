import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";

// POST: Create or update a routing decision
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
  const { job_seeker_id, job_post_id, decision, note } = body;

  if (!job_seeker_id || !job_post_id || !decision) {
    return NextResponse.json(
      { error: "job_seeker_id, job_post_id, and decision are required." },
      { status: 400 }
    );
  }

  if (!["OVERRIDDEN_IN", "OVERRIDDEN_OUT", "AUTO"].includes(decision)) {
    return NextResponse.json(
      { error: "decision must be OVERRIDDEN_IN, OVERRIDDEN_OUT, or AUTO." },
      { status: 400 }
    );
  }

  if (!(await hasJobSeekerAccess(auth.user.id, job_seeker_id))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  // Upsert routing decision
  const { data, error } = await supabaseAdmin
    .from("job_routing_decisions")
    .upsert(
      {
        job_seeker_id,
        job_post_id,
        decision,
        note: note || null,
        decided_by: auth.user.email,
      },
      { onConflict: "job_post_id,job_seeker_id" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to save routing decision." }, { status: 500 });
  }

  return NextResponse.json({ decision: data });
}

// DELETE: Remove a routing decision (revert to auto)
export async function DELETE(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const job_seeker_id = searchParams.get("job_seeker_id");
  const job_post_id = searchParams.get("job_post_id");

  if (!job_seeker_id || !job_post_id) {
    return NextResponse.json(
      { error: "job_seeker_id and job_post_id are required." },
      { status: 400 }
    );
  }

  if (!(await hasJobSeekerAccess(auth.user.id, job_seeker_id))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from("job_routing_decisions")
    .delete()
    .eq("job_seeker_id", job_seeker_id)
    .eq("job_post_id", job_post_id);

  if (error) {
    return NextResponse.json({ error: "Failed to delete routing decision." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
