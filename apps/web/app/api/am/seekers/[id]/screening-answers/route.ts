import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { NextResponse } from "next/server";

interface RouteContext {
  params: { id: string };
}

async function verifyAccess(userId: string, role: string | undefined, seekerId: string) {
  if (isAdminRole(role)) return true;

  const { data: assignment } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("id")
    .eq("account_manager_id", userId)
    .eq("job_seeker_id", seekerId)
    .maybeSingle();

  return !!assignment;
}

export async function GET(request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;

  const hasAccess = await verifyAccess(user.id, user.role, id);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: answers, error } = await supabaseAdmin
    .from("job_seeker_screening_answers")
    .select("*")
    .eq("job_seeker_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ answers });
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;

  const hasAccess = await verifyAccess(user.id, user.role, id);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { question_key, question_text, answer_value, answer_type } = body;

  if (!question_key || answer_value === undefined) {
    return NextResponse.json(
      { error: "question_key and answer_value are required" },
      { status: 400 }
    );
  }

  const upsertData: Record<string, unknown> = {
    job_seeker_id: id,
    question_key,
    answer_value,
  };
  if (question_text !== undefined) upsertData.question_text = question_text;
  if (answer_type !== undefined) upsertData.answer_type = answer_type;

  const { data: answer, error } = await supabaseAdmin
    .from("job_seeker_screening_answers")
    .upsert(upsertData, { onConflict: "job_seeker_id,question_key" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ answer });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;

  const hasAccess = await verifyAccess(user.id, user.role, id);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { answer_id } = body;

  if (!answer_id) {
    return NextResponse.json(
      { error: "answer_id is required" },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("job_seeker_screening_answers")
    .delete()
    .eq("id", answer_id)
    .eq("job_seeker_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
