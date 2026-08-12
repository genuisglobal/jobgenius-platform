import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";

interface RouteParams {
  params: { id: string };
}

type AuditFieldChange = {
  field: string;
  from: unknown;
  to: unknown;
};

function normalizeForCompare(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForCompare);
  }
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = normalizeForCompare(
          (value as Record<string, unknown>)[key]
        );
        return acc;
      }, {});
  }
  return value ?? null;
}

function isSameValue(a: unknown, b: unknown) {
  return JSON.stringify(normalizeForCompare(a)) === JSON.stringify(normalizeForCompare(b));
}

function getRequestIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }
  return request.headers.get("x-real-ip");
}

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = params;

  if (!(await hasJobSeekerAccess(auth.user.id, id))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const { data: seeker, error } = await supabaseAdmin
    .from("job_seekers")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !seeker) {
    return NextResponse.json({ error: "Job seeker not found." }, { status: 404 });
  }

  return NextResponse.json({ seeker });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = params;

  if (!(await hasJobSeekerAccess(auth.user.id, id))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Allow updating these fields
  const allowed = [
    "full_name", "phone", "location", "linkedin_url", "portfolio_url",
    "address_line1", "address_city", "address_state", "address_zip", "address_country",
    "seniority", "work_type", "salary_min", "salary_max",
    "target_titles", "skills", "education", "work_history", "match_threshold",
    "match_weights",
    "preferred_industries", "preferred_company_sizes", "exclude_keywords",
    "years_experience", "preferred_locations", "open_to_relocation",
    "requires_visa_sponsorship",
    "bio", "work_type_preferences", "employment_type_preferences", "location_preferences",
    "authorized_to_work", "visa_status", "citizenship_status", "requires_h1b_transfer",
    "needs_employer_sponsorship", "start_date", "notice_period", "available_for_relocation",
    "available_for_travel", "willing_to_work_overtime", "willing_to_work_weekends",
    "preferred_shift", "open_to_contract",
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { data: existingSeeker, error: existingError } = await supabaseAdmin
    .from("job_seekers")
    .select("*")
    .eq("id", id)
    .single();

  if (existingError || !existingSeeker) {
    return NextResponse.json({ error: "Job seeker not found." }, { status: 404 });
  }

  const changedFields: AuditFieldChange[] = Object.entries(updates)
    .filter(([key, value]) => !isSameValue(existingSeeker[key], value))
    .map(([key, value]) => ({
      field: key,
      from: existingSeeker[key] ?? null,
      to: value ?? null,
    }));

  if (changedFields.length === 0) {
    return NextResponse.json({ seeker: existingSeeker, message: "No changes detected." });
  }

  const { data: seeker, error } = await supabaseAdmin
    .from("job_seekers")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update job seeker." }, { status: 500 });
  }

  const { error: auditError } = await supabaseAdmin
    .from("job_seeker_profile_audit_logs")
    .insert({
      job_seeker_id: id,
      actor_account_manager_id: auth.user.id,
      actor_email: auth.user.email,
      actor_role: auth.user.role ?? "am",
      action: "profile_update",
      changed_fields: changedFields,
      request_ip: getRequestIp(request),
      request_user_agent: request.headers.get("user-agent"),
    });

  if (auditError) {
    console.error("Failed to write profile audit log", {
      jobSeekerId: id,
      actorAccountManagerId: auth.user.id,
      auditError: auditError.message,
    });
  }

  return NextResponse.json({ seeker });
}
