import { NextResponse } from "next/server";
import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await supabaseAdmin
    .from("job_seeker_answers")
    .select("*")
    .eq("job_seeker_id", auth.user.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to load answers." }, { status: 500 });
  }

  return NextResponse.json({ answers: data });
}

export async function PUT(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { question_key, question_text, answer } = body;

  if (!question_key || !question_text) {
    return NextResponse.json({ error: "question_key and question_text are required." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("job_seeker_answers")
    .upsert(
      {
        job_seeker_id: auth.user.id,
        question_key,
        question_text,
        answer: answer || "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "job_seeker_id,question_key" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to save answer." }, { status: 500 });
  }

  return NextResponse.json({ answer: data });
}
