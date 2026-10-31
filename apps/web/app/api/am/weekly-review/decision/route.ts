import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole, normalizeAMRole } from "@/lib/auth/roles";
import { parseFridayDecision } from "@/lib/friday-seeker-decisions";

export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (normalizeAMRole(auth.user.role) === "accountant") return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const parsed = parseFridayDecision(await request.json().catch(() => null));
  if (!parsed.value) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.value;
  const manager = isPeopleManagerRole(auth.user.role);

  const [{ data: assignment, error: assignmentError }, { data: owner, error: ownerError }] = await Promise.all([
    supabaseAdmin.from("job_seeker_assignments").select("account_manager_id")
      .eq("job_seeker_id", input.jobSeekerId).maybeSingle(),
    supabaseAdmin.from("account_managers").select("id, role, status")
      .eq("id", input.ownerId).maybeSingle(),
  ]);
  if (assignmentError || ownerError) return NextResponse.json({ error: "Could not verify the seeker and action owner." }, { status: 500 });
  if (!assignment || (!manager && assignment.account_manager_id !== auth.user.id)) {
    return NextResponse.json({ error: "You cannot update this seeker's Friday review." }, { status: 403 });
  }
  if (!owner || owner.status !== "approved" || normalizeAMRole(owner.role) !== "am" || (!manager && owner.id !== auth.user.id)) {
    return NextResponse.json({ error: "Select an approved account manager as action owner." }, { status: 400 });
  }

  const { data: existing, error: lookupError } = await supabaseAdmin.from("friday_seeker_decisions")
    .select("id, completed_at")
    .eq("week_start", input.weekStart).eq("job_seeker_id", input.jobSeekerId).maybeSingle();
  if (lookupError) return NextResponse.json({ error: "Friday decisions are not available yet. Apply migration 130." }, { status: 503 });
  const fields = {
    decision: input.decision,
    next_action: input.nextAction,
    owner_account_manager_id: input.ownerId,
    due_date: input.dueDate,
    status: input.status,
    completed_at: input.status === "done" ? existing?.completed_at ?? new Date().toISOString() : null,
    updated_by: auth.user.id,
  };
  const query = existing
    ? supabaseAdmin.from("friday_seeker_decisions").update(fields).eq("id", existing.id)
    : supabaseAdmin.from("friday_seeker_decisions").insert({ ...fields, week_start: input.weekStart, job_seeker_id: input.jobSeekerId, recorded_by: auth.user.id });
  const { data, error } = await query.select("id, week_start, job_seeker_id, decision, next_action, owner_account_manager_id, due_date, status, completed_at").single();
  if (error) return NextResponse.json({ error: "Could not save the Friday decision. Refresh and try again." }, { status: 500 });
  return NextResponse.json({ decision: data });
}
