import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";
import { calculateProfileCompletion } from "@/lib/portal/profile-completion";
import { RESUME_TEMPLATES } from "@/lib/resume-templates";
import { logActivity } from "@/lib/feedback-loop";

export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { data: jobSeeker, error } = await supabaseAdmin
    .from("job_seekers")
    .select("*")
    .eq("id", auth.user.id)
    .single();

  if (error || !jobSeeker) {
    return Response.json({ error: "Profile not found." }, { status: 404 });
  }

  const completion = calculateProfileCompletion(jobSeeker);

  return Response.json({ profile: jobSeeker, completion });
}

const ALLOWED_FIELDS = [
  // Personal info
  "full_name",
  "bio",
  "location",
  "phone",
  "linkedin_url",
  "portfolio_url",
  "address_line1",
  "address_city",
  "address_state",
  "address_zip",
  "address_country",
  // Work preferences
  "seniority",
  "work_type",
  "work_type_preferences",
  "employment_type_preferences",
  "salary_min",
  "salary_max",
  "target_titles",
  "skills",
  "work_history",
  "education",
  "years_experience",
  "preferred_industries",
  "preferred_company_sizes",
  "preferred_locations",
  "location_preferences",
  "open_to_relocation",
  // Work authorization
  "requires_visa_sponsorship",
  "authorized_to_work",
  "visa_status",
  "citizenship_status",
  "requires_h1b_transfer",
  "needs_employer_sponsorship",
  // Availability & logistics
  "start_date",
  "notice_period",
  "available_for_relocation",
  "available_for_travel",
  "willing_to_work_overtime",
  "willing_to_work_weekends",
  "preferred_shift",
  "minimum_salary",
  "open_to_contract",
  // EEO (optional)
  "eeo_gender",
  "eeo_race",
  "eeo_veteran_status",
  "eeo_disability_status",
  // Background & legal
  "felony_conviction",
  "non_compete_subject",
  "consent_background_check",
  "consent_drug_screening",
  // Resume
  "resume_text",
  "resume_url",
  "resume_template_id",
  "profile_photo_url",
  // Onboarding
  "onboarding_completed_at",
];

export async function PATCH(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  // Filter to only allowed fields
  const updates: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No valid fields to update." }, { status: 400 });
  }

  // Validate numeric fields
  if (updates.salary_min !== undefined && updates.salary_min !== null) {
    const val = Number(updates.salary_min);
    if (isNaN(val) || val < 0) {
      return Response.json({ error: "Invalid salary_min." }, { status: 400 });
    }
    updates.salary_min = val;
  }
  if (updates.salary_max !== undefined && updates.salary_max !== null) {
    const val = Number(updates.salary_max);
    if (isNaN(val) || val < 0) {
      return Response.json({ error: "Invalid salary_max." }, { status: 400 });
    }
    updates.salary_max = val;
  }
  if (updates.years_experience !== undefined && updates.years_experience !== null) {
    const val = Number(updates.years_experience);
    if (isNaN(val) || val < 0) {
      return Response.json({ error: "Invalid years_experience." }, { status: 400 });
    }
    updates.years_experience = val;
  }

  if (updates.resume_template_id !== undefined && updates.resume_template_id !== null) {
    const valid = new Set(RESUME_TEMPLATES.map((t) => t.id));
    const templateId = String(updates.resume_template_id);
    if (!valid.has(templateId as (typeof RESUME_TEMPLATES)[number]["id"])) {
      return Response.json({ error: "Invalid resume_template_id." }, { status: 400 });
    }
    updates.resume_template_id = templateId;
  }

  // Validate array fields
  const arrayFields = [
    "target_titles", "skills", "preferred_industries", "preferred_company_sizes",
    "preferred_locations", "work_history", "education", "work_type_preferences",
    "employment_type_preferences",
  ];
  for (const field of arrayFields) {
    if (field in updates && updates[field] !== null) {
      if (!Array.isArray(updates[field])) {
        return Response.json({ error: `${field} must be an array.` }, { status: 400 });
      }
    }
  }

  // Validate location_preferences structure
  if ("location_preferences" in updates && updates.location_preferences !== null) {
    if (!Array.isArray(updates.location_preferences)) {
      return Response.json({ error: "location_preferences must be an array." }, { status: 400 });
    }
    const validWorkTypes = ["remote", "hybrid", "onsite"];
    for (const entry of updates.location_preferences as unknown[]) {
      const pref = entry as Record<string, unknown>;
      if (!pref || typeof pref !== "object") {
        return Response.json({ error: "Each location_preferences entry must be an object." }, { status: 400 });
      }
      if (!validWorkTypes.includes(pref.work_type as string)) {
        return Response.json({ error: `Invalid work_type in location_preferences. Must be one of: ${validWorkTypes.join(", ")}` }, { status: 400 });
      }
      if (!Array.isArray(pref.locations)) {
        return Response.json({ error: "Each location_preferences entry must have a locations array." }, { status: 400 });
      }
    }
  }

  const { data, error } = await supabaseAdmin
    .from("job_seekers")
    .update(updates)
    .eq("id", auth.user.id)
    .select("*")
    .single();

  if (error) {
    return Response.json({ error: "Failed to update profile." }, { status: 500 });
  }

  // Log to activity feed (non-blocking)
  const updatedKeys = Object.keys(updates);
  logActivity(auth.user.id, {
    eventType: "profile_updated",
    title: "Profile updated",
    description: `Updated: ${updatedKeys.join(", ")}`,
    meta: { fields: updatedKeys },
  }).catch((err) => console.error("[portal:profile] activity log failed:", err));

  // Auto-trigger matching if matching-relevant fields were updated
  const MATCHING_FIELDS = [
    "skills", "target_titles", "salary_min", "salary_max", "work_type",
    "seniority", "location", "preferred_locations", "location_preferences",
    "open_to_relocation", "preferred_industries", "preferred_company_sizes",
    "years_experience", "work_type_preferences", "requires_visa_sponsorship",
  ];
  const hasMatchingFields = updatedKeys.some((k) => MATCHING_FIELDS.includes(k));
  if (hasMatchingFields) {
    triggerMatchingForSeeker(auth.user.id);
  }

  const completion = calculateProfileCompletion(data);

  if (typeof completion.percentage === "number") {
    const { error: completionError } = await supabaseAdmin
      .from("job_seekers")
      .update({ profile_completion: completion.percentage })
      .eq("id", auth.user.id);

    if (completionError) {
      console.error("[portal:profile] failed to update profile_completion:", completionError);
    }
  }

  return Response.json({ profile: data, completion });
}

function triggerMatchingForSeeker(seekerId: string) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.OPS_API_KEY) {
    headers["x-ops-key"] = process.env.OPS_API_KEY;
  }

  fetch(`${baseUrl}/api/match/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({ job_seeker_id: seekerId }),
  }).catch((err) => console.error("Auto-match trigger failed:", err));
}
