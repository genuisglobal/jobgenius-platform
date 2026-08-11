import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";

interface RouteContext {
  params: { id: string };
}

/**
 * Clone screening answers from another seeker to this one.
 * POST body: { source_seeker_id: string }
 */
export async function POST(request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const targetSeekerId = params.id;
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { source_seeker_id } = body;

  if (!source_seeker_id) {
    return NextResponse.json({ error: "source_seeker_id is required" }, { status: 400 });
  }

  // Verify access to both seekers
  if (!isAdminRole(user.role)) {
    const { data: assignments } = await supabaseAdmin
      .from("job_seeker_assignments")
      .select("job_seeker_id")
      .eq("account_manager_id", user.id)
      .in("job_seeker_id", [targetSeekerId, source_seeker_id]);

    if (!assignments || assignments.length < 2) {
      return NextResponse.json({ error: "Forbidden — must have access to both seekers" }, { status: 403 });
    }
  }

  // Fetch source answers
  const { data: sourceAnswers } = await supabaseAdmin
    .from("job_seeker_screening_answers")
    .select("question_key, question_text, answer_value, answer_type")
    .eq("job_seeker_id", source_seeker_id);

  if (!sourceAnswers || sourceAnswers.length === 0) {
    return NextResponse.json({ error: "Source seeker has no screening answers" }, { status: 400 });
  }

  // Upsert to target
  const upsertRows = sourceAnswers.map((a) => ({
    job_seeker_id: targetSeekerId,
    question_key: a.question_key,
    question_text: a.question_text,
    answer_value: a.answer_value,
    answer_type: a.answer_type,
  }));

  const { data: inserted, error } = await supabaseAdmin
    .from("job_seeker_screening_answers")
    .upsert(upsertRows, { onConflict: "job_seeker_id,question_key" })
    .select("*");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ cloned: inserted?.length ?? 0, answers: inserted });
}
