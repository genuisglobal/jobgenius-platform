/**
 * Intelligent Job Match Scoring Algorithm
 *
 * Computes a comprehensive match score between a job seeker and a job posting
 * based on multiple weighted factors.
 */

import type {
  JobSeekerProfile,
  JobPost,
  LocationPreference,
  MatchResult,
  MatchScoreBreakdown,
  MatchConfidence,
  MatchRecommendation,
  ScoringWeights,
  DEFAULT_WEIGHTS,
} from "./types";
import { hierarchicalSkillMatch } from "./skill-hierarchy";
import { computeResumeBonus } from "./resume-extractor";

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function normalizeString(str: string): string {
  return str.trim().toLowerCase();
}

function normalizeArray(arr: string[] | null | undefined): string[] {
  if (!arr) return [];
  return arr.map(normalizeString).filter((s) => s.length > 0);
}

function normalizeLocationText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/\((?:remote|hybrid|on[- ]?site|onsite|in[- ]office|in office)[^)]*\)/g, " ")
    .replace(/\bremote(?: only| within [a-z\s]+)?\b/g, " ")
    .replace(/\bhybrid\b/g, " ")
    .replace(/\bon[- ]?site\b|\bonsite\b|\bin[- ]office\b|\bin office\b/g, " ")
    .replace(/\bnew york city\b|\bnyc\b/g, "new york")
    .replace(/\bwashington,\s*d\.?c\.?\b|\bwashington d\.?c\.?\b/g, "washington dc")
    .replace(/\bu\.?s\.?a?\.?\b/g, "united states")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeLocation(value: string) {
  return value.split(" ").filter((token) => token.length >= 2);
}

function locationsRoughlyMatch(left: string | null | undefined, right: string | null | undefined) {
  const leftNormalized = normalizeLocationText(left);
  const rightNormalized = normalizeLocationText(right);

  if (!leftNormalized || !rightNormalized) {
    return false;
  }

  if (leftNormalized === rightNormalized) {
    return true;
  }

  if (
    leftNormalized.includes(rightNormalized) ||
    rightNormalized.includes(leftNormalized)
  ) {
    return true;
  }

  const leftTokens = tokenizeLocation(leftNormalized);
  const rightTokens = new Set(tokenizeLocation(rightNormalized));
  if (leftTokens.length === 0 || rightTokens.size === 0) {
    return false;
  }

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.min(leftTokens.length, rightTokens.size) >= 0.75;
}

const TITLE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "for",
  "of",
  "to",
  "in",
  "with",
  "at",
  "on",
  "sr",
  "jr",
  "senior",
  "junior",
  "lead",
  "principal",
  "staff",
  "mid",
  "level",
  "manager",
  "management",
  "specialist",
  "analyst",
  "associate",
  "coordinator",
  "consultant",
  "representative",
  "administrator",
  "officer",
  "executive",
  "intern",
  "trainee",
  "apprentice",
  "engineer",
  "developer",
]);

const TITLE_TOKEN_NORMALIZATIONS: Record<string, string> = {
  cybersecurity: "security",
  cyber: "security",
  infosec: "security",
  secops: "security",
  sde: "software",
  swe: "software",
  dev: "developer",
  backenddeveloper: "back-end",
  backendengineer: "back-end",
  frontenddeveloper: "front-end",
  frontendengineer: "front-end",
  fullstackdeveloper: "full-stack",
  fullstackengineer: "full-stack",
  sitereliability: "sre",
  frontend: "front-end",
  frontendend: "front-end",
  backend: "back-end",
  fullstack: "full-stack",
  productowner: "product",
  presales: "pre-sales",
  bizops: "operations",
  bizdev: "sales",
  bi: "analytics",
  qa: "quality",
};

const TITLE_ALIAS_GROUPS: Array<[string, string[]]> = [
  [
    "software_engineering",
    [
      "software engineer",
      "software developer",
      "application engineer",
      "application developer",
      "sde",
      "swe",
    ],
  ],
  [
    "backend_engineering",
    [
      "backend engineer",
      "backend developer",
      "back-end engineer",
      "back-end developer",
      "api engineer",
      "api developer",
      "server engineer",
      "server developer",
    ],
  ],
  [
    "frontend_engineering",
    [
      "frontend engineer",
      "frontend developer",
      "front-end engineer",
      "front-end developer",
      "web engineer",
      "web developer",
      "ui engineer",
    ],
  ],
  [
    "full_stack_engineering",
    [
      "full stack engineer",
      "full stack developer",
      "full-stack engineer",
      "full-stack developer",
    ],
  ],
  [
    "platform_devops",
    [
      "platform engineer",
      "devops engineer",
      "site reliability engineer",
      "sre",
      "cloud engineer",
      "infrastructure engineer",
      "systems engineer",
    ],
  ],
  [
    "data_analytics",
    [
      "data analyst",
      "business intelligence analyst",
      "bi analyst",
      "analytics analyst",
      "reporting analyst",
      "insights analyst",
    ],
  ],
  [
    "product_management",
    ["product manager", "product owner", "technical product manager"],
  ],
  [
    "customer_success",
    [
      "customer success manager",
      "client success manager",
      "account manager",
      "customer account manager",
    ],
  ],
];

type TitleAlignment = {
  exact: boolean;
  partial: boolean;
  matchedTitles: string[];
  partialMatches: string[];
  bestTokenOverlap: number;
  sharedFamilies: string[];
  hardMismatch: boolean;
};

function canonicalizeTitleToken(token: string): string {
  const base = normalizeString(token).replace(/[^a-z0-9+#]+/g, "");
  if (!base) return "";
  return TITLE_TOKEN_NORMALIZATIONS[base] ?? base;
}

function tokenizeTitle(title: string): string[] {
  return normalizeString(title)
    .replace(/[^a-z0-9+#/ -]+/g, " ")
    .split(/[\s/()-]+/)
    .map(canonicalizeTitleToken)
    .filter((token) => token.length > 0 && !TITLE_STOP_WORDS.has(token));
}

function normalizeTitlePhrase(title: string): string {
  return normalizeString(title)
    .replace(/[^a-z0-9+#/ -]+/g, " ")
    .replace(/\bfront end\b/g, "front-end")
    .replace(/\bback end\b/g, "back-end")
    .replace(/\bfull stack\b/g, "full-stack")
    .replace(/\bsite reliability engineer\b/g, "sre")
    .replace(/\s+/g, " ")
    .trim();
}

function detectTitleAliasGroups(title: string): Set<string> {
  const normalized = normalizeTitlePhrase(title);
  const groups = new Set<string>();

  for (const [group, aliases] of TITLE_ALIAS_GROUPS) {
    if (
      aliases.some((alias) => {
        const normalizedAlias = normalizeTitlePhrase(alias);
        return normalized === normalizedAlias || normalized.includes(normalizedAlias);
      })
    ) {
      groups.add(group);
    }
  }

  return groups;
}

function detectTitleFamilies(title: string): Set<string> {
  const normalizedTitle = normalizeString(title);
  const tokens = tokenizeTitle(title);
  const combined = new Set<string>([normalizedTitle, ...tokens]);
  const families = new Set<string>();

  const familyRules: Array<[string, string[]]> = [
    [
      "security",
      ["security", "threat", "soc", "siem", "iam", "incident", "infosec", "cyber"],
    ],
    [
      "software",
      ["software", "platform", "devops", "sre", "qa", "automation", "front-end", "back-end", "full-stack"],
    ],
    [
      "data",
      ["data", "analytics", "bi", "reporting", "insights", "machinelearning", "ml"],
    ],
    [
      "database",
      ["database", "dba", "sql", "etl", "datawarehouse", "ssis", "ssrs", "mssql", "mysql", "postgres", "oracle", "nosql", "mongodb"],
    ],
    [
      "infrastructure",
      ["cloud", "infrastructure", "network", "system", "sysadmin", "devops", "sre", "platform", "linux", "windows", "aws", "azure", "gcp"],
    ],
    [
      "healthcare",
      ["nurse", "nursing", "clinical", "medical", "health", "pharmacy", "therapist", "physician", "dental"],
    ],
    [
      "legal",
      ["legal", "lawyer", "attorney", "paralegal", "compliance", "regulatory", "counsel"],
    ],
    [
      "product",
      ["product", "roadmap", "owner"],
    ],
    [
      "marketing",
      ["marketing", "brand", "content", "seo", "sem", "communications", "copywriter", "growth"],
    ],
    [
      "sales_customer",
      ["sales", "account", "customer", "solution", "support", "success", "revenue", "partnership"],
    ],
    [
      "people_hr",
      ["recruit", "recruiting", "recruiter", "talent", "people", "hr", "humanresources"],
    ],
    [
      "design",
      ["design", "designer", "ux", "ui", "creative", "visual"],
    ],
    [
      "finance",
      ["finance", "financial", "accounting", "controller", "audit", "fp&a", "bookkeeping"],
    ],
    [
      "operations",
      ["operations", "ops", "logistics", "supply", "program", "project", "delivery"],
    ],
  ];

  for (const [family, keywords] of familyRules) {
    if (
      keywords.some((keyword) => {
        const canonicalKeyword = canonicalizeTitleToken(keyword);
        return (
          combined.has(canonicalKeyword) ||
          normalizedTitle.includes(keyword)
        );
      })
    ) {
      families.add(family);
    }
  }

  return families;
}

/**
 * Detect if a target entry looks like a skill/technology rather than a job title.
 * Single-token entries that are common tech keywords are treated as skills.
 * These still contribute to family detection but should not drive partial matching.
 */
function isSkillLikeEntry(entry: string): boolean {
  const rawWords = normalizeString(entry)
    .replace(/[^a-z0-9+#/ -]+/g, " ")
    .split(/[\s/()-]+/)
    .filter((token) => token.length > 0);
  // Multi-word entries are likely job titles (e.g. "Database Administrator")
  if (rawWords.length >= 2) return false;
  const tokens = tokenizeTitle(entry);
  // Single token — check if it's a known technology/skill keyword
  const skillKeywords = new Set([
    "sql", "mssql", "mysql", "postgres", "postgresql", "oracle", "nosql", "mongodb",
    "ssis", "ssrs", "ssas", "etl", "python", "java", "javascript", "typescript",
    "react", "angular", "vue", "node", "golang", "ruby", "rust", "swift", "kotlin",
    "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "ansible",
    "linux", "windows", "macos", "excel", "tableau", "powerbi",
    "salesforce", "sap", "jira", "confluence", "git", "github",
    "html", "css", "php", "c#", "c++", ".net", "spring",
    "redis", "kafka", "elasticsearch", "graphql", "rest",
    "microsoft", "google", "apple", "meta", "amazon",
    "agile", "scrum", "kanban", "cicd", "ci/cd",
  ]);
  const normalized = tokens[0] || normalizeString(entry).replace(/[^a-z0-9+#]+/g, "");
  return skillKeywords.has(normalized);
}

function analyzeTitleAlignment(
  targetTitles: string[] | null | undefined,
  rawJobTitle: string
): TitleAlignment {
  const normalizedTargets = normalizeArray(targetTitles);
  const jobTitle = normalizeString(rawJobTitle);
  const jobTokens = new Set(tokenizeTitle(rawJobTitle));
  const jobFamilies = detectTitleFamilies(rawJobTitle);
  const jobAliasGroups = detectTitleAliasGroups(rawJobTitle);

  const matchedTitles: string[] = [];
  const partialMatches: string[] = [];
  let bestTokenOverlap = 0;
  const sharedFamilies = new Set<string>();

  // Separate actual title entries from skill-like entries
  const titleEntries: string[] = [];
  const skillEntries: string[] = [];
  for (const target of normalizedTargets) {
    if (isSkillLikeEntry(target)) {
      skillEntries.push(target);
    } else {
      titleEntries.push(target);
    }
  }

  // Skill entries still contribute to family detection
  for (const skill of skillEntries) {
    const skillFamilies = detectTitleFamilies(skill);
    for (const family of Array.from(skillFamilies)) {
      if (jobFamilies.has(family)) {
        sharedFamilies.add(family);
      }
    }
  }

  // Title entries drive exact/partial matching
  for (const target of titleEntries) {
    const normalizedTarget = normalizeTitlePhrase(target);

    if (jobTitle.includes(target) || normalizeTitlePhrase(rawJobTitle).includes(normalizedTarget)) {
      matchedTitles.push(target);
      continue;
    }

    const targetTokens = tokenizeTitle(target);
    const matchedTokenCount = targetTokens.filter((token) => jobTokens.has(token)).length;
    const tokenOverlap =
      targetTokens.length > 0 ? matchedTokenCount / targetTokens.length : 0;
    bestTokenOverlap = Math.max(bestTokenOverlap, tokenOverlap);

    const targetFamilies = detectTitleFamilies(target);
    for (const family of Array.from(targetFamilies)) {
      if (jobFamilies.has(family)) {
        sharedFamilies.add(family);
      }
    }

    const targetAliasGroups = detectTitleAliasGroups(target);
    const sharedAliasGroups = Array.from(targetAliasGroups).filter((group) =>
      jobAliasGroups.has(group)
    );

    if (
      tokenOverlap >= 0.6 ||
      (matchedTokenCount >= 2 && targetTokens.length >= 2)
    ) {
      partialMatches.push(target);
    } else if (sharedAliasGroups.length > 0) {
      partialMatches.push(target);
      bestTokenOverlap = Math.max(bestTokenOverlap, 0.65);
    } else if (tokenOverlap >= 0.4 && targetFamilies.size > 0) {
      partialMatches.push(target);
    }
  }

  // Only consider families from actual title entries for hard mismatch detection
  const hasFamilies = titleEntries.some((target) => detectTitleFamilies(target).size > 0);
  const hardMismatch =
    matchedTitles.length === 0 &&
    partialMatches.length === 0 &&
    hasFamilies &&
    jobFamilies.size > 0 &&
    sharedFamilies.size === 0 &&
    bestTokenOverlap < 0.25;

  return {
    exact: matchedTitles.length > 0,
    partial: partialMatches.length > 0,
    matchedTitles,
    partialMatches,
    bestTokenOverlap,
    sharedFamilies: Array.from(sharedFamilies),
    hardMismatch,
  };
}

/**
 * Calculate overlap percentage between two ranges
 */
function rangeOverlapPercent(
  min1: number,
  max1: number,
  min2: number,
  max2: number
): number {
  const overlapStart = Math.max(min1, min2);
  const overlapEnd = Math.min(max1, max2);

  if (overlapStart > overlapEnd) return 0;

  const overlapSize = overlapEnd - overlapStart;
  const smallerRange = Math.min(max1 - min1, max2 - min2);

  if (smallerRange <= 0) return overlapStart <= max1 && overlapStart >= min1 ? 100 : 0;

  return Math.round((overlapSize / smallerRange) * 100);
}

/**
 * Fuzzy string matching for titles and skills
 */
function fuzzyMatch(needle: string, haystack: string): boolean {
  const n = normalizeString(needle);
  const h = normalizeString(haystack);

  // Exact match
  if (h.includes(n)) return true;

  // Handle common variations
  const variations: Record<string, string[]> = {
    javascript: ["js"],
    typescript: ["ts"],
    "react.js": ["react", "reactjs"],
    "node.js": ["node", "nodejs"],
    "vue.js": ["vue", "vuejs"],
    "c#": ["csharp", "c sharp"],
    "c++": ["cpp"],
    golang: ["go"],
    postgresql: ["postgres", "psql"],
    kubernetes: ["k8s"],
  };

  for (const [main, alts] of Object.entries(variations)) {
    if (n === main || alts.includes(n)) {
      if (h.includes(main) || alts.some((alt) => h.includes(alt))) {
        return true;
      }
    }
  }

  return false;
}

// ============================================================================
// COMPONENT SCORERS
// ============================================================================

function scoreSkills(
  seeker: JobSeekerProfile,
  job: JobPost,
  maxScore: number
): MatchScoreBreakdown["skills"] {
  const seekerSkills = normalizeArray(seeker.skills);
  const jobRequired = normalizeArray(job.required_skills);
  const jobPreferred = normalizeArray(job.preferred_skills);

  // Also check description for skills if structured data is missing
  const descriptionLower = (job.description_text ?? "").toLowerCase();

  // Use hierarchical matching for structured skills
  if (jobRequired.length > 0 || jobPreferred.length > 0) {
    const hierarchy = hierarchicalSkillMatch(seekerSkills, jobRequired, jobPreferred);

    const requiredWeight = 0.8;
    const preferredWeight = 0.2;

    const requiredScore = jobRequired.length > 0
      ? hierarchy.requiredCoverage * maxScore * requiredWeight
      : maxScore * requiredWeight;

    const preferredScore = jobPreferred.length > 0
      ? hierarchy.preferredCoverage * maxScore * preferredWeight
      : 0;

    const score = Math.round(requiredScore + preferredScore);
    const coveragePct = Math.round(hierarchy.requiredCoverage * 100);

    return {
      score: Math.min(maxScore, score),
      max: maxScore,
      details: {
        matched_required: hierarchy.matchedRequired.map((m) => m.required),
        matched_preferred: hierarchy.matchedPreferred.map((m) => m.preferred),
        missing_required: hierarchy.missingRequired,
        coverage_pct: coveragePct,
      },
    };
  }

  // Fallback: check seeker skills against description (no structured data)
  const matchedFromDesc: string[] = [];
  for (const skill of seekerSkills) {
    if (fuzzyMatch(skill, descriptionLower)) {
      matchedFromDesc.push(skill);
    }
  }

  const score = matchedFromDesc.length > 0
    ? Math.min(maxScore, matchedFromDesc.length * 7)
    : 0;

  return {
    score: Math.min(maxScore, score),
    max: maxScore,
    details: {
      matched_required: matchedFromDesc,
      matched_preferred: [],
      missing_required: [],
      coverage_pct: 100,
    },
  };
}

function scoreTitle(
  seeker: JobSeekerProfile,
  job: JobPost,
  maxScore: number
): MatchScoreBreakdown["title"] {
  const alignment = analyzeTitleAlignment(seeker.target_titles, job.title);

  let score = 0;
  if (alignment.exact) {
    score = maxScore;
  } else if (alignment.partial) {
    const overlapBoost = Math.min(0.2, alignment.bestTokenOverlap * 0.2);
    score = Math.round(maxScore * (0.5 + overlapBoost));
  } else if (alignment.sharedFamilies.length > 0) {
    score = Math.round(maxScore * 0.25);
  }

  return {
    score,
    max: maxScore,
    details: {
      matched_titles: alignment.matchedTitles,
      partial_matches: alignment.partialMatches,
    },
  };
}

function scoreExperience(
  seeker: JobSeekerProfile,
  job: JobPost,
  maxScore: number
): MatchScoreBreakdown["experience"] {
  const seekerYears = seeker.years_experience;
  const jobMin = job.years_experience_min;
  const jobMax = job.years_experience_max;

  let score = 0;
  let matchType: "exact" | "close" | "over" | "under" | "unknown" = "unknown";

  if (seekerYears === null || (jobMin === null && jobMax === null)) {
    // Can't determine, give only light neutral credit
    score = Math.round(maxScore * 0.2);
    matchType = "unknown";
  } else {
    const effectiveJobMin = jobMin ?? 0;
    const effectiveJobMax = jobMax ?? effectiveJobMin + 5;

    if (seekerYears >= effectiveJobMin && seekerYears <= effectiveJobMax) {
      score = maxScore;
      matchType = "exact";
    } else if (seekerYears > effectiveJobMax) {
      // Overqualified - slight penalty but still good
      score = Math.round(maxScore * 0.8);
      matchType = "over";
    } else if (seekerYears >= effectiveJobMin - 1) {
      // Close to minimum
      score = Math.round(maxScore * 0.6);
      matchType = "close";
    } else {
      // Under-experienced
      const gap = effectiveJobMin - seekerYears;
      score = Math.max(0, Math.round(maxScore * (1 - gap * 0.2)));
      matchType = "under";
    }
  }

  return {
    score,
    max: maxScore,
    details: {
      seeker_years: seekerYears,
      job_min: jobMin,
      job_max: jobMax,
      match_type: matchType,
    },
  };
}

function scoreSalary(
  seeker: JobSeekerProfile,
  job: JobPost,
  maxScore: number
): MatchScoreBreakdown["salary"] {
  const seekerMin = seeker.salary_min;
  const seekerMax = seeker.salary_max;
  const jobMin = job.salary_min;
  const jobMax = job.salary_max;

  let score = 0;
  let overlapPct = 0;
  let matchType: "full" | "partial" | "none" | "unknown" = "unknown";

  // If either side has no salary info, give partial credit
  if (
    (seekerMin === null && seekerMax === null) ||
    (jobMin === null && jobMax === null)
  ) {
    score = Math.round(maxScore * 0.15);
    matchType = "unknown";
  } else {
    const effectiveSeekerMin = seekerMin ?? 0;
    const effectiveSeekerMax = seekerMax ?? effectiveSeekerMin * 1.5;
    const effectiveJobMin = jobMin ?? 0;
    const effectiveJobMax = jobMax ?? effectiveJobMin * 1.3;

    overlapPct = rangeOverlapPercent(
      effectiveSeekerMin,
      effectiveSeekerMax,
      effectiveJobMin,
      effectiveJobMax
    );

    if (overlapPct >= 80) {
      score = maxScore;
      matchType = "full";
    } else if (overlapPct > 0) {
      score = Math.round((overlapPct / 100) * maxScore);
      matchType = "partial";
    } else {
      score = 0;
      matchType = "none";
    }
  }

  return {
    score,
    max: maxScore,
    details: {
      seeker_min: seekerMin,
      seeker_max: seekerMax,
      job_min: jobMin,
      job_max: jobMax,
      overlap_pct: overlapPct,
      match_type: matchType,
    },
  };
}

/**
 * Score location match using new location_preferences if available,
 * otherwise fall back to the existing flat-field logic for backward compatibility.
 */
function scoreLocationWithPreferences(
  seeker: JobSeekerProfile,
  job: JobPost,
  maxScore: number
): MatchScoreBreakdown["location"] {
  const jobLocation = job.location;
  const jobWorkType = job.work_type;
  const jobLocationLower = normalizeString(jobLocation ?? "");
  const isJobRemote = jobWorkType === "remote" || jobLocationLower.includes("remote");

  let bestScore = 0;
  let matchType: "exact" | "region" | "remote" | "relocation" | "mismatch" = "mismatch";

  for (const pref of seeker.location_preferences) {
    const prefWorkType = pref.work_type;
    const prefLocations = normalizeArray(pref.locations);

    if (prefWorkType === "remote") {
      if (isJobRemote) {
        bestScore = maxScore;
        matchType = "remote";
        break; // Can't do better than full score
      }
    } else {
      // hybrid or onsite preference
      if (jobWorkType === prefWorkType || (prefWorkType === "onsite" && jobWorkType === "on-site")) {
        // Check if job location matches any of this preference's locations
        const locationHit = prefLocations.some(
          (loc) => locationsRoughlyMatch(jobLocationLower, loc)
        );
        if (locationHit) {
          bestScore = maxScore;
          matchType = "exact";
          break;
        }
      }
      // If seeker is open to hybrid/onsite but job is remote, still works (70%)
      if (isJobRemote) {
        const remoteScore = Math.round(maxScore * 0.7);
        if (remoteScore > bestScore) {
          bestScore = remoteScore;
          matchType = "remote";
        }
      }
    }
  }

  // Fall back to open_to_relocation if nothing matched
  if (bestScore === 0 && seeker.open_to_relocation) {
    bestScore = Math.round(maxScore * 0.4);
    matchType = "relocation";
  }

  return {
    score: bestScore,
    max: maxScore,
    details: {
      seeker_location: seeker.location,
      seeker_work_type: seeker.work_type,
      job_location: jobLocation,
      job_work_type: jobWorkType,
      match_type: matchType,
    },
  };
}

function scoreLocation(
  seeker: JobSeekerProfile,
  job: JobPost,
  maxScore: number
): MatchScoreBreakdown["location"] {
  // Use new location_preferences if populated
  if (seeker.location_preferences && seeker.location_preferences.length > 0) {
    return scoreLocationWithPreferences(seeker, job, maxScore);
  }

  // Backward-compatible flat-field logic
  const seekerLocation = seeker.location;
  const seekerLocations = normalizeArray(seeker.preferred_locations);
  const seekerWorkType = seeker.work_type;
  const openToRelocation = seeker.open_to_relocation;

  const jobLocation = job.location;
  const jobWorkType = job.work_type;

  let score = 0;
  let matchType: "exact" | "region" | "remote" | "relocation" | "mismatch" =
    "mismatch";

  const jobLocationLower = normalizeString(jobLocation ?? "");
  const seekerLocationLower = normalizeString(seekerLocation ?? "");

  // Check work type compatibility first
  const isJobRemote = jobWorkType === "remote" || jobLocationLower.includes("remote");
  const seekerWantsRemote = seekerWorkType === "remote";

  if (isJobRemote) {
    // Remote job - good match for anyone
    score = maxScore;
    matchType = "remote";
  } else if (seekerWantsRemote && !isJobRemote && jobWorkType !== "hybrid") {
    // Seeker wants remote but job is on-site
    score = openToRelocation ? Math.round(maxScore * 0.4) : 0;
    matchType = "mismatch";
  } else {
    // Check location match
    const allSeekerLocations = [
      seekerLocationLower,
      ...seekerLocations.map(normalizeString),
    ].filter((l) => l.length > 0);

    const locationMatch = allSeekerLocations.some(
      (loc) => locationsRoughlyMatch(jobLocationLower, loc)
    );

    if (locationMatch) {
      score = maxScore;
      matchType = "exact";
    } else if (openToRelocation) {
      score = Math.round(maxScore * 0.6);
      matchType = "relocation";
    } else if (jobWorkType === "hybrid" && seekerWorkType === "hybrid") {
      score = Math.round(maxScore * 0.5);
      matchType = "region";
    }
  }

  return {
    score,
    max: maxScore,
    details: {
      seeker_location: seekerLocation,
      seeker_work_type: seekerWorkType,
      job_location: jobLocation,
      job_work_type: jobWorkType,
      match_type: matchType,
    },
  };
}

function scoreCompanyFit(
  seeker: JobSeekerProfile,
  job: JobPost,
  maxScore: number
): MatchScoreBreakdown["company_fit"] {
  const seekerIndustries = normalizeArray(seeker.preferred_industries);
  const seekerSizes = normalizeArray(seeker.preferred_company_sizes);

  const jobIndustry = job.industry ? normalizeString(job.industry) : null;
  const jobSize = job.company_size ? normalizeString(job.company_size) : null;

  const industryScore =
    seekerIndustries.length === 0
      ? 0.75
      : !jobIndustry
        ? 0.35
        : seekerIndustries.some(
            (industry) =>
              industry === jobIndustry ||
              industry.includes(jobIndustry) ||
              jobIndustry.includes(industry)
          )
          ? 1
          : 0;

  const sizeScore =
    seekerSizes.length === 0
      ? 0.75
      : !jobSize
        ? 0.35
        : seekerSizes.some(
            (size) =>
              size === jobSize ||
              size.includes(jobSize) ||
              jobSize.includes(size)
          )
          ? 1
          : 0;

  const score = Math.round(maxScore * ((industryScore + sizeScore) / 2));
  const industryMatch = industryScore >= 1;
  const sizeMatch = sizeScore >= 1;

  return {
    score,
    max: maxScore,
    details: {
      industry_match: industryMatch,
      size_match: sizeMatch,
      seeker_industries: seekerIndustries,
      job_industry: jobIndustry,
    },
  };
}

function scorePenalties(
  seeker: JobSeekerProfile,
  job: JobPost,
  maxPenalty: number
): MatchScoreBreakdown["penalties"] {
  const excludeKeywords = normalizeArray(seeker.exclude_keywords);
  const combinedText = `${job.title} ${job.description_text ?? ""}`.toLowerCase();
  const titleAlignment = analyzeTitleAlignment(seeker.target_titles, job.title);

  const excludedFound: string[] = [];
  const reasons: string[] = [];

  // Check exclude keywords
  for (const keyword of excludeKeywords) {
    if (combinedText.includes(keyword)) {
      excludedFound.push(keyword);
      reasons.push(`exclude_keyword: ${keyword}`);
    }
  }

  // Check visa sponsorship mismatch
  let visaMismatch = false;
  if (seeker.requires_visa_sponsorship && job.offers_visa_sponsorship === false) {
    visaMismatch = true;
    reasons.push("visa_sponsorship_not_offered");
  }

  let titleMismatchPenalty = 0;
  if (titleAlignment.hardMismatch) {
    titleMismatchPenalty = 10;
    reasons.push("title_mismatch");
  } else if (
    seeker.target_titles.length > 0 &&
    !titleAlignment.exact &&
    !titleAlignment.partial &&
    titleAlignment.bestTokenOverlap === 0
  ) {
    titleMismatchPenalty = 4;
    reasons.push("weak_title_alignment");
  }

  // Calculate penalty
  let penalty = 0;
  penalty += excludedFound.length * 5;
  if (visaMismatch) penalty += 10;
  penalty += titleMismatchPenalty;
  penalty = Math.min(maxPenalty, penalty);

  return {
    score: -penalty,
    max: maxPenalty,
    details: {
      reasons,
      excluded_keywords_found: excludedFound,
      visa_mismatch: visaMismatch,
    },
  };
}

// ============================================================================
// CONFIDENCE & RECOMMENDATION
// ============================================================================

function determineConfidence(
  seeker: JobSeekerProfile,
  job: JobPost
): MatchConfidence {
  let dataPoints = 0;
  let totalPossible = 0;

  // Seeker data
  totalPossible += 8;
  if (seeker.skills.length > 0) dataPoints++;
  if (seeker.target_titles.length > 0) dataPoints++;
  if (seeker.location) dataPoints++;
  if (seeker.salary_min || seeker.salary_max) dataPoints++;
  if (seeker.years_experience !== null) dataPoints++;
  if (seeker.work_type) dataPoints++;
  if (seeker.seniority) dataPoints++;
  if (seeker.resume_text && seeker.resume_text.length > 200) dataPoints++;

  // Job data
  totalPossible += 7;
  if (job.required_skills.length > 0 || job.preferred_skills.length > 0) dataPoints++;
  if (job.salary_min || job.salary_max) dataPoints++;
  if (job.years_experience_min !== null) dataPoints++;
  if (job.work_type) dataPoints++;
  if (job.seniority_level) dataPoints++;
  if (job.industry) dataPoints++;
  if (job.description_text && job.description_text.length > 200) dataPoints++;

  const ratio = dataPoints / totalPossible;

  if (ratio >= 0.7) return "high";
  if (ratio >= 0.4) return "medium";
  return "low";
}

function determineRecommendation(
  score: number,
  confidence: MatchConfidence
): MatchRecommendation {
  // Adjust thresholds based on confidence
  const adjustedScore =
    confidence === "low" ? score * 0.9 : confidence === "medium" ? score * 0.95 : score;

  if (adjustedScore >= 75) return "strong_match";
  if (adjustedScore >= 55) return "good_match";
  if (adjustedScore >= 40) return "marginal";
  return "poor_fit";
}

// ============================================================================
// HARD DISQUALIFIERS
//
// Unlike the soft component penalties, these reject a job outright when a
// confident, data-present conflict makes it unsuitable for the client —
// regardless of how strong the skill/title overlap is. Only fires when the
// relevant data exists on BOTH sides, to avoid false negatives on sparse posts.
// ============================================================================

const SALARY_FLOOR_RATIO = 0.8;
const DISQUALIFIED_SCORE_CAP = 15;

function seekerCanWorkAtLocation(
  seeker: JobSeekerProfile,
  jobLocationLower: string
): boolean {
  if (seeker.open_to_relocation) return true;

  for (const pref of seeker.location_preferences) {
    if (pref.work_type === "remote") continue;
    if (
      normalizeArray(pref.locations).some((loc) =>
        locationsRoughlyMatch(jobLocationLower, loc)
      )
    ) {
      return true;
    }
  }

  if (
    seeker.location &&
    locationsRoughlyMatch(jobLocationLower, normalizeString(seeker.location))
  ) {
    return true;
  }

  return normalizeArray(seeker.preferred_locations).some((loc) =>
    locationsRoughlyMatch(jobLocationLower, loc)
  );
}

export interface HardDisqualifierResult {
  disqualified: boolean;
  reasons: string[];
}

export function checkHardDisqualifiers(
  seeker: JobSeekerProfile,
  job: JobPost
): HardDisqualifierResult {
  const reasons: string[] = [];

  // 1. Excluded keyword — the client explicitly opted out of these.
  const combinedText = `${job.title} ${job.description_text ?? ""}`.toLowerCase();
  for (const keyword of normalizeArray(seeker.exclude_keywords)) {
    if (keyword && combinedText.includes(keyword)) {
      reasons.push(`disqualified_exclude_keyword: ${keyword}`);
    }
  }

  // 2. Location / work-type the client cannot do. Remote jobs never trip this;
  //    only on-site/hybrid roles with a concrete location the client can't reach.
  const jobLocationLower = normalizeString(job.location ?? "");
  const isJobRemote =
    job.work_type === "remote" || jobLocationLower.includes("remote");
  if (!isJobRemote && job.location && job.location.trim()) {
    if (!seekerCanWorkAtLocation(seeker, jobLocationLower)) {
      reasons.push("disqualified_location_unreachable");
    }
  }

  // 3a. Pay clearly below the client's floor — compare the job's upper bound.
  const jobUpper = job.salary_max ?? job.salary_min;
  if (
    jobUpper !== null &&
    seeker.salary_min !== null &&
    jobUpper < seeker.salary_min * SALARY_FLOOR_RATIO
  ) {
    reasons.push("disqualified_salary_below_floor");
  }

  // 3b. Sponsorship needed but the job explicitly offers none.
  if (seeker.requires_visa_sponsorship && job.offers_visa_sponsorship === false) {
    reasons.push("disqualified_no_visa_sponsorship");
  }

  return { disqualified: reasons.length > 0, reasons };
}

// ============================================================================
// MAIN SCORING FUNCTION
// ============================================================================

export function computeMatchScore(
  seeker: JobSeekerProfile,
  job: JobPost,
  weights: ScoringWeights = {
    skills: 35,
    title: 20,
    experience: 10,
    salary: 10,
    location: 15,
    company_fit: 10,
    max_penalty: 15,
  }
): MatchResult {
  // Compute each component
  const skillsResult = scoreSkills(seeker, job, weights.skills);
  const titleResult = scoreTitle(seeker, job, weights.title);
  const experienceResult = scoreExperience(seeker, job, weights.experience);
  const salaryResult = scoreSalary(seeker, job, weights.salary);
  const locationResult = scoreLocation(seeker, job, weights.location);
  const companyFitResult = scoreCompanyFit(seeker, job, weights.company_fit);
  const penaltiesResult = scorePenalties(seeker, job, weights.max_penalty);
  const titleAlignment = analyzeTitleAlignment(seeker.target_titles, job.title);

  // Resume text bonus — extract additional signals not captured by structured fields
  const resumeResult = computeResumeBonus(
    seeker.resume_text,
    seeker.skills,
    job.required_skills,
    job.preferred_skills,
    job.description_text
  );

  // Calculate total score
  let rawScore =
    skillsResult.score +
    titleResult.score +
    experienceResult.score +
    salaryResult.score +
    locationResult.score +
    companyFitResult.score +
    resumeResult.bonus +      // resume text bonus (0-8 pts)
    penaltiesResult.score;    // penalties are negative

  const hasStructuredSkills =
    job.required_skills.length > 0 || job.preferred_skills.length > 0;

  if (titleAlignment.hardMismatch) {
    const mismatchCap =
      hasStructuredSkills && skillsResult.score >= Math.round(weights.skills * 0.5)
        ? 54
        : 49;
    rawScore = Math.min(rawScore, mismatchCap);
  }

  let score = Math.max(0, Math.min(100, rawScore));

  const confidence = determineConfidence(seeker, job);

  // Hard disqualifiers override everything: an unsuitable job is forced to
  // poor_fit with a capped score so it neither displays nor auto-queues,
  // no matter how strong the skill overlap is.
  const disqualifiers = checkHardDisqualifiers(seeker, job);
  let recommendation: MatchRecommendation;
  if (disqualifiers.disqualified) {
    score = Math.min(score, DISQUALIFIED_SCORE_CAP);
    recommendation = "poor_fit";
    penaltiesResult.details.reasons.push(...disqualifiers.reasons);
  } else {
    recommendation = determineRecommendation(score, confidence);
  }

  const componentScores: MatchScoreBreakdown = {
    skills: skillsResult,
    title: titleResult,
    experience: experienceResult,
    salary: salaryResult,
    location: locationResult,
    company_fit: companyFitResult,
    penalties: penaltiesResult,
  };

  // Build legacy reasons object for backward compatibility
  const reasons = {
    matched_skills: [
      ...skillsResult.details.matched_required,
      ...skillsResult.details.matched_preferred,
    ],
    missing_skills: skillsResult.details.missing_required,
    title_hits: titleResult.details.matched_titles,
    disqualifiers: disqualifiers.reasons,
  };

  return {
    score,
    confidence,
    recommendation,
    component_scores: componentScores,
    reasons,
  };
}
