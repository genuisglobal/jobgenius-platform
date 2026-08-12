import { supabaseServer } from "@/lib/supabase/server";

export const DEFAULT_POLICY_RUN_FREQUENCY_HOURS = 24;
export const MIN_POLICY_RUN_FREQUENCY_HOURS = 1;
export const MAX_POLICY_RUN_FREQUENCY_HOURS = 168;

type DiscoveryPolicyRow = {
  id: string;
  source_name: string;
  job_title: string;
  location: string;
  run_frequency_hours: number | null;
  enabled: boolean | null;
};

type JobSourceRow = {
  id: string;
  name: string;
  base_url: string;
  enabled: boolean | null;
};

type PolicySearchRow = {
  id: string;
  policy_id: string | null;
  job_seeker_id: string | null;
  source_id: string;
  search_name: string;
  search_url: string;
  keywords: string[] | null;
  location: string | null;
  filters: Record<string, unknown> | null;
  run_frequency_hours: number | null;
  enabled: boolean;
};

type PolicySearchVariant = {
  key: string;
  label: string;
  queryStrategy:
    | "exact"
    | "title_core"
    | "title_alias"
    | "location_fallback"
    | "skill_keyword"
    | "combined";
  title: string;
  location: string;
  searchName: string;
  keywords: string[];
  filters: Record<string, unknown>;
};

export type DiscoveryPolicySyncSummary = {
  created: number;
  updated: number;
  disabled: number;
  total_policies: number;
  active_searches: number;
};

const TITLE_SENIORITY_PREFIXES = [
  "senior",
  "sr",
  "sr.",
  "junior",
  "jr",
  "jr.",
  "lead",
  "principal",
  "staff",
  "mid-level",
  "mid level",
  "midlevel",
];

const TITLE_ALIAS_RULES: Array<{ match: RegExp; aliases: string[] }> = [
  {
    match: /\bsoftware (engineer|developer)\b/i,
    aliases: ["Software Developer", "Application Developer"],
  },
  {
    match: /\b(back[\s-]?end|backend|api) (engineer|developer)\b/i,
    aliases: ["Backend Developer", "API Engineer", "Back-End Engineer"],
  },
  {
    match: /\b(front[\s-]?end|frontend) (engineer|developer)\b/i,
    aliases: ["Frontend Developer", "Front-End Engineer"],
  },
  {
    match: /\bfull[\s-]?stack (engineer|developer)\b/i,
    aliases: ["Full-Stack Developer", "Full Stack Engineer"],
  },
  {
    match: /\bdevops engineer\b/i,
    aliases: ["Site Reliability Engineer", "Platform Engineer", "Cloud Engineer"],
  },
  {
    match: /\bsite reliability engineer\b/i,
    aliases: ["DevOps Engineer", "Platform Engineer"],
  },
  {
    match: /\bdata engineer\b/i,
    aliases: ["Analytics Engineer", "ETL Developer"],
  },
  {
    match: /\bdata analyst\b/i,
    aliases: ["Business Intelligence Analyst", "Reporting Analyst"],
  },
  {
    match: /\bproduct manager\b/i,
    aliases: ["Product Owner"],
  },
  {
    match: /\bproject manager\b/i,
    aliases: ["Program Manager"],
  },
];

const MAX_POLICY_TITLE_VARIANTS = 4;
const MAX_POLICY_LOCATION_VARIANTS = 3;
const MAX_POLICY_SKILL_VARIANTS = 2;

const TITLE_SKILL_RULES: Array<{
  match: RegExp;
  label: string;
  keywords: string[];
}> = [
  {
    match: /\b(back[\s-]?end|backend|api) (engineer|developer)\b/i,
    label: "Stack-led backend query",
    keywords: ["Node.js", "API", "Microservices"],
  },
  {
    match: /\b(front[\s-]?end|frontend) (engineer|developer)\b/i,
    label: "Stack-led frontend query",
    keywords: ["React", "TypeScript", "JavaScript"],
  },
  {
    match: /\bfull[\s-]?stack (engineer|developer)\b/i,
    label: "Stack-led full-stack query",
    keywords: ["React", "Node.js", "TypeScript"],
  },
  {
    match: /\bdata engineer\b/i,
    label: "Stack-led data-engineering query",
    keywords: ["SQL", "ETL", "Python"],
  },
  {
    match: /\bdata analyst\b/i,
    label: "Stack-led data-analysis query",
    keywords: ["SQL", "Tableau", "Power BI"],
  },
  {
    match: /\b(business intelligence analyst|analytics engineer)\b/i,
    label: "Stack-led analytics query",
    keywords: ["SQL", "Tableau", "Power BI"],
  },
  {
    match: /\b(devops engineer|site reliability engineer|platform engineer|cloud engineer)\b/i,
    label: "Stack-led infrastructure query",
    keywords: ["AWS", "Terraform", "Kubernetes"],
  },
  {
    match: /\bqa\b|\bquality assurance\b|\btest automation\b/i,
    label: "Stack-led QA query",
    keywords: ["Selenium", "Cypress", "Automation"],
  },
  {
    match: /\b(cybersecurity|security|soc|siem)\b/i,
    label: "Stack-led security query",
    keywords: ["SIEM", "SOC", "Incident Response"],
  },
];

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeSourceName(sourceName: string) {
  return normalizeWhitespace(sourceName).toLowerCase();
}

function slugifyVariantKey(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizePolicyTitle(input: string) {
  return normalizeWhitespace(input);
}

export function normalizePolicyLocation(input: string) {
  return normalizeWhitespace(input);
}

export function normalizePolicyRunFrequency(hours: number | null | undefined) {
  if (!Number.isFinite(hours)) {
    return DEFAULT_POLICY_RUN_FREQUENCY_HOURS;
  }
  const numeric = Number(hours);
  if (numeric < MIN_POLICY_RUN_FREQUENCY_HOURS) {
    return MIN_POLICY_RUN_FREQUENCY_HOURS;
  }
  if (numeric > MAX_POLICY_RUN_FREQUENCY_HOURS) {
    return MAX_POLICY_RUN_FREQUENCY_HOURS;
  }
  return Math.round(numeric);
}

function sameTextArray(a: string[] | null | undefined, b: string[] | null | undefined) {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function jsonComparable(value: unknown) {
  return JSON.stringify(value ?? {});
}

function parseUrl(baseUrl: string, fallbackUrl: string) {
  try {
    return new URL(baseUrl);
  } catch {
    return new URL(fallbackUrl);
  }
}

function setSearchParam(url: URL, key: string, value: string) {
  if (!value) {
    url.searchParams.delete(key);
    return;
  }
  url.searchParams.set(key, value);
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const normalized = normalizeWhitespace(value).toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    unique.push(normalizeWhitespace(value));
  }
  return unique;
}

function stripLeadingSeniority(title: string) {
  let working = normalizePolicyTitle(title);
  let changed = false;

  while (working) {
    const tokens = working.split(" ");
    if (tokens.length <= 1) {
      break;
    }
    const candidate = tokens.slice(0, 2).join(" ").toLowerCase();
    const firstToken = tokens[0].toLowerCase();

    if (TITLE_SENIORITY_PREFIXES.includes(candidate)) {
      working = tokens.slice(2).join(" ");
      changed = true;
      continue;
    }

    if (TITLE_SENIORITY_PREFIXES.includes(firstToken)) {
      working = tokens.slice(1).join(" ");
      changed = true;
      continue;
    }

    break;
  }

  return changed ? normalizePolicyTitle(working) : normalizePolicyTitle(title);
}

function buildTitleVariants(jobTitle: string) {
  const exactTitle = normalizePolicyTitle(jobTitle);
  const variants: Array<{
    key: string;
    label: string;
    queryStrategy: PolicySearchVariant["queryStrategy"];
    title: string;
  }> = [
    {
      key: "exact",
      label: "Exact title",
      queryStrategy: "exact",
      title: exactTitle,
    },
  ];

  const titleCore = stripLeadingSeniority(exactTitle);
  if (titleCore && titleCore.toLowerCase() !== exactTitle.toLowerCase()) {
    variants.push({
      key: "title_core",
      label: "Core title",
      queryStrategy: "title_core",
      title: titleCore,
    });
  }

  const aliasCandidates: string[] = [];
  for (const rule of TITLE_ALIAS_RULES) {
    if (rule.match.test(exactTitle) || rule.match.test(titleCore)) {
      aliasCandidates.push(...rule.aliases);
    }
  }

  for (const alias of dedupeStrings(aliasCandidates)) {
    const normalizedAlias = normalizePolicyTitle(alias);
    if (
      normalizedAlias.toLowerCase() === exactTitle.toLowerCase() ||
      normalizedAlias.toLowerCase() === titleCore.toLowerCase()
    ) {
      continue;
    }
    variants.push({
      key: `title_alias_${slugifyVariantKey(normalizedAlias)}`,
      label: `Alias: ${normalizedAlias}`,
      queryStrategy: "title_alias",
      title: normalizedAlias,
    });
  }

  return variants.slice(0, MAX_POLICY_TITLE_VARIANTS);
}

function buildSkillKeywordVariants(jobTitle: string) {
  const exactTitle = normalizePolicyTitle(jobTitle);
  const titleCore = stripLeadingSeniority(exactTitle);
  const baseTitle = titleCore || exactTitle;
  const variants: Array<{
    key: string;
    label: string;
    queryStrategy: PolicySearchVariant["queryStrategy"];
    title: string;
    keywords: string[];
  }> = [];

  for (const rule of TITLE_SKILL_RULES) {
    if (!rule.match.test(exactTitle) && !rule.match.test(titleCore)) {
      continue;
    }

    const dedupedKeywords = dedupeStrings(rule.keywords).slice(0, 3);
    if (dedupedKeywords.length === 0) {
      continue;
    }

    const queryTitle = normalizePolicyTitle(`${baseTitle} ${dedupedKeywords.join(" ")}`);
    variants.push({
      key: `skill_${slugifyVariantKey(dedupedKeywords.join("_"))}`,
      label: rule.label,
      queryStrategy: "skill_keyword",
      title: queryTitle,
      keywords: [baseTitle, ...dedupedKeywords],
    });
  }

  return variants.slice(0, MAX_POLICY_SKILL_VARIANTS);
}

function buildLocationVariants(location: string) {
  const exactLocation = normalizePolicyLocation(location);
  const variants: Array<{
    key: string;
    label: string;
    queryStrategy: PolicySearchVariant["queryStrategy"];
    location: string;
  }> = [
    {
      key: "exact",
      label: "Exact location",
      queryStrategy: "exact",
      location: exactLocation,
    },
  ];

  const parts = exactLocation
    .split(",")
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);

  if (parts.length > 1) {
    variants.push({
      key: "location_city",
      label: "City-only location",
      queryStrategy: "location_fallback",
      location: parts[0],
    });
  }

  const lower = exactLocation.toLowerCase();
  const remoteLike = lower.includes("remote");
  if (remoteLike && exactLocation.toLowerCase() !== "remote") {
    variants.push({
      key: "location_remote",
      label: "Remote keyword",
      queryStrategy: "location_fallback",
      location: "Remote",
    });
  }

  if (/\bunited states\b/i.test(exactLocation) && exactLocation.toLowerCase() !== "usa") {
    variants.push({
      key: "location_usa",
      label: "USA location alias",
      queryStrategy: "location_fallback",
      location: "USA",
    });
  } else if (/\busa\b/i.test(exactLocation) && exactLocation.toLowerCase() !== "united states") {
    variants.push({
      key: "location_united_states",
      label: "United States location alias",
      queryStrategy: "location_fallback",
      location: "United States",
    });
  }

  return variants
    .filter(
      (variant, index, list) =>
        list.findIndex(
          (candidate) =>
            candidate.location.toLowerCase() === variant.location.toLowerCase()
        ) === index
    )
    .slice(0, MAX_POLICY_LOCATION_VARIANTS);
}

function buildPolicySearchVariant(
  policyId: string,
  jobTitle: string,
  location: string,
  titleVariant:
    | ReturnType<typeof buildTitleVariants>[number]
    | ReturnType<typeof buildSkillKeywordVariants>[number],
  locationVariant: ReturnType<typeof buildLocationVariants>[number],
  combined = false
): PolicySearchVariant {
  const variantKey =
    titleVariant.key === "exact" && locationVariant.key === "exact"
      ? "exact"
      : combined
      ? `${titleVariant.key}__${locationVariant.key}`
      : titleVariant.key === "exact"
      ? locationVariant.key
      : titleVariant.key;

  const queryStrategy = combined
    ? "combined"
    : titleVariant.queryStrategy !== "exact"
    ? titleVariant.queryStrategy
    : locationVariant.queryStrategy;

  const queryTitle = titleVariant.title;
  const queryLocation = locationVariant.location;

  return {
    key: variantKey,
    label:
      titleVariant.key === "exact" && locationVariant.key === "exact"
        ? "Exact title + location"
        : combined
        ? `${titleVariant.label} + ${locationVariant.label}`
        : titleVariant.key === "exact"
        ? locationVariant.label
        : titleVariant.label,
    queryStrategy,
    title: queryTitle,
    location: queryLocation,
    searchName: `${queryTitle} - ${queryLocation}`,
    keywords: "keywords" in titleVariant ? titleVariant.keywords : [queryTitle],
    filters: {
      managed_by: "superadmin_policy",
      policy_id: policyId,
      validated: true,
      variant_key: variantKey,
      variant_label:
        titleVariant.key === "exact" && locationVariant.key === "exact"
          ? "Exact title + location"
          : combined
          ? `${titleVariant.label} + ${locationVariant.label}`
          : titleVariant.key === "exact"
          ? locationVariant.label
          : titleVariant.label,
      query_strategy: queryStrategy,
      base_job_title: jobTitle,
      base_location: location,
      variant_title: queryTitle,
      variant_location: queryLocation,
    },
  };
}

export function buildDiscoveryPolicyVariants(policyId: string, jobTitle: string, location: string) {
  const desiredTitle = normalizePolicyTitle(jobTitle);
  const desiredLocation = normalizePolicyLocation(location);
  const titleVariants = buildTitleVariants(desiredTitle);
  const skillVariants = buildSkillKeywordVariants(desiredTitle);
  const locationVariants = buildLocationVariants(desiredLocation);
  const variants = new Map<string, PolicySearchVariant>();

  const addVariant = (
    titleVariant: ReturnType<typeof buildTitleVariants>[number],
    locationVariant: ReturnType<typeof buildLocationVariants>[number],
    combined = false
  ) => {
    const variant = buildPolicySearchVariant(
      policyId,
      desiredTitle,
      desiredLocation,
      titleVariant,
      locationVariant,
      combined
    );
    const dedupeKey = `${variant.key}::${variant.title.toLowerCase()}::${variant.location.toLowerCase()}`;
    if (!variants.has(dedupeKey)) {
      variants.set(dedupeKey, variant);
    }
  };

  addVariant(titleVariants[0], locationVariants[0]);

  for (const titleVariant of titleVariants.slice(1)) {
    addVariant(titleVariant, locationVariants[0]);
  }

  for (const locationVariant of locationVariants.slice(1)) {
    addVariant(titleVariants[0], locationVariant);
  }

  for (const skillVariant of skillVariants) {
    addVariant(skillVariant, locationVariants[0]);
  }

  if (titleVariants.length > 1 && locationVariants.length > 1) {
    addVariant(titleVariants[1], locationVariants[1], true);
  }

  return Array.from(variants.values());
}

function getPolicyVariantKey(search: PolicySearchRow) {
  const filters = search.filters ?? {};
  const variantKey = filters["variant_key"];
  return typeof variantKey === "string" && variantKey.trim().length > 0
    ? variantKey.trim()
    : "exact";
}

export function buildDiscoverySearchUrl(
  sourceName: string,
  baseUrl: string,
  jobTitle: string,
  location: string
) {
  const normalizedSource = normalizeSourceName(sourceName);
  const normalizedTitle = normalizePolicyTitle(jobTitle);
  const normalizedLocation = normalizePolicyLocation(location);

  if (normalizedSource === "linkedin") {
    const url = parseUrl(baseUrl, "https://www.linkedin.com/jobs/search");
    setSearchParam(url, "keywords", normalizedTitle);
    setSearchParam(url, "location", normalizedLocation);
    return url.toString();
  }

  if (normalizedSource === "indeed") {
    const url = parseUrl(baseUrl, "https://www.indeed.com/jobs");
    setSearchParam(url, "q", normalizedTitle);
    setSearchParam(url, "l", normalizedLocation);
    return url.toString();
  }

  if (normalizedSource === "glassdoor") {
    const url = parseUrl(baseUrl, "https://www.glassdoor.com/Job/jobs.htm");
    if (!/jobs\.htm$/i.test(url.pathname)) {
      const basePath = url.pathname.replace(/\/+$/, "");
      url.pathname = basePath.toLowerCase().endsWith("/job")
        ? `${basePath}/jobs.htm`
        : "/Job/jobs.htm";
    }
    setSearchParam(url, "sc.keyword", normalizedTitle);
    setSearchParam(url, "locKeyword", normalizedLocation);
    return url.toString();
  }

  const url = parseUrl(baseUrl, "https://www.linkedin.com/jobs/search");
  setSearchParam(url, "keywords", normalizedTitle);
  setSearchParam(url, "location", normalizedLocation);
  return url.toString();
}

async function disablePolicySearch(searchId: string, updatedAt: string) {
  const { error } = await supabaseServer
    .from("job_discovery_searches")
    .update({
      enabled: false,
      updated_at: updatedAt,
    })
    .eq("id", searchId);

  if (error) {
    throw new Error(`Failed to disable policy search ${searchId}.`);
  }
}

export async function syncValidatedDiscoverySearches(): Promise<DiscoveryPolicySyncSummary> {
  const nowIso = new Date().toISOString();
  let created = 0;
  let updated = 0;
  let disabled = 0;
  const disabledSearchIds = new Set<string>();

  const { data: policiesData, error: policiesError } = await supabaseServer
    .from("discovery_search_policies")
    .select("id, source_name, job_title, location, run_frequency_hours, enabled")
    .order("created_at", { ascending: false });

  if (policiesError) {
    throw new Error("Failed to fetch discovery policies.");
  }

  const policies = (policiesData ?? []) as DiscoveryPolicyRow[];
  const policyIds = new Set(policies.map((policy) => policy.id));

  const { data: existingData, error: existingError } = await supabaseServer
    .from("job_discovery_searches")
    .select(
      "id, policy_id, job_seeker_id, source_id, search_name, search_url, keywords, location, filters, run_frequency_hours, enabled"
    )
    .not("policy_id", "is", null);

  if (existingError) {
    throw new Error("Failed to fetch policy-linked discovery searches.");
  }

  const policySearches = ((existingData ?? []) as PolicySearchRow[]).filter(
    (search) => !search.job_seeker_id && !!search.policy_id
  );
  const existingByPolicyVariant = new Map<string, PolicySearchRow>();
  const duplicatePolicySearchIds = new Set<string>();
  for (const search of policySearches) {
    if (!search.policy_id) {
      continue;
    }
    const key = `${search.policy_id}::${getPolicyVariantKey(search)}`;
    if (existingByPolicyVariant.has(key)) {
      duplicatePolicySearchIds.add(search.id);
      continue;
    }
    existingByPolicyVariant.set(key, search);
  }
  const desiredPolicyVariantKeys = new Set<string>();

  const sourceNames = Array.from(
    new Set(policies.map((policy) => normalizeSourceName(policy.source_name)))
  );

  let sourceMap = new Map<string, JobSourceRow>();
  if (sourceNames.length > 0) {
    const { data: sourcesData, error: sourcesError } = await supabaseServer
      .from("job_sources")
      .select("id, name, base_url, enabled")
      .in("name", sourceNames);

    if (sourcesError) {
      throw new Error("Failed to fetch job sources for discovery policies.");
    }

    sourceMap = new Map(
      ((sourcesData ?? []) as JobSourceRow[]).map((source) => [
        normalizeSourceName(source.name),
        source,
      ])
    );
  }

  for (const policy of policies) {
    const sourceName = normalizeSourceName(policy.source_name);
    const source = sourceMap.get(sourceName);

    if (!source) {
      for (const search of policySearches) {
        if (search.policy_id === policy.id && search.enabled) {
          await disablePolicySearch(search.id, nowIso);
          disabledSearchIds.add(search.id);
          disabled += 1;
        }
      }
      continue;
    }

    const desiredEnabled = Boolean(policy.enabled) && Boolean(source.enabled);
    const desiredRunFrequency = normalizePolicyRunFrequency(policy.run_frequency_hours);
    const desiredTitle = normalizePolicyTitle(policy.job_title);
    const desiredLocation = normalizePolicyLocation(policy.location);
    const desiredVariants = buildDiscoveryPolicyVariants(policy.id, desiredTitle, desiredLocation);

    for (const variant of desiredVariants) {
      const desiredSearchKey = `${policy.id}::${variant.key}`;
      desiredPolicyVariantKeys.add(desiredSearchKey);
      const existingSearch = existingByPolicyVariant.get(desiredSearchKey);
      const desiredSearchUrl = buildDiscoverySearchUrl(
        sourceName,
        source.base_url,
        variant.title,
        variant.location
      );

      if (!existingSearch) {
        const { error: insertError } = await supabaseServer
          .from("job_discovery_searches")
          .insert({
            policy_id: policy.id,
            job_seeker_id: null,
            source_id: source.id,
            search_name: variant.searchName,
            search_url: desiredSearchUrl,
            keywords: variant.keywords,
            location: variant.location,
            filters: variant.filters,
            run_frequency_hours: desiredRunFrequency,
            enabled: desiredEnabled,
            created_at: nowIso,
            updated_at: nowIso,
          });

        if (insertError) {
          throw new Error(
            `Failed to create discovery search for policy ${policy.id} (${variant.key}).`
          );
        }

        created += 1;
        continue;
      }

      const hasChanges =
        existingSearch.source_id !== source.id ||
        existingSearch.search_name !== variant.searchName ||
        existingSearch.search_url !== desiredSearchUrl ||
        !sameTextArray(existingSearch.keywords, variant.keywords) ||
        (existingSearch.location ?? null) !== variant.location ||
        normalizePolicyRunFrequency(existingSearch.run_frequency_hours) !== desiredRunFrequency ||
        existingSearch.enabled !== desiredEnabled ||
        jsonComparable(existingSearch.filters) !== jsonComparable(variant.filters);

      if (!hasChanges) {
        continue;
      }

      const { error: updateError } = await supabaseServer
        .from("job_discovery_searches")
        .update({
          source_id: source.id,
          search_name: variant.searchName,
          search_url: desiredSearchUrl,
          keywords: variant.keywords,
          location: variant.location,
          filters: variant.filters,
          run_frequency_hours: desiredRunFrequency,
          enabled: desiredEnabled,
          updated_at: nowIso,
        })
        .eq("id", existingSearch.id);

      if (updateError) {
        throw new Error(
          `Failed to update discovery search for policy ${policy.id} (${variant.key}).`
        );
      }

      updated += 1;
    }
  }

  for (const existingSearch of policySearches) {
    if (disabledSearchIds.has(existingSearch.id)) {
      continue;
    }
    if (duplicatePolicySearchIds.has(existingSearch.id)) {
      if (!existingSearch.enabled) {
        continue;
      }
      await disablePolicySearch(existingSearch.id, nowIso);
      disabledSearchIds.add(existingSearch.id);
      disabled += 1;
      continue;
    }
    const policyId = existingSearch.policy_id;
    const variantKey = getPolicyVariantKey(existingSearch);
    if (policyId && policyIds.has(policyId) && desiredPolicyVariantKeys.has(`${policyId}::${variantKey}`)) {
      continue;
    }
    if (!existingSearch.enabled) {
      continue;
    }
    await disablePolicySearch(existingSearch.id, nowIso);
    disabledSearchIds.add(existingSearch.id);
    disabled += 1;
  }

  const { count: activeSearchesCount } = await supabaseServer
    .from("job_discovery_searches")
    .select("id", { count: "exact", head: true })
    .not("policy_id", "is", null)
    .is("job_seeker_id", null)
    .eq("enabled", true);

  return {
    created,
    updated,
    disabled,
    total_policies: policies.length,
    active_searches: activeSearchesCount ?? 0,
  };
}
