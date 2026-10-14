import { NextResponse } from "next/server";
import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await supabaseAdmin
    .from("job_seeker_references")
    .select("*")
    .eq("job_seeker_id", auth.user.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to load references." }, { status: 500 });
  }

  return NextResponse.json({ references: data });
}

export async function POST(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Enforce max 10 references
  const { count } = await supabaseAdmin
    .from("job_seeker_references")
    .select("id", { count: "exact", head: true })
    .eq("job_seeker_id", auth.user.id);

  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: "Maximum 10 references allowed." }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { name, title, company, email, phone, relationship } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("job_seeker_references")
    .insert({
      job_seeker_id: auth.user.id,
      name,
      title: title || null,
      company: company || null,
      email: email || null,
      phone: phone || null,
      relationship: relationship || "other",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to add reference." }, { status: 500 });
  }

  return NextResponse.json({ reference: data }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Reference ID required." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("job_seeker_references")
    .delete()
    .eq("id", id)
    .eq("job_seeker_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to delete reference." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
