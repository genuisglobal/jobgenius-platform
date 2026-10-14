import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";
import { logAdminAction } from "@/lib/audit";
import { sendNotification } from "@/lib/notify";
import { getSocialLeadEligibilityForEmployee } from "@/lib/people-server";

function unauthorized() {
  return NextResponse.json({ error: "People manager access required." }, { status: 403 });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
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

  const electionId = params.id;
  const winnerEmployeeId =
    typeof body.winner_employee_id === "string" && body.winner_employee_id.trim()
      ? body.winner_employee_id.trim()
      : "";
  if (!winnerEmployeeId) {
    return NextResponse.json({ error: "Winner is required." }, { status: 400 });
  }

  const [{ data: election, error: electionError }, { data: candidate, error: candidateError }] =
    await Promise.all([
      supabaseAdmin
        .from("social_lead_elections")
        .select("*")
        .eq("id", electionId)
        .maybeSingle(),
      supabaseAdmin
        .from("social_lead_candidates")
        .select("*")
        .eq("election_id", electionId)
        .eq("employee_id", winnerEmployeeId)
        .eq("status", "approved")
        .maybeSingle(),
    ]);

  if (electionError || !election) {
    return NextResponse.json({ error: "Election not found." }, { status: 404 });
  }
  if (candidateError || !candidate) {
    return NextResponse.json({ error: "Approved winner candidate not found." }, { status: 404 });
  }

  const eligibility = await getSocialLeadEligibilityForEmployee(winnerEmployeeId);
  if (!eligibility || !eligibility.eligible) {
    return NextResponse.json(
      { error: eligibility?.reasons[0] || "Winner is no longer eligible." },
      { status: 400 }
    );
  }
  if (eligibility.completedTerms >= 2) {
    return NextResponse.json(
      { error: "This employee has already reached the maximum 2 terms." },
      { status: 400 }
    );
  }

  const nextTermNumber = eligibility.completedTerms + 1;
  const { data: existingTerm } = await supabaseAdmin
    .from("social_lead_terms")
    .select("id")
    .eq("election_id", electionId)
    .eq("employee_id", winnerEmployeeId)
    .maybeSingle();

  const termPayload = {
    employee_id: winnerEmployeeId,
    election_id: electionId,
    term_number: nextTermNumber,
    term_start: election.term_start,
    term_end: election.term_end,
    status: "active",
    removal_reason: null,
  };

  const termResult = existingTerm?.id
    ? await supabaseAdmin
        .from("social_lead_terms")
        .update(termPayload)
        .eq("id", existingTerm.id)
        .select("*")
        .single()
    : await supabaseAdmin
        .from("social_lead_terms")
        .insert(termPayload)
        .select("*")
        .single();

  if (termResult.error || !termResult.data) {
    return NextResponse.json(
      { error: termResult.error?.message || "Failed to create Social Lead term." },
      { status: 500 }
    );
  }

  const { error: electionUpdateError } = await supabaseAdmin
    .from("social_lead_elections")
    .update({ status: "certified" })
    .eq("id", electionId);

  if (electionUpdateError) {
    return NextResponse.json({ error: electionUpdateError.message }, { status: 500 });
  }

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "people.social_election_update",
    targetType: "social_lead_election",
    targetId: electionId,
    details: {
      status: "certified",
      winner_employee_id: winnerEmployeeId,
      term_id: termResult.data.id,
    },
  }).catch(() => {});

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "people.social_term_update",
    targetType: "social_lead_term",
    targetId: termResult.data.id,
    details: {
      employee_id: winnerEmployeeId,
      status: "active",
      term_number: nextTermNumber,
    },
  }).catch(() => {});

  if (eligibility.employee.account_manager_id) {
    sendNotification({
      userId: eligibility.employee.account_manager_id,
      userType: "am",
      category: "employee_social_lead_selected",
      subject: "You were certified as Social Lead",
      body: `Management certified you as Social Lead for ${election.title}.`,
      linkUrl: "/dashboard/me/social",
      channel: "in_app",
      payload: {
        social_lead_election_id: electionId,
        social_lead_term_id: termResult.data.id,
      },
    }).catch(() => {});
  }

  return NextResponse.json({ term: termResult.data });
}
