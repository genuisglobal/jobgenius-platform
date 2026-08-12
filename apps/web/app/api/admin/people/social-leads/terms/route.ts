import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";
import {
  SOCIAL_LEAD_TERM_STATUSES,
  type SocialLeadTermStatus,
} from "@/lib/people";
import { logAdminAction } from "@/lib/audit";

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

  const termId =
    typeof body.id === "string" && body.id.trim() ? body.id.trim() : "";
  if (!termId) {
    return NextResponse.json({ error: "Social Lead term is required." }, { status: 400 });
  }

  const status: SocialLeadTermStatus =
    typeof body.status === "string" &&
    SOCIAL_LEAD_TERM_STATUSES.includes(body.status as SocialLeadTermStatus)
      ? (body.status as SocialLeadTermStatus)
      : "active";

  const { data: term, error } = await supabaseAdmin
    .from("social_lead_terms")
    .update({
      status,
      removal_reason:
        typeof body.removal_reason === "string"
          ? body.removal_reason.trim() || null
          : null,
    })
    .eq("id", termId)
    .select("*")
    .single();

  if (error || !term) {
    return NextResponse.json(
      { error: error?.message || "Failed to update Social Lead term." },
      { status: 500 }
    );
  }

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    adminRole: auth.user.role,
    action: "people.social_term_update",
    targetType: "social_lead_term",
    targetId: termId,
    details: {
      employee_id: term.employee_id,
      status,
    },
  }).catch(() => {});

  return NextResponse.json({ term });
}
