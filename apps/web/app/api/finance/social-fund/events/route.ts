import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isFinanceRole, isPeopleManagerRole } from "@/lib/auth/roles";
import { SOCIAL_EVENT_STATUSES, type SocialEventStatus } from "@/lib/people";
import { logAdminAction } from "@/lib/audit";

function canAccess(role: string | null | undefined): boolean {
  return isFinanceRole(role) || isPeopleManagerRole(role);
}

function unauthorized() {
  return NextResponse.json(
    { error: "Finance or people manager access required." },
    { status: 403 }
  );
}

export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!canAccess(auth.user.role)) {
    return unauthorized();
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const eventId = typeof body.id === "string" && body.id.trim() ? body.id.trim() : null;
  const title =
    typeof body.title === "string" && body.title.trim() ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Event title is required." }, { status: 400 });
  }

  const status: SocialEventStatus =
    typeof body.status === "string" &&
    SOCIAL_EVENT_STATUSES.includes(body.status as SocialEventStatus)
      ? (body.status as SocialEventStatus)
      : "planned";

  const payload = {
    title,
    description:
      typeof body.description === "string" ? body.description.trim() || null : null,
    event_date:
      typeof body.event_date === "string" && body.event_date.trim()
        ? body.event_date.trim()
        : null,
    status,
    coordinated_by_employee_id:
      typeof body.coordinated_by_employee_id === "string" &&
      body.coordinated_by_employee_id.trim()
        ? body.coordinated_by_employee_id.trim()
        : null,
    notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
  };

  const query = supabaseAdmin.from("social_events");
  const result = eventId
    ? await query.update(payload).eq("id", eventId).select("*").single()
    : await query.insert(payload).select("*").single();

  if (result.error || !result.data) {
    return NextResponse.json(
      { error: result.error?.message || "Failed to save social event." },
      { status: 500 }
    );
  }

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "people.social_event_update",
    targetType: "social_event",
    targetId: result.data.id,
    details: { status, event_date: payload.event_date },
  }).catch(() => {});

  return NextResponse.json({ event: result.data });
}
