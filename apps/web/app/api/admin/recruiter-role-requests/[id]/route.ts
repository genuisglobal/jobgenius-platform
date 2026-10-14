import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/audit";
import { isRoleRequestStatus, toNullableTrimmedText } from "@/lib/recruiter-partners";
import { logRecruiterPartnerActivity } from "@/lib/recruiter-partner-server";

type RouteContext = {
  params: { id: string };
};

type UpdatePayload = {
  assignedAccountManagerId?: string | null;
  status?: string;
  doNotContact?: boolean;
  internalNote?: string | null;
};

const RESPONSE_STAMP_STATUSES = new Set([
  "awaiting_details",
  "candidate_shortlist_sent",
  "active",
]);

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let payload: UpdatePayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const assignedAccountManagerId =
    typeof payload.assignedAccountManagerId === "string"
      ? payload.assignedAccountManagerId.trim() || null
      : null;
  const status = toNullableTrimmedText(payload.status);
  const internalNote = toNullableTrimmedText(payload.internalNote);
  const doNotContact = payload.doNotContact === true;

  if (!isRoleRequestStatus(status)) {
    return NextResponse.json({ error: "Invalid request status." }, { status: 400 });
  }

  if (assignedAccountManagerId) {
    const { data: owner } = await supabaseAdmin
      .from("account_managers")
      .select("id")
      .eq("id", assignedAccountManagerId)
      .eq("status", "approved")
      .maybeSingle();

    if (!owner?.id) {
      return NextResponse.json(
        { error: "Assigned account manager not found." },
        { status: 404 }
      );
    }
  }

  const { data: roleRequest, error: roleRequestLookupError } = await supabaseAdmin
    .from("recruiter_role_requests")
    .select("id, recruiter_id, status, first_response_at")
    .eq("id", params.id)
    .maybeSingle();

  if (roleRequestLookupError || !roleRequest) {
    return NextResponse.json({ error: "Hiring request not found." }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const shouldStampResponse =
    !roleRequest.first_response_at && RESPONSE_STAMP_STATUSES.has(status);
  const recruiterStatus =
    status === "reviewing"
      ? "CONTACTED"
      : ["qualified", "awaiting_details", "candidate_shortlist_sent", "active"].includes(
          status
        )
      ? "ENGAGED"
      : null;

  const { data: updatedRequest, error: requestUpdateError } = await supabaseAdmin
    .from("recruiter_role_requests")
    .update({
      assigned_account_manager_id: assignedAccountManagerId,
      status,
      internal_note: internalNote,
      ...(shouldStampResponse
        ? {
            first_response_at: nowIso,
            last_outbound_at: nowIso,
          }
        : {}),
      updated_at: nowIso,
    })
    .eq("id", params.id)
    .select("*")
    .single();

  if (requestUpdateError || !updatedRequest) {
    return NextResponse.json(
      { error: "Failed to update hiring request." },
      { status: 500 }
    );
  }

  const { error: recruiterUpdateError } = await supabaseAdmin
    .from("recruiters")
    .update({
      do_not_contact: doNotContact,
      owner_account_manager_id: assignedAccountManagerId,
      ...(recruiterStatus ? { status: recruiterStatus } : {}),
      updated_at: nowIso,
    })
    .eq("id", roleRequest.recruiter_id);

  if (recruiterUpdateError) {
    return NextResponse.json(
      { error: "Failed to update recruiter settings." },
      { status: 500 }
    );
  }

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    action: "account.update",
    targetType: "recruiter_role_request",
    targetId: params.id,
    details: {
      recruiter_id: roleRequest.recruiter_id,
      status,
      assigned_account_manager_id: assignedAccountManagerId,
      do_not_contact: doNotContact,
    },
  }).catch(() => {});

  logRecruiterPartnerActivity({
    recruiterId: roleRequest.recruiter_id,
    roleRequestId: params.id,
    activityType: "admin_request_updated",
    source: "admin",
    createdBy: auth.user.id,
    details: {
      status,
      assigned_account_manager_id: assignedAccountManagerId,
      do_not_contact: doNotContact,
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, roleRequest: updatedRequest });
}
