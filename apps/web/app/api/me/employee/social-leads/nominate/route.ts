import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { getEmployeeByAccountManagerId, getSocialLeadEligibilityForEmployee } from "@/lib/people-server";
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
  if (!electionId) {
    return NextResponse.json({ error: "Election is required." }, { status: 400 });
  }

  const employee = await getEmployeeByAccountManagerId(auth.user.id);
  if (!employee) {
    return NextResponse.json({ error: "Employee profile not found." }, { status: 404 });
  }

  const eligibility = await getSocialLeadEligibilityForEmployee(employee.id);
  if (!eligibility || !eligibility.eligible) {
    return NextResponse.json(
      { error: eligibility?.reasons[0] || "You are not eligible to stand for Social Lead." },
      { status: 400 }
    );
  }

  const { data: election, error: electionError } = await supabaseAdmin
    .from("social_lead_elections")
    .select("id, status")
    .eq("id", electionId)
    .maybeSingle();

  if (electionError || !election) {
    return NextResponse.json({ error: "Election not found." }, { status: 404 });
  }
  if (election.status !== "nominations_open") {
    return NextResponse.json({ error: "Nominations are not open." }, { status: 400 });
  }

  const { data: candidate, error } = await supabaseAdmin
    .from("social_lead_candidates")
    .upsert(
      {
        election_id: electionId,
        employee_id: employee.id,
        status: "nominated",
        nominated_by_employee_id: employee.id,
        approved_by: null,
        eligibility_snapshot: {
          tenure_months: eligibility.tenureMonths,
          average_score: eligibility.averageScore,
          has_active_disciplinary_issue: eligibility.hasActiveDisciplinaryIssue,
          has_integrity_block: eligibility.hasIntegrityBlock,
          completed_terms: eligibility.completedTerms,
          eligible: eligibility.eligible,
          reasons: eligibility.reasons,
        },
      },
      { onConflict: "election_id,employee_id" }
    )
    .select("*")
    .single();

  if (error || !candidate) {
    return NextResponse.json(
      { error: error?.message || "Failed to submit nomination." },
      { status: 500 }
    );
  }

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "people.social_candidate_update",
    targetType: "social_lead_candidate",
    targetId: candidate.id,
    details: {
      election_id: electionId,
      employee_id: employee.id,
      status: "nominated",
      source: "employee_self_nomination",
    },
  }).catch(() => {});

  return NextResponse.json({ candidate });
}
