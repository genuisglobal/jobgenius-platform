import { NextResponse } from "next/server";
import { logAdminAction } from "@/lib/audit";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { recruiterPartnerWorkspaceAccessEmail } from "@/lib/email-templates/recruiter-partner-workspace-access";
import { sendAndLogEmail } from "@/lib/messaging/send-and-log";
import {
  createRecruiterWorkspaceMagicLink,
} from "@/lib/recruiter-partner-auth";
import { logRecruiterPartnerActivity } from "@/lib/recruiter-partner-server";

type RouteContext = {
  params: { id: string };
};

function formatExpiry(expiresAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(expiresAt));
}

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data: roleRequest } = await supabaseAdmin
    .from("recruiter_role_requests")
    .select(
      "id, recruiter_id, submitted_by_name, submitted_by_email, company_name, first_response_at"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!roleRequest?.id) {
    return NextResponse.json({ error: "Hiring request not found." }, { status: 404 });
  }

  const { data: recruiter } = await supabaseAdmin
    .from("recruiters")
    .select("id, name, email, company, status")
    .eq("id", roleRequest.recruiter_id)
    .maybeSingle();

  if (!recruiter?.id) {
    return NextResponse.json({ error: "Recruiter not found." }, { status: 404 });
  }

  const recipientEmail = roleRequest.submitted_by_email || recruiter.email;
  if (!recipientEmail) {
    return NextResponse.json(
      { error: "No recruiter contact email is available for this request." },
      { status: 400 }
    );
  }

  const origin = new URL(request.url).origin;
  const { magicLinkId, url, expiresAt } = await createRecruiterWorkspaceMagicLink({
    recruiterId: recruiter.id as string,
    roleRequestId: roleRequest.id as string,
    sentToEmail: recipientEmail,
    createdBy: auth.user.id,
    origin,
  });

  const emailTemplate = recruiterPartnerWorkspaceAccessEmail({
    contactName:
      (roleRequest.submitted_by_name as string | null) ??
      (recruiter.name as string | null) ??
      null,
    companyName:
      (roleRequest.company_name as string | null) ??
      (recruiter.company as string | null) ??
      "your team",
    workspaceUrl: url,
    expiresLabel: formatExpiry(expiresAt),
  });

  const emailResult = await sendAndLogEmail({
    to: recipientEmail,
    subject: emailTemplate.subject,
    html: emailTemplate.html,
    text: emailTemplate.text,
    template_key: "recruiter_partner_workspace_access",
    meta: {
      recruiter_id: recruiter.id,
      recruiter_role_request_id: roleRequest.id,
      recruiter_magic_link_id: magicLinkId,
    },
  });

  if (!emailResult.ok) {
    return NextResponse.json(
      {
        error: "Partner link was created but the email could not be delivered.",
        workspace_url: url,
      },
      { status: 502 }
    );
  }

  const nowIso = new Date().toISOString();

  await supabaseAdmin
    .from("recruiter_role_requests")
    .update({
      last_outbound_at: nowIso,
      ...(roleRequest.first_response_at ? {} : { first_response_at: nowIso }),
      updated_at: nowIso,
    })
    .eq("id", roleRequest.id);

  const recruiterStatus =
    recruiter.status === "NEW" || !recruiter.status ? "CONTACTED" : recruiter.status;

  await supabaseAdmin
    .from("recruiters")
    .update({
      status: recruiterStatus,
      updated_at: nowIso,
    })
    .eq("id", recruiter.id);

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    action: "recruiter_partner.send_workspace_link",
    targetType: "recruiter_role_request",
    targetId: roleRequest.id as string,
    details: {
      recruiter_id: recruiter.id,
      recipient_email: recipientEmail,
      recruiter_magic_link_id: magicLinkId,
    },
  }).catch(() => {});

  logRecruiterPartnerActivity({
    recruiterId: recruiter.id as string,
    roleRequestId: roleRequest.id as string,
    activityType: "workspace_link_sent",
    source: "admin",
    createdBy: auth.user.id,
    details: {
      recipient_email: recipientEmail,
      recruiter_magic_link_id: magicLinkId,
      expires_at: expiresAt,
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    sent_to_email: recipientEmail,
    expires_at: expiresAt,
    workspace_url: url,
  });
}
