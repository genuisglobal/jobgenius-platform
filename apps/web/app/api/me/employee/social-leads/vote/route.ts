import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { getEmployeeByAccountManagerId } from "@/lib/people-server";
import { logAdminAction } from "@/lib/audit";

export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const electionId =
    typeof body.election_id === "string" && body.election_id.trim()
      ? body.election_id.trim()
      : "";
  const candidateEmployeeId =
    typeof body.candidate_employee_id === "string" && body.candidate_employee_id.trim()
      ? body.candidate_employee_id.trim()
      : "";

  if (!electionId || !candidateEmployeeId) {
    return NextResponse.json(
      { error: "Election and candidate are required." },
      { status: 400 }
    );
  }

  const employee = await getEmployeeByAccountManagerId(auth.user.id);
  if (!employee) {
    return NextResponse.json({ error: "Employee profile not found." }, { status: 404 });
  }

  const [{ data: election, error: electionError }, { data: candidate, error: candidateError }] =
    await Promise.all([
      supabaseAdmin
        .from("social_lead_elections")
        .select("id, status")
        .eq("id", electionId)
        .maybeSingle(),
      supabaseAdmin
        .from("social_lead_candidates")
        .select("id, employee_id, status")
        .eq("election_id", electionId)
        .eq("employee_id", candidateEmployeeId)
        .maybeSingle(),
    ]);

  if (electionError || !election) {
    return NextResponse.json({ error: "Election not found." }, { status: 404 });
  }
  if (election.status !== "voting_open") {
    return NextResponse.json({ error: "Voting is not open." }, { status: 400 });
  }
  if (candidateError || !candidate || candidate.status !== "approved") {
    return NextResponse.json({ error: "Candidate is not approved for voting." }, { status: 404 });
  }

  const { data: vote, error } = await supabaseAdmin
    .from("social_lead_votes")
    .upsert(
      {
        election_id: electionId,
        voter_employee_id: employee.id,
        candidate_employee_id: candidateEmployeeId,
      },
      { onConflict: "election_id,voter_employee_id" }
    )
    .select("*")
    .single();

  if (error || !vote) {
    return NextResponse.json(
      { error: error?.message || "Failed to cast vote." },
      { status: 500 }
    );
  }

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "people.social_vote_cast",
    targetType: "social_lead_vote",
    targetId: vote.id,
    details: {
      election_id: electionId,
      voter_employee_id: employee.id,
      candidate_employee_id: candidateEmployeeId,
    },
  }).catch(() => {});

  return NextResponse.json({ vote });
}
