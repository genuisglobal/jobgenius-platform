import crypto from "crypto";
import { supabaseAdmin } from "@/lib/auth";
import {
  RECRUITER_RESPONSE_ACTIONS,
  RECRUITER_RESPONSE_ACTION_LABELS,
  type RecruiterResponseAction,
} from "@/lib/recruiter-partners";

type RecruiterMatchRow = {
  id: string;
  name: string | null;
  email: string | null;
  company: string | null;
  linkedin_url: string | null;
  owner_account_manager_id: string | null;
  do_not_contact: boolean | null;
  status: string;
  company_domain: string | null;
};

type RecruiterRoleRequestRow = {
  id: string;
  recruiter_id: string;
  role_title: string | null;
  job_url: string | null;
  location: string;
  status: string;
  company_name: string;
  client_company_name: string | null;
  details: string | null;
  hiring_urgency: string | null;
  submitted_by_email: string;
  assigned_account_manager_id: string | null;
  first_response_at: string | null;
  last_inbound_at: string | null;
  last_inbound_action_type: string | null;
  created_at: string;
  updated_at: string;
};

type ActionTokenRow = {
  id: string;
  recruiter_id: string;
  role_request_id: string;
  action_type: RecruiterResponseAction;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

function hashOpaqueToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function normalizeCompare(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function canonicalizeUrl(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    parsed.hash = "";
    return `${parsed.origin}${parsed.pathname}${parsed.search}`.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function isClosedStatus(status: string | null | undefined) {
  return status === "closed" || status === "rejected";
}

export async function logRecruiterPartnerActivity({
  recruiterId,
  roleRequestId,
  activityType,
  source,
  details,
  createdBy,
}: {
  recruiterId: string;
  roleRequestId?: string | null;
  activityType: string;
  source: "system" | "admin" | "recruiter" | "intake";
  details?: Record<string, unknown>;
  createdBy?: string | null;
}) {
  await supabaseAdmin.from("recruiter_partner_activity").insert({
    recruiter_id: recruiterId,
    role_request_id: roleRequestId ?? null,
    activity_type: activityType,
    source,
    details: details ?? {},
    created_by: createdBy ?? null,
  });
}

export async function findExistingRecruiterMatch({
  email,
  linkedinUrl,
  fullName,
  companyName,
}: {
  email: string;
  linkedinUrl: string | null;
  fullName: string | null;
  companyName: string;
}) {
  const normalizedEmail = normalizeCompare(email);
  const normalizedLinkedIn = normalizeCompare(linkedinUrl);
  const normalizedName = normalizeCompare(fullName);
  const normalizedCompany = normalizeCompare(companyName);

  const { data: byEmail } = await supabaseAdmin
    .from("recruiters")
    .select(
      "id, name, email, company, linkedin_url, owner_account_manager_id, do_not_contact, status, company_domain"
    )
    .ilike("email", normalizedEmail)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byEmail?.id) {
    return byEmail as RecruiterMatchRow;
  }

  if (normalizedLinkedIn) {
    const { data: byLinkedIn } = await supabaseAdmin
      .from("recruiters")
      .select(
        "id, name, email, company, linkedin_url, owner_account_manager_id, do_not_contact, status, company_domain"
      )
      .ilike("linkedin_url", normalizedLinkedIn)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byLinkedIn?.id) {
      return byLinkedIn as RecruiterMatchRow;
    }
  }

  if (normalizedName && normalizedCompany) {
    const { data: byNameAndCompany } = await supabaseAdmin
      .from("recruiters")
      .select(
        "id, name, email, company, linkedin_url, owner_account_manager_id, do_not_contact, status, company_domain"
      )
      .ilike("company", companyName)
      .order("updated_at", { ascending: false })
      .limit(10);

    const exact = ((byNameAndCompany ?? []) as RecruiterMatchRow[]).find(
      (row) =>
        normalizeCompare(row.name) === normalizedName &&
        normalizeCompare(row.company) === normalizedCompany
    );

    if (exact?.id) {
      return exact;
    }
  }

  return null;
}

export async function resolveRecruiterOwnerAccountManagerId({
  recruiterId,
  currentOwnerAccountManagerId,
  companyDomain,
}: {
  recruiterId?: string | null;
  currentOwnerAccountManagerId?: string | null;
  companyDomain?: string | null;
}) {
  if (currentOwnerAccountManagerId) {
    return currentOwnerAccountManagerId;
  }

  if (recruiterId) {
    const { data: latestOwnedRequest } = await supabaseAdmin
      .from("recruiter_role_requests")
      .select("assigned_account_manager_id")
      .eq("recruiter_id", recruiterId)
      .not("assigned_account_manager_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestOwnedRequest?.assigned_account_manager_id) {
      return latestOwnedRequest.assigned_account_manager_id as string;
    }
  }

  if (companyDomain) {
    const { data: recruiterWithOwner } = await supabaseAdmin
      .from("recruiters")
      .select("owner_account_manager_id")
      .eq("company_domain", companyDomain)
      .not("owner_account_manager_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recruiterWithOwner?.owner_account_manager_id) {
      return recruiterWithOwner.owner_account_manager_id as string;
    }
  }

  return null;
}

export async function findRecentDuplicateRoleRequest({
  recruiterId,
  roleTitle,
  jobUrl,
  location,
}: {
  recruiterId: string;
  roleTitle: string | null;
  jobUrl: string | null;
  location: string;
}) {
  const sinceIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const normalizedRole = normalizeCompare(roleTitle);
  const normalizedLocation = normalizeCompare(location);
  const normalizedJobUrl = canonicalizeUrl(jobUrl);

  const { data } = await supabaseAdmin
    .from("recruiter_role_requests")
    .select(
      "id, recruiter_id, role_title, job_url, location, status, company_name, client_company_name, details, hiring_urgency, submitted_by_email, assigned_account_manager_id, first_response_at, last_inbound_at, last_inbound_action_type, created_at, updated_at"
    )
    .eq("recruiter_id", recruiterId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(15);

  const duplicate = ((data ?? []) as RecruiterRoleRequestRow[]).find((row) => {
    if (isClosedStatus(row.status)) return false;

    if (normalizedJobUrl && canonicalizeUrl(row.job_url) === normalizedJobUrl) {
      return true;
    }

    return (
      normalizedRole &&
      normalizeCompare(row.role_title) === normalizedRole &&
      normalizeCompare(row.location) === normalizedLocation
    );
  });

  return duplicate ?? null;
}

export async function createRecruiterResponseLinks({
  recruiterId,
  roleRequestId,
  origin,
}: {
  recruiterId: string;
  roleRequestId: string;
  origin: string;
}) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await supabaseAdmin
    .from("recruiter_partner_action_tokens")
    .delete()
    .eq("role_request_id", roleRequestId)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString());

  const rawTokens = Object.fromEntries(
    RECRUITER_RESPONSE_ACTIONS.map((action) => [action, crypto.randomBytes(24).toString("hex")])
  ) as Record<RecruiterResponseAction, string>;

  const rows = RECRUITER_RESPONSE_ACTIONS.map((action) => ({
    recruiter_id: recruiterId,
    role_request_id: roleRequestId,
    action_type: action,
    token_hash: hashOpaqueToken(rawTokens[action]),
    expires_at: expiresAt,
    meta: {
      label: RECRUITER_RESPONSE_ACTION_LABELS[action],
    },
  }));

  const { error } = await supabaseAdmin
    .from("recruiter_partner_action_tokens")
    .insert(rows);

  if (error) {
    throw error;
  }

  return Object.fromEntries(
    RECRUITER_RESPONSE_ACTIONS.map((action) => [
      action,
      `${origin}/hire/respond/${rawTokens[action]}`,
    ])
  ) as Record<RecruiterResponseAction, string>;
}

export async function getRecruiterResponseTokenPreview(rawToken: string) {
  const tokenHash = hashOpaqueToken(rawToken);
  const { data: tokenRow } = await supabaseAdmin
    .from("recruiter_partner_action_tokens")
    .select("id, recruiter_id, role_request_id, action_type, expires_at, used_at, created_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!tokenRow) {
    return { state: "invalid" as const };
  }

  const { data: requestRow } = await supabaseAdmin
    .from("recruiter_role_requests")
    .select(
      "id, company_name, role_title, location, submitted_by_email, status, last_inbound_at, last_inbound_action_type"
    )
    .eq("id", tokenRow.role_request_id)
    .maybeSingle();

  const nowMs = Date.now();
  const expiresMs = new Date(tokenRow.expires_at).getTime();

  if (tokenRow.used_at) {
    return {
      state: "already_used" as const,
      token: tokenRow as ActionTokenRow,
      roleRequest: requestRow ?? null,
    };
  }

  if (Number.isFinite(expiresMs) && expiresMs <= nowMs) {
    return {
      state: "expired" as const,
      token: tokenRow as ActionTokenRow,
      roleRequest: requestRow ?? null,
    };
  }

  return {
    state: "ready" as const,
    token: tokenRow as ActionTokenRow,
    roleRequest: requestRow ?? null,
  };
}

export async function consumeRecruiterResponseToken(rawToken: string) {
  const preview = await getRecruiterResponseTokenPreview(rawToken);
  if (preview.state !== "ready") {
    return preview;
  }

  const nowIso = new Date().toISOString();
  const { token, roleRequest } = preview;

  const { data: markedUsed } = await supabaseAdmin
    .from("recruiter_partner_action_tokens")
    .update({ used_at: nowIso })
    .eq("id", token.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();

  if (!markedUsed?.id) {
    return getRecruiterResponseTokenPreview(rawToken);
  }

  const { data: fullRequest } = await supabaseAdmin
    .from("recruiter_role_requests")
    .select(
      "id, recruiter_id, status, first_response_at, company_name, role_title, location, submitted_by_email"
    )
    .eq("id", token.role_request_id)
    .maybeSingle();

  if (!fullRequest?.id) {
    return { state: "invalid" as const };
  }

  const requestUpdate: Record<string, unknown> = {
    last_inbound_at: nowIso,
    last_inbound_action_type: token.action_type,
    updated_at: nowIso,
  };
  const recruiterUpdate: Record<string, unknown> = {
    updated_at: nowIso,
  };
  let activityType: string = token.action_type;

  if (!fullRequest.first_response_at) {
    requestUpdate.first_response_at = nowIso;
  }

  switch (token.action_type) {
    case "send_profiles":
      requestUpdate.status = "qualified";
      recruiterUpdate.status = "ENGAGED";
      activityType = "requested_profiles";
      break;
    case "add_details":
      requestUpdate.status = "awaiting_details";
      recruiterUpdate.status = "ENGAGED";
      activityType = "requested_detail_followup";
      break;
    case "refer_teammate":
      requestUpdate.status = "awaiting_details";
      recruiterUpdate.status = "ENGAGED";
      activityType = "referred_teammate";
      break;
    case "not_hiring":
      requestUpdate.status = "closed";
      requestUpdate.closed_reason = "not_hiring_right_now";
      recruiterUpdate.status = "CONTACTED";
      activityType = "not_hiring_right_now";
      break;
    case "wrong_contact":
      requestUpdate.status = "closed";
      requestUpdate.closed_reason = "wrong_contact";
      recruiterUpdate.status = "CONTACTED";
      recruiterUpdate.do_not_contact = true;
      activityType = "wrong_contact";
      break;
  }

  await supabaseAdmin
    .from("recruiter_role_requests")
    .update(requestUpdate)
    .eq("id", fullRequest.id);

  await supabaseAdmin
    .from("recruiters")
    .update(recruiterUpdate)
    .eq("id", fullRequest.recruiter_id);

  await logRecruiterPartnerActivity({
    recruiterId: fullRequest.recruiter_id,
    roleRequestId: fullRequest.id,
    activityType,
    source: "recruiter",
    details: {
      action_type: token.action_type,
      company_name: fullRequest.company_name,
      role_title: fullRequest.role_title,
      submitted_by_email: fullRequest.submitted_by_email,
    },
  });

  return {
    state: "applied" as const,
    token,
    roleRequest: roleRequest ?? {
      company_name: fullRequest.company_name,
      role_title: fullRequest.role_title,
      location: fullRequest.location,
      submitted_by_email: fullRequest.submitted_by_email,
      status: requestUpdate.status as string,
      last_inbound_at: nowIso,
      last_inbound_action_type: token.action_type,
    },
  };
}
