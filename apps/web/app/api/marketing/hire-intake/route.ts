import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { sendAndLogEmail } from "@/lib/messaging/send-and-log";
import { createLogger } from "@/lib/logger";
import { recruiterIntakeConfirmationEmail } from "@/lib/email-templates/recruiter-intake-confirmation";
import {
  deriveCompanyDomainFromEmail,
  inferPartnerTypeFromPersona,
  isHiringPersona,
  isHiringUrgency,
  normalizeOptionalUrl,
  toNullableTrimmedText,
} from "@/lib/recruiter-partners";
import {
  createRecruiterResponseLinks,
  findExistingRecruiterMatch,
  findRecentDuplicateRoleRequest,
  logRecruiterPartnerActivity,
  resolveRecruiterOwnerAccountManagerId,
} from "@/lib/recruiter-partner-server";

type HireIntakePayload = {
  fullName?: string;
  workEmail?: string;
  companyName?: string;
  personaType?: string;
  roleTitle?: string;
  jobUrl?: string;
  location?: string;
  linkedinUrl?: string;
  clientCompanyName?: string;
  hiringUrgency?: string;
  details?: string;
};

const log = createLogger("marketing-hire-intake");

function isValidEmail(value: string | null): value is string {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

export async function POST(request: Request) {
  let payload: HireIntakePayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const fullName = toNullableTrimmedText(payload.fullName);
  const workEmail = toNullableTrimmedText(payload.workEmail)?.toLowerCase() ?? null;
  const companyName = toNullableTrimmedText(payload.companyName);
  const personaType = toNullableTrimmedText(payload.personaType);
  const roleTitle = toNullableTrimmedText(payload.roleTitle);
  const jobUrl = normalizeOptionalUrl(payload.jobUrl);
  const location = toNullableTrimmedText(payload.location);
  const linkedinUrl = normalizeOptionalUrl(payload.linkedinUrl);
  const clientCompanyName = toNullableTrimmedText(payload.clientCompanyName);
  const hiringUrgency = toNullableTrimmedText(payload.hiringUrgency);
  const details = toNullableTrimmedText(payload.details);

  if (!isHiringPersona(personaType)) {
    return NextResponse.json({ error: "Select who you are hiring for." }, { status: 400 });
  }

  if (!isValidEmail(workEmail)) {
    return NextResponse.json({ error: "A valid work email is required." }, { status: 400 });
  }

  if (!companyName) {
    return NextResponse.json({ error: "Company or agency name is required." }, { status: 400 });
  }

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

  const nowIso = new Date().toISOString();
  const companyDomain = deriveCompanyDomainFromEmail(workEmail);
  const partnerType = inferPartnerTypeFromPersona(personaType);
  const existingRecruiter = await findExistingRecruiterMatch({
    email: workEmail,
    linkedinUrl,
    fullName,
    companyName,
  });

  let recruiterId = existingRecruiter?.id ?? null;
  let ownerAccountManagerId = await resolveRecruiterOwnerAccountManagerId({
    recruiterId,
    currentOwnerAccountManagerId: existingRecruiter?.owner_account_manager_id ?? null,
    companyDomain,
  });

  if (existingRecruiter?.id) {
    recruiterId = existingRecruiter.id;
    const { error: updateRecruiterError } = await supabaseAdmin
      .from("recruiters")
      .update({
        name: existingRecruiter.name ?? fullName,
        company: companyName,
        email: workEmail,
        linkedin_url: linkedinUrl ?? existingRecruiter.linkedin_url,
        source: "public_form",
        company_domain: companyDomain,
        partner_type: partnerType,
        intake_source: "public_form",
        preferred_contact_method: "email",
        owner_account_manager_id: ownerAccountManagerId,
        do_not_contact: false,
        updated_at: nowIso,
      })
      .eq("id", recruiterId);

    if (updateRecruiterError) {
      log.error("Recruiter update failed", updateRecruiterError, {
        recruiterId,
        email: workEmail,
      });
      return NextResponse.json({ error: "Could not submit request." }, { status: 500 });
    }
  } else {
    const { data: createdRecruiter, error: createRecruiterError } = await supabaseAdmin
      .from("recruiters")
      .insert({
        name: fullName,
        company: companyName,
        email: workEmail,
        linkedin_url: linkedinUrl,
        source: "public_form",
        status: "NEW",
        company_domain: companyDomain,
        partner_type: partnerType,
        intake_source: "public_form",
        preferred_contact_method: "email",
        do_not_contact: false,
        owner_account_manager_id: ownerAccountManagerId,
        notes: null,
      })
      .select("id, owner_account_manager_id")
      .single();

    if (createRecruiterError || !createdRecruiter?.id) {
      log.error("Recruiter insert failed", createRecruiterError, {
        email: workEmail,
      });
      return NextResponse.json({ error: "Could not submit request." }, { status: 500 });
    }

    recruiterId = createdRecruiter.id as string;
    ownerAccountManagerId =
      (createdRecruiter.owner_account_manager_id as string | null | undefined) ?? null;
  }

  if (!recruiterId) {
    return NextResponse.json({ error: "Could not submit request." }, { status: 500 });
  }

  const duplicateRoleRequest = await findRecentDuplicateRoleRequest({
    recruiterId,
    roleTitle,
    jobUrl,
    location,
  });

  let roleRequestId: string | null = null;
  let isDuplicate = false;

  if (duplicateRoleRequest?.id) {
    isDuplicate = true;
    roleRequestId = duplicateRoleRequest.id;

    const { error: duplicateUpdateError } = await supabaseAdmin
      .from("recruiter_role_requests")
      .update({
        role_title: duplicateRoleRequest.role_title ?? roleTitle,
        job_url: duplicateRoleRequest.job_url ?? jobUrl,
        client_company_name:
          duplicateRoleRequest.client_company_name ??
          (personaType === "agency" ? clientCompanyName : null),
        hiring_urgency: duplicateRoleRequest.hiring_urgency ?? hiringUrgency,
        details: duplicateRoleRequest.details ?? details,
        assigned_account_manager_id:
          duplicateRoleRequest.assigned_account_manager_id ?? ownerAccountManagerId,
        updated_at: nowIso,
      })
      .eq("id", duplicateRoleRequest.id);

    if (duplicateUpdateError) {
      log.error("Duplicate request update failed", duplicateUpdateError, {
        recruiterId,
        duplicateRoleRequestId: duplicateRoleRequest.id,
      });
      return NextResponse.json({ error: "Could not submit request." }, { status: 500 });
    }

    await logRecruiterPartnerActivity({
      recruiterId,
      roleRequestId: duplicateRoleRequest.id,
      activityType: "duplicate_submission_detected",
      source: "intake",
      details: {
        submitted_by_email: workEmail,
        persona_type: personaType,
        role_title: roleTitle,
        location,
        job_url: jobUrl,
      },
    }).catch((error) =>
      log.warn("Duplicate activity log failed", error instanceof Error ? error : undefined, {
        recruiterId,
        duplicateRoleRequestId: duplicateRoleRequest.id,
      })
    );
  } else {
    const { data: roleRequest, error: roleRequestError } = await supabaseAdmin
      .from("recruiter_role_requests")
      .insert({
        recruiter_id: recruiterId,
        submitted_by_name: fullName,
        submitted_by_email: workEmail,
        persona_type: personaType,
        company_name: companyName,
        client_company_name: personaType === "agency" ? clientCompanyName : null,
        role_title: roleTitle,
        job_url: jobUrl,
        location,
        hiring_urgency: hiringUrgency,
        details,
        status: "new",
        assigned_account_manager_id: ownerAccountManagerId,
        updated_at: nowIso,
      })
      .select("id")
      .single();

    if (roleRequestError || !roleRequest?.id) {
      log.error("Role request insert failed", roleRequestError, {
        recruiterId,
        email: workEmail,
      });
      return NextResponse.json({ error: "Could not submit request." }, { status: 500 });
    }

    roleRequestId = roleRequest.id as string;

    await logRecruiterPartnerActivity({
      recruiterId,
      roleRequestId,
      activityType: "request_submitted",
      source: "intake",
      details: {
        submitted_by_email: workEmail,
        persona_type: personaType,
        role_title: roleTitle,
        location,
        job_url: jobUrl,
        hiring_urgency: hiringUrgency,
      },
    }).catch((error) =>
      log.warn("Submission activity log failed", error instanceof Error ? error : undefined, {
        recruiterId,
        roleRequestId,
      })
    );
  }

  if (!roleRequestId) {
    return NextResponse.json({ error: "Could not submit request." }, { status: 500 });
  }

  const origin = new URL(request.url).origin;
  const actionUrls = await createRecruiterResponseLinks({
    recruiterId,
    roleRequestId,
    origin,
  });
  const emailTemplate = recruiterIntakeConfirmationEmail({
    contactName: fullName,
    companyName,
    roleTitle,
    jobUrl,
    location,
    personaType,
    hireUrl: `${origin}/hire`,
    actionUrls,
  });

  try {
    await sendAndLogEmail({
      to: workEmail,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
      text: emailTemplate.text,
      template_key: "recruiter_intake_confirmation",
      meta: {
        recruiter_id: recruiterId,
        recruiter_role_request_id: roleRequestId,
        persona_type: personaType,
        duplicate_submission: isDuplicate,
      },
    });
  } catch (error) {
    log.warn("Confirmation email failed", error instanceof Error ? error : undefined, {
      recruiterId,
      recruiterRoleRequestId: roleRequestId,
      email: workEmail,
    });
  }

  return NextResponse.json({
    ok: true,
    recruiter_id: recruiterId,
    role_request_id: roleRequestId,
    duplicate: isDuplicate,
  });
}
