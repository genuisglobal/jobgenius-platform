import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import {
  MAX_POLICY_RUN_FREQUENCY_HOURS,
  MIN_POLICY_RUN_FREQUENCY_HOURS,
  normalizePolicyLocation,
  normalizePolicyRunFrequency,
  normalizePolicyTitle,
  syncValidatedDiscoverySearches,
} from "@/lib/discovery/policies";

type CreatePolicyPayload = {
  source_name?: string;
  source_names?: string[];
  job_title?: string;
  location?: string;
  run_frequency_hours?: number;
  enabled?: boolean;
};

function normalizeSourceName(sourceName: string) {
  return sourceName.trim().toLowerCase();
}

function isMissingPoliciesTable(error: { code?: string } | null | undefined) {
  return error?.code === "42P01";
}

function missingPoliciesTableResponse() {
  return Response.json(
    {
      success: false,
      error:
        "Discovery policies table is missing. Run DB migration 050_superadmin_discovery_policies.sql and retry.",
    },
    { status: 500 }
  );
}

function collectSourceNames(payload: CreatePolicyPayload) {
  const fromArray = Array.isArray(payload.source_names)
    ? payload.source_names
        .map((value) => normalizeSourceName(String(value ?? "")))
        .filter(Boolean)
    : [];

  const fromSingle = payload.source_name
    ? [normalizeSourceName(payload.source_name)]
    : [];

  return Array.from(new Set([...fromArray, ...fromSingle]));
}

/**
 * GET /api/discovery/policies
 *
 * Admin/superadmin: list superadmin-validated discovery policies.
 */
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return Response.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const { data: policies, error: policiesError } = await supabaseAdmin
    .from("discovery_search_policies")
    .select(
      "id, source_name, job_title, location, run_frequency_hours, enabled, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  if (policiesError) {
    if (isMissingPoliciesTable(policiesError)) {
      return missingPoliciesTableResponse();
    }
    return Response.json(
      { success: false, error: "Failed to load discovery policies." },
      { status: 500 }
    );
  }

  const { data: searches } = await supabaseAdmin
    .from("job_discovery_searches")
    .select("policy_id, enabled")
    .not("policy_id", "is", null)
    .is("job_seeker_id", null);

  const searchCountMap = new Map<string, { total: number; active: number }>();
  for (const search of searches ?? []) {
    if (!search.policy_id) continue;
    const summary = searchCountMap.get(search.policy_id) ?? { total: 0, active: 0 };
    summary.total += 1;
    if (search.enabled) {
      summary.active += 1;
    }
    searchCountMap.set(search.policy_id, summary);
  }

  const { data: sources, error: sourcesError } = await supabaseAdmin
    .from("job_sources")
    .select("name, source_type, enabled")
    .order("name", { ascending: true });

  if (sourcesError) {
    return Response.json(
      { success: false, error: "Failed to load discovery sources." },
      { status: 500 }
    );
  }

  const policiesWithStats = (policies ?? []).map((policy) => ({
    ...policy,
    generated_searches: searchCountMap.get(policy.id)?.total ?? 0,
    active_generated_searches: searchCountMap.get(policy.id)?.active ?? 0,
  }));

  return Response.json({
    success: true,
    policies: policiesWithStats,
    sources: sources ?? [],
    limits: {
      run_frequency_hours: {
        min: MIN_POLICY_RUN_FREQUENCY_HOURS,
        max: MAX_POLICY_RUN_FREQUENCY_HOURS,
      },
    },
  });
}

/**
 * POST /api/discovery/policies
 *
 * Superadmin only: create validated discovery policies.
 * Supports one or many sources in a single request.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return Response.json({ success: false, error: auth.error }, { status: auth.status });
  }

  if (auth.user.role !== "superadmin") {
    return Response.json(
      { success: false, error: "Only super admins can create discovery policies." },
      { status: 403 }
    );
  }

  let payload: CreatePolicyPayload;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const sourceNames = collectSourceNames(payload);
  const jobTitle = normalizePolicyTitle(payload.job_title ?? "");
  const location = normalizePolicyLocation(payload.location ?? "");

  if (sourceNames.length === 0 || !jobTitle || !location) {
    return Response.json(
      {
        success: false,
        error: "source_name/source_names, job_title, and location are required.",
      },
      { status: 400 }
    );
  }

  const runFrequencyHours = normalizePolicyRunFrequency(payload.run_frequency_hours);

  const { data: sourceRows, error: sourceError } = await supabaseAdmin
    .from("job_sources")
    .select("name, source_type")
    .in("name", sourceNames);

  if (sourceError) {
    return Response.json(
      { success: false, error: "Failed to validate discovery sources." },
      { status: 500 }
    );
  }

  const existingSources = new Set((sourceRows ?? []).map((row) => row.name));
  const unknownSources = sourceNames.filter((name) => !existingSources.has(name));
  const unsupportedSources = (sourceRows ?? [])
    .filter((row) => row.source_type === "feed")
    .map((row) => row.name);

  if (unknownSources.length > 0) {
    return Response.json(
      {
        success: false,
        error: `Unknown source(s): ${unknownSources.join(", ")}`,
      },
      { status: 400 }
    );
  }

  if (unsupportedSources.length > 0) {
    return Response.json(
      {
        success: false,
        error: `Policy generation does not support company-specific ATS feed source(s): ${unsupportedSources.join(", ")}.`,
      },
      { status: 400 }
    );
  }

  const { data: existingPolicies, error: existingError } = await supabaseAdmin
    .from("discovery_search_policies")
    .select(
      "id, source_name, job_title, location, run_frequency_hours, enabled, created_at, updated_at"
    )
    .in("source_name", sourceNames);

  if (existingError) {
    if (isMissingPoliciesTable(existingError)) {
      return missingPoliciesTableResponse();
    }
    return Response.json(
      { success: false, error: "Failed to validate existing discovery policies." },
      { status: 500 }
    );
  }

  const targetKey = `${jobTitle.toLowerCase()}|${location.toLowerCase()}`;
  const existingBySource = new Set(
    (existingPolicies ?? [])
      .filter((policy) => `${policy.job_title.toLowerCase()}|${policy.location.toLowerCase()}` === targetKey)
      .map((policy) => policy.source_name)
  );

  const nowIso = new Date().toISOString();
  const createdPolicies: Array<{
    id: string;
    source_name: string;
    job_title: string;
    location: string;
    run_frequency_hours: number;
    enabled: boolean;
    created_at: string;
    updated_at: string;
  }> = [];
  const skippedSources: string[] = [];

  for (const sourceName of sourceNames) {
    if (existingBySource.has(sourceName)) {
      skippedSources.push(sourceName);
      continue;
    }

    const { data: insertedPolicy, error: insertError } = await supabaseAdmin
      .from("discovery_search_policies")
      .insert({
        source_name: sourceName,
        job_title: jobTitle,
        location,
        run_frequency_hours: runFrequencyHours,
        enabled: payload.enabled ?? true,
        created_by_am_id: auth.user.id,
        updated_by_am_id: auth.user.id,
        updated_at: nowIso,
      })
      .select(
        "id, source_name, job_title, location, run_frequency_hours, enabled, created_at, updated_at"
      )
      .single();

    if (insertError) {
      if (isMissingPoliciesTable(insertError)) {
        return missingPoliciesTableResponse();
      }
      if (insertError.code === "23505") {
        skippedSources.push(sourceName);
        continue;
      }
      return Response.json(
        {
          success: false,
          error: "Failed to create discovery policies.",
        },
        { status: 500 }
      );
    }

    createdPolicies.push(insertedPolicy);
  }

  if (createdPolicies.length === 0) {
    return Response.json(
      {
        success: true,
        policies: [],
        created_count: 0,
        skipped_sources: skippedSources,
        warning: "No new policies created. Matching policies already exist for selected source(s).",
      },
      { status: 200 }
    );
  }

  try {
    const sync = await syncValidatedDiscoverySearches();
    return Response.json({
      success: true,
      policies: createdPolicies,
      created_count: createdPolicies.length,
      skipped_sources: skippedSources,
      sync,
    });
  } catch (syncError) {
    console.error("Discovery policy sync failed after create:", syncError);
    return Response.json({
      success: true,
      policies: createdPolicies,
      created_count: createdPolicies.length,
      skipped_sources: skippedSources,
      sync: null,
      warning: "Policies created, but search sync failed. Runner will retry sync.",
    });
  }
}
