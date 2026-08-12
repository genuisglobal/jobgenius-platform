import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";
import {
  SOCIAL_ELECTION_STATUSES,
  type SocialElectionStatus,
} from "@/lib/people";
import { logAdminAction } from "@/lib/audit";
import { sendNotification } from "@/lib/notify";

function unauthorized() {
  return NextResponse.json({ error: "People manager access required." }, { status: 403 });
}

async function notifyElectionStatus(status: SocialElectionStatus, electionId: string, title: string) {
  if (status !== "nominations_open" && status !== "voting_open") return;

  const { data: employees, error } = await supabaseAdmin
    .from("employees")
    .select("account_manager_id")
    .eq("active", true)
    .not("account_manager_id", "is", null);

  if (error) return;

  await Promise.allSettled(
    (employees ?? [])
      .map((row) => row.account_manager_id)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .map((userId) =>
        sendNotification({
          userId,
          userType: "am",
          category:
            status === "nominations_open"
              ? "employee_social_nominations_open"
              : "employee_social_voting_open",
          subject:
            status === "nominations_open"
              ? "Social Lead nominations are open"
              : "Social Lead voting is open",
          body:
            status === "nominations_open"
              ? `${title} is now open for eligible staff nominations.`
              : `${title} is now open for employee voting.`,
          linkUrl: "/dashboard/me/social",
          channel: "in_app",
          payload: {
            social_lead_election_id: electionId,
            status,
          },
        })
      )
  );
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
    typeof body.id === "string" && body.id.trim() ? body.id.trim() : null;
  const title =
    typeof body.title === "string" && body.title.trim() ? body.title.trim() : "";
  const termStart =
    typeof body.term_start === "string" && body.term_start.trim()
      ? body.term_start.trim()
      : "";
  const termEnd =
    typeof body.term_end === "string" && body.term_end.trim()
      ? body.term_end.trim()
      : "";

  if (!title || !termStart || !termEnd) {
    return NextResponse.json(
      { error: "Title, term start, and term end are required." },
      { status: 400 }
    );
  }

  const status: SocialElectionStatus =
    typeof body.status === "string" &&
    SOCIAL_ELECTION_STATUSES.includes(body.status as SocialElectionStatus)
      ? (body.status as SocialElectionStatus)
      : "draft";

  if (status === "certified") {
    return NextResponse.json(
      { error: "Use the certify action to finalize the election winner." },
      { status: 400 }
    );
  }

  const existingStatus = electionId
    ? await supabaseAdmin
        .from("social_lead_elections")
        .select("status")
        .eq("id", electionId)
        .maybeSingle()
    : null;

  if (existingStatus?.error) {
    return NextResponse.json({ error: existingStatus.error.message }, { status: 500 });
  }

  const payload = {
    title,
    term_start: termStart,
    term_end: termEnd,
    nominations_open_at:
      typeof body.nominations_open_at === "string" && body.nominations_open_at.trim()
        ? body.nominations_open_at.trim()
        : null,
    nominations_close_at:
      typeof body.nominations_close_at === "string" && body.nominations_close_at.trim()
        ? body.nominations_close_at.trim()
        : null,
    voting_open_at:
      typeof body.voting_open_at === "string" && body.voting_open_at.trim()
        ? body.voting_open_at.trim()
        : null,
    voting_close_at:
      typeof body.voting_close_at === "string" && body.voting_close_at.trim()
        ? body.voting_close_at.trim()
        : null,
    status,
    created_by: auth.user.id,
    notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
  };

  const query = supabaseAdmin.from("social_lead_elections");
  const result = electionId
    ? await query.update(payload).eq("id", electionId).select("*").single()
    : await query.insert(payload).select("*").single();

  if (result.error || !result.data) {
    return NextResponse.json(
      { error: result.error?.message || "Failed to save election." },
      { status: 500 }
    );
  }

  const election = result.data;
  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "people.social_election_update",
    targetType: "social_lead_election",
    targetId: election.id,
    details: {
      title,
      status,
      term_start: termStart,
      term_end: termEnd,
    },
  }).catch(() => {});

  if (!existingStatus || existingStatus.data?.status !== status) {
    await notifyElectionStatus(status, election.id, title);
  }

  return NextResponse.json({ election });
}
