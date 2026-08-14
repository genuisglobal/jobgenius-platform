import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";
import {
  SOCIAL_CANDIDATE_STATUSES,
  type SocialCandidateStatus,
} from "@/lib/people";
import { logAdminAction } from "@/lib/audit";
import { getSocialLeadEligibilityForEmployee } from "@/lib/people-server";
import { sendNotification } from "@/lib/notify";

function unauthorized() {
  return NextResponse.json({ error: "People manager access required." }, { status: 403 });
}

export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isPeopleManagerRole(auth.user.role)) {
    return unauthorized();
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
  const employeeId =
    typeof body.employee_id === "string" && body.employee_id.trim()
      ? body.employee_id.trim()
      : "";

  if (!electionId || !employeeId) {
    return NextResponse.json(
      { error: "Election and employee are required." },
      { status: 400 }
    );
  }

  const status: SocialCandidateStatus =
    typeof body.status === "string" &&
    SOCIAL_CANDIDATE_STATUSES.includes(body.status as SocialCandidateStatus)
      ? (body.status as SocialCandidateStatus)
      : "nominated";

  const eligibility = await getSocialLeadEligibilityForEmployee(employeeId);
  if (!eligibility) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }
  if (status === "approved" && !eligibility.eligible) {
    return NextResponse.json(
      { error: eligibility.reasons[0] || "Employee is not eligible for Social Lead." },
      { status: 400 }
    );
  }

  const payload = {
    election_id: electionId,
    employee_id: employeeId,
    status,
    nominated_by_employee_id:
      typeof body.nominated_by_employee_id === "string" && body.nominated_by_employee_id.trim()
        ? body.nominated_by_employee_id.trim()
        : null,
    approved_by:
      status === "approved" || status === "rejected" ? auth.user.id : null,
    eligibility_snapshot: {
      tenure_months: eligibility.tenureMonths,
      average_score: eligibility.averageScore,
      has_active_disciplinary_issue: eligibility.hasActiveDisciplinaryIssue,
      has_integrity_block: eligibility.hasIntegrityBlock,
      completed_terms: eligibility.completedTerms,
      eligible: eligibility.eligible,
      reasons: eligibility.reasons,
    },
  };

  const { data: candidate, error } = await supabaseAdmin
    .from("social_lead_candidates")
    .upsert(payload, { onConflict: "election_id,employee_id" })
    .select("*")
    .single();

  if (error || !candidate) {
    return NextResponse.json(
      { error: error?.message || "Failed to save candidate." },
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
      employee_id: employeeId,
      status,
    },
  }).catch(() => {});

  if (eligibility.employee.account_manager_id && status === "approved") {
    sendNotification({
      userId: eligibility.employee.account_manager_id,
      userType: "am",
      category: "employee_social_candidate_approved",
      subject: "Your Social Lead candidacy was approved",
      body: "Management approved you to stand in the current Social Lead election.",
      linkUrl: "/dashboard/me/social",
      channel: "in_app",
      payload: {
        social_lead_election_id: electionId,
        social_lead_candidate_id: candidate.id,
      },
    }).catch(() => {});
  }

  return NextResponse.json({ candidate });
}
