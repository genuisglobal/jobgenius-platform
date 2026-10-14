import { NextResponse } from "next/server";
import { requireJobSeeker, supabaseAdmin } from "@/lib/auth";

export async function POST(request: Request) {
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
  const { planType } = body;

  if (!["essentials", "premium"].includes(planType)) {
    return NextResponse.json({ error: "Invalid plan type." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("job_seekers")
    .update({ plan_type: planType })
    .eq("id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to save plan selection." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, planType });
}
