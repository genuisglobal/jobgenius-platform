import { requireAMAccessToSeeker } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

type PreferencesPayload = {
  // Basic preferences
  location?: string;
  seniority?: string;
  salary_min?: number;
  salary_max?: number;
  work_type?: string; // remote, hybrid, on-site
  target_titles?: string[];
  skills?: string[];

  // Enhanced preferences (from intelligent matching)
  preferred_industries?: string[];
  preferred_company_sizes?: string[]; // startup, mid-size, enterprise
  exclude_keywords?: string[];
  years_experience?: number;
  preferred_locations?: string[];
  open_to_relocation?: boolean;
  requires_visa_sponsorship?: boolean;
  match_threshold?: number;
};

const VALID_WORK_TYPES = ["remote", "hybrid", "on-site"];
const VALID_COMPANY_SIZES = ["startup", "mid-size", "enterprise"];
const VALID_INDUSTRIES = [
  "technology",
  "finance",
  "healthcare",
  "ecommerce",
  "education",
  "gaming",
  "media",
  "travel",
  "automotive",
  "manufacturing",
];

/**
 * GET /api/jobseekers/[id]/preferences
 *
 * Returns the job seeker's current matching preferences.
 */
export async function GET(
  request: Request,
  context: { params: { id: string } }
) {
  const jobSeekerId = context.params.id;
  if (!jobSeekerId) {
    return Response.json(
      { success: false, error: "Missing job seeker id." },
      { status: 400 }
    );
  }

  const access = await requireAMAccessToSeeker(request.headers, jobSeekerId);
  if (!access.ok) return access.response;

  const { data: seeker, error } = await supabaseServer
    .from("job_seekers")
    .select(`
      id,
      full_name,
      email,
      location,
      seniority,
      salary_min,
      salary_max,
      work_type,
      target_titles,
      skills,
      match_threshold,
      preferred_industries,
      preferred_company_sizes,
      exclude_keywords,
      years_experience,
      preferred_locations,
      open_to_relocation,
      requires_visa_sponsorship
    `)
    .eq("id", jobSeekerId)
    .single();

  if (error || !seeker) {
    return Response.json(
      { success: false, error: "Job seeker not found." },
      { status: 404 }
    );
  }

  return Response.json({
    success: true,
    preferences: {
      // Basic
      location: seeker.location,
      seniority: seeker.seniority,
      salary_min: seeker.salary_min,
      salary_max: seeker.salary_max,
      work_type: seeker.work_type,
      target_titles: seeker.target_titles ?? [],
      skills: seeker.skills ?? [],
      match_threshold: seeker.match_threshold ?? 60,

      // Enhanced
      preferred_industries: seeker.preferred_industries ?? [],
      preferred_company_sizes: seeker.preferred_company_sizes ?? [],
      exclude_keywords: seeker.exclude_keywords ?? [],
      years_experience: seeker.years_experience,
      preferred_locations: seeker.preferred_locations ?? [],
      open_to_relocation: seeker.open_to_relocation ?? false,
      requires_visa_sponsorship: seeker.requires_visa_sponsorship ?? false,
    },
    valid_options: {
      work_types: VALID_WORK_TYPES,
      company_sizes: VALID_COMPANY_SIZES,
      industries: VALID_INDUSTRIES,
    },
  });
}

/**
 * PATCH /api/jobseekers/[id]/preferences
 *
 * Updates the job seeker's matching preferences.
 * Only provided fields will be updated.
 */
export async function PATCH(
  request: Request,
  context: { params: { id: string } }
) {
  let payload: PreferencesPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const jobSeekerId = context.params.id;
  if (!jobSeekerId) {
    return Response.json(
      { success: false, error: "Missing job seeker id." },
      { status: 400 }
    );
  }

  // Validate payload
  const errors: string[] = [];

  if (payload.work_type && !VALID_WORK_TYPES.includes(payload.work_type)) {
    errors.push(`work_type must be one of: ${VALID_WORK_TYPES.join(", ")}`);
  }

  if (payload.preferred_company_sizes) {
    const invalidSizes = payload.preferred_company_sizes.filter(
      (s) => !VALID_COMPANY_SIZES.includes(s)
    );
    if (invalidSizes.length > 0) {
      errors.push(
        `Invalid company sizes: ${invalidSizes.join(", ")}. Valid options: ${VALID_COMPANY_SIZES.join(", ")}`
      );
    }
  }

  if (payload.preferred_industries) {
    const invalidIndustries = payload.preferred_industries.filter(
      (i) => !VALID_INDUSTRIES.includes(i)
    );
    if (invalidIndustries.length > 0) {
      errors.push(
        `Invalid industries: ${invalidIndustries.join(", ")}. Valid options: ${VALID_INDUSTRIES.join(", ")}`
      );
    }
  }

  if (
    payload.salary_min !== undefined &&
    (typeof payload.salary_min !== "number" || payload.salary_min < 0)
  ) {
    errors.push("salary_min must be a positive number");
  }

  if (
    payload.salary_max !== undefined &&
    (typeof payload.salary_max !== "number" || payload.salary_max < 0)
  ) {
    errors.push("salary_max must be a positive number");
  }

  if (
    payload.salary_min &&
    payload.salary_max &&
    payload.salary_min > payload.salary_max
  ) {
    errors.push("salary_min cannot be greater than salary_max");
  }

  if (
    payload.years_experience !== undefined &&
    payload.years_experience !== null &&
    (typeof payload.years_experience !== "number" || payload.years_experience < 0)
  ) {
    errors.push("years_experience must be a non-negative number");
  }

  if (
    payload.match_threshold !== undefined &&
    (typeof payload.match_threshold !== "number" ||
      payload.match_threshold < 0 ||
      payload.match_threshold > 100)
  ) {
    errors.push("match_threshold must be between 0 and 100");
  }

  if (errors.length > 0) {
    return Response.json(
      { success: false, errors },
      { status: 400 }
    );
  }

  // Auth check
  const access = await requireAMAccessToSeeker(request.headers, jobSeekerId);
  if (!access.ok) return access.response;

  // Build update object with only provided fields
  const updateData: Record<string, unknown> = {};

  if (payload.location !== undefined) updateData.location = payload.location;
  if (payload.seniority !== undefined) updateData.seniority = payload.seniority;
  if (payload.salary_min !== undefined) updateData.salary_min = payload.salary_min;
  if (payload.salary_max !== undefined) updateData.salary_max = payload.salary_max;
  if (payload.work_type !== undefined) updateData.work_type = payload.work_type;
  if (payload.target_titles !== undefined) updateData.target_titles = payload.target_titles;
  if (payload.skills !== undefined) updateData.skills = payload.skills;
  if (payload.match_threshold !== undefined) updateData.match_threshold = payload.match_threshold;
  if (payload.preferred_industries !== undefined)
    updateData.preferred_industries = payload.preferred_industries;
  if (payload.preferred_company_sizes !== undefined)
    updateData.preferred_company_sizes = payload.preferred_company_sizes;
  if (payload.exclude_keywords !== undefined)
    updateData.exclude_keywords = payload.exclude_keywords;
  if (payload.years_experience !== undefined)
    updateData.years_experience = payload.years_experience;
  if (payload.preferred_locations !== undefined)
    updateData.preferred_locations = payload.preferred_locations;
  if (payload.open_to_relocation !== undefined)
    updateData.open_to_relocation = payload.open_to_relocation;
  if (payload.requires_visa_sponsorship !== undefined)
    updateData.requires_visa_sponsorship = payload.requires_visa_sponsorship;

  if (Object.keys(updateData).length === 0) {
    return Response.json(
      { success: false, error: "No fields to update." },
      { status: 400 }
    );
  }

  const { error } = await supabaseServer
    .from("job_seekers")
    .update(updateData)
    .eq("id", jobSeekerId);

  if (error) {
    return Response.json(
      { success: false, error: "Failed to update preferences." },
      { status: 500 }
    );
  }

  return Response.json({
    success: true,
    updated_fields: Object.keys(updateData),
  });
}
