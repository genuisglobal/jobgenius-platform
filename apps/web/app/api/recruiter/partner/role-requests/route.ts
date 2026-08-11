import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { requireRecruiterPartnerSession } from "@/lib/recruiter-partner-auth";
import {
  findRecentDuplicateRoleRequest,
  logRecruiterPartnerActivity,
} from "@/lib/recruiter-partner-server";
import {
  isHiringUrgency,
  normalizeOptionalUrl,
  toNullableTrimmedText,
} from "@/lib/recruiter-partners";

type WorkspaceRoleRequestPayload = {
  roleTitle?: string;
  jobUrl?: string;
  location?: string;
  clientCompanyName?: string;
  hiringUrgency?: string;
  details?: string;
};

export async function POST(request: Request) {
  const auth = await requireRecruiterPartnerSession();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let payload: WorkspaceRoleRequestPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const roleTitle = toNullableTrimmedText(payload.roleTitle);
  const jobUrl = normalizeOptionalUrl(payload.jobUrl);
  const location = toNullableTrimmedText(payload.location);
  const clientCompanyName = toNullableTrimmedText(payload.clientCompanyName);
  const hiringUrgency = toNullableTrimmedText(payload.hiringUrgency);
  const details = toNullableTrimmedText(payload.details);

  if (!location) {
    return NextResponse.json({ error: "Location is required." }, { status: 400 });
  }

  if (!roleTitle && !jobUrl) {
    return NextResponse.json(
      { error: "Add a role title or paste a job link." },
      { status: 400 }
    );
  }

  if (hiringUrgency && !isHiringUrgency(hiringUrgency)) {
    return NextResponse.json({ error: "Invalid urgency selection." }, { status: 400 });
  }

  const { data: recruiter } = await supabaseAdmin
    .from("recruiters")
    .select("id, name, company, partner_type, owner_account_manager_id, email")
    .eq("id", auth.recruiterId)
    .maybeSingle();

  if (!recruiter?.id) {
    return NextResponse.json({ error: "Recruiter not found." }, { status: 404 });
  }

  if (!recruiter.email) {
    return NextResponse.json(
      { error: "Workspace contact email is missing for this recruiter." },
      { status: 400 }
    );
  }

  const duplicate = await findRecentDuplicateRoleRequest({
    recruiterId: auth.recruiterId,
    roleTitle,
    jobUrl,
    location,
  });

  const nowIso = new Date().toISOString();

  if (duplicate?.id) {
    const { data: updatedDuplicate } = await supabaseAdmin
      .from("recruiter_role_requests")
      .update({
        role_title: duplicate.role_title ?? roleTitle,
        job_url: duplicate.job_url ?? jobUrl,
        client_company_name: duplicate.client_company_name ?? clientCompanyName,
        hiring_urgency: duplicate.hiring_urgency ?? hiringUrgency,
        details: duplicate.details ?? details,
        updated_at: nowIso,
      })
      .eq("id", duplicate.id)
      .select(
        "id, role_title, job_url, location, client_company_name, hiring_urgency, details, status, created_at, updated_at"
      )
      .single();

    await logRecruiterPartnerActivity({
      recruiterId: auth.recruiterId,
      roleRequestId: duplicate.id,
      activityType: "workspace_duplicate_submission",
      source: "recruiter",
      details: {
        role_title: roleTitle,
        location,
        job_url: jobUrl,
      },
    });

    return NextResponse.json({
      ok: true,
      duplicate: true,
      role_request_id: duplicate.id,
      roleRequest:
        updatedDuplicate ?? {
          id: duplicate.id,
          role_title: duplicate.role_title ?? roleTitle,
          job_url: duplicate.job_url ?? jobUrl,
          location: duplicate.location,
          client_company_name: duplicate.client_company_name ?? clientCompanyName,
          hiring_urgency: duplicate.hiring_urgency ?? hiringUrgency,
          details: duplicate.details ?? details,
          status: duplicate.status,
          created_at: duplicate.created_at,
          updated_at: nowIso,
        },
    });
  }

  const { data: roleRequest, error } = await supabaseAdmin
    .from("recruiter_role_requests")
    .insert({
      recruiter_id: auth.recruiterId,
      submitted_by_name: recruiter.name ?? null,
      submitted_by_email: recruiter.email,
      persona_type: recruiter.partner_type === "agency" ? "agency" : "in_house",
      company_name: recruiter.company ?? "Unknown company",
      client_company_name: recruiter.partner_type === "agency" ? clientCompanyName : null,
      role_title: roleTitle,
      job_url: jobUrl,
      location,
      hiring_urgency: hiringUrgency,
      details,
      status: "new",
      assigned_account_manager_id: recruiter.owner_account_manager_id,
      updated_at: nowIso,
    })
    .select(
      "id, role_title, job_url, location, client_company_name, hiring_urgency, details, status, created_at, updated_at"
    )
    .single();

  if (error || !roleRequest?.id) {
    return NextResponse.json(
      { error: "Failed to create role request." },
      { status: 500 }
    );
  }

  await logRecruiterPartnerActivity({
    recruiterId: auth.recruiterId,
    roleRequestId: roleRequest.id,
    activityType: "workspace_request_submitted",
    source: "recruiter",
    details: {
      role_title: roleTitle,
      location,
      job_url: jobUrl,
      hiring_urgency: hiringUrgency,
    },
  });

  return NextResponse.json({
    ok: true,
    duplicate: false,
    role_request_id: roleRequest.id,
    roleRequest: roleRequest,
  });
}
