/**
 * Text extraction utilities for parsing job posting data
 */

// ============================================================================
// SALARY EXTRACTION
// ============================================================================

export function extractSalaryRange(text: string): {
  min: number | null;
  max: number | null;
} {
  if (!text) return { min: null, max: null };

  const lower = text.toLowerCase();
  const numbers: number[] = [];

  // Match "$XXXk" or "$XXX,XXX" patterns
  const patterns = [
    // $150k - $200k or $150K-$200K
    /\$\s?(\d{2,3})\s?k\s*[-–—to]+\s*\$?\s?(\d{2,3})\s?k/gi,
    // $150,000 - $200,000
    /\$\s?(\d{2,3})[,\s]?(\d{3})\s*[-–—to]+\s*\$?\s?(\d{2,3})[,\s]?(\d{3})/gi,
    // $150k standalone
    /\$\s?(\d{2,3})\s?k\b/gi,
    // $150,000 standalone
    /\$\s?(\d{2,3})[,\s]?(\d{3})\b/gi,
    // 150k - 200k (without dollar sign)
    /(\d{2,3})\s?k\s*[-–—to]+\s*(\d{2,3})\s?k/gi,
  ];

  // Try range patterns first
  const rangePatternK =
    /\$\s?(\d{2,3})\s?k\s*[-–—to]+\s*\$?\s?(\d{2,3})\s?k/gi;
  let match = rangePatternK.exec(lower);
  if (match) {
    return {
      min: parseInt(match[1], 10) * 1000,
      max: parseInt(match[2], 10) * 1000,
    };
  }

  const rangePatternFull =
    /\$\s?(\d{2,3})[,\s]?(\d{3})\s*[-–—to]+\s*\$?\s?(\d{2,3})[,\s]?(\d{3})/gi;
  match = rangePatternFull.exec(lower);
  if (match) {
    return {
      min: parseInt(`${match[1]}${match[2]}`, 10),
      max: parseInt(`${match[3]}${match[4]}`, 10),
    };
  }

  // Fallback: collect all salary-like numbers
  const kRegex = /\$?\s?(\d{2,3})\s?k\b/gi;
  let kMatch = kRegex.exec(lower);
  while (kMatch) {
    numbers.push(parseInt(kMatch[1], 10) * 1000);
    kMatch = kRegex.exec(lower);
  }

  const fullRegex = /\$\s?(\d{2,3})[,\s]?(\d{3})\b/gi;
  let fullMatch = fullRegex.exec(lower);
  while (fullMatch) {
    numbers.push(parseInt(`${fullMatch[1]}${fullMatch[2]}`, 10));
    fullMatch = fullRegex.exec(lower);
  }

  if (numbers.length === 0) return { min: null, max: null };
  if (numbers.length === 1) return { min: numbers[0], max: numbers[0] };

  numbers.sort((a, b) => a - b);
  return { min: numbers[0], max: numbers[numbers.length - 1] };
}

function normalizeSalarySourceText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/Ã¢â‚¬â€œ|Ã¢â‚¬â€/g, "-")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSalaryAmount(raw: string, unit?: string | null) {
  const numeric = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (unit === "k") {
    return Math.round(numeric * 1000);
  }

  if (numeric >= 1_000) {
    return Math.round(numeric);
  }

  return null;
}

function annualizeHourlyRate(amount: number) {
  return Math.round(amount * 2080);
}

function maybeAnnualizeRate(amount: number, qualifier: string | undefined) {
  if (!qualifier) {
    return amount;
  }

  return /hour|hr/.test(qualifier) ? annualizeHourlyRate(amount) : amount;
}

export function extractSalaryRangeFromSources(
  ...texts: Array<string | null | undefined>
): {
  min: number | null;
  max: number | null;
} {
  const lower = texts
    .map(normalizeSalarySourceText)
    .filter(Boolean)
    .join("\n");
  if (!lower) {
    return { min: null, max: null };
  }

  const numbers: number[] = [];
  const rangeSeparator = "(?:-| to |–|—)";
  const currency = "(?:usd|cad|aud|eur|gbp|us\\$|ca\\$|€|£|\\$)?\\s*";

  const rangePatternK = new RegExp(
    `${currency}(\\d{2,3}(?:\\.\\d{1,2})?)\\s*(k)\\s*${rangeSeparator}\\s*${currency}(\\d{2,3}(?:\\.\\d{1,2})?)\\s*(k)(?:\\s*(/\\s*hr|/\\s*hour|per hour|hourly))?`,
    "i"
  );
  let match = rangePatternK.exec(lower);
  if (match) {
    const min = parseSalaryAmount(match[1], match[2]);
    const max = parseSalaryAmount(match[3], match[4]);
    if (min !== null && max !== null) {
      return {
        min: maybeAnnualizeRate(min, match[5]),
        max: maybeAnnualizeRate(max, match[5]),
      };
    }
  }

  const hourlyRangePattern = new RegExp(
    `${currency}(\\d{2,3}(?:\\.\\d{1,2})?)\\s*${rangeSeparator}\\s*${currency}(\\d{2,3}(?:\\.\\d{1,2})?)(?:\\s*(/\\s*hr|/\\s*hour|per hour|hourly))`,
    "i"
  );
  match = hourlyRangePattern.exec(lower);
  if (match) {
    const min = Number(match[1]);
    const max = Number(match[2]);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return {
        min: annualizeHourlyRate(min),
        max: annualizeHourlyRate(max),
      };
    }
  }

  const rangePatternFull = new RegExp(
    `${currency}(\\d{2,3}(?:,\\d{3})+|\\d{5,6})(?:\\.\\d{1,2})?\\s*${rangeSeparator}\\s*${currency}(\\d{2,3}(?:,\\d{3})+|\\d{5,6})(?:\\.\\d{1,2})?(?:\\s*(/\\s*hr|/\\s*hour|per hour|hourly))?`,
    "i"
  );
  match = rangePatternFull.exec(lower);
  if (match) {
    const min = parseSalaryAmount(match[1], null);
    const max = parseSalaryAmount(match[2], null);
    if (min !== null && max !== null) {
      return {
        min: maybeAnnualizeRate(min, match[3]),
        max: maybeAnnualizeRate(max, match[3]),
      };
    }
  }

  const boundPattern = new RegExp(
    `(?:from|starting at|up to|maximum|max|minimum|min|salary|compensation|pay range)\\s*[:\\-]?\\s*${currency}(\\d{2,3}(?:\\.\\d{1,2})?)(\\s*k)?(?:\\s*(/\\s*hr|/\\s*hour|per hour|hourly))?`,
    "i"
  );
  match = boundPattern.exec(lower);
  if (match) {
    const amount = parseSalaryAmount(match[1], match[2]?.trim() === "k" ? "k" : null);
    if (amount !== null) {
      const normalized = maybeAnnualizeRate(amount, match[3]);
      if (/up to|maximum|max/.test(match[0])) {
        return { min: null, max: normalized };
      }
      return { min: normalized, max: normalized };
    }
  }

  const kRegex = new RegExp(
    `${currency}(\\d{2,3}(?:\\.\\d{1,2})?)\\s*k(?:\\s*(/\\s*hr|/\\s*hour|per hour|hourly))?`,
    "gi"
  );
  let kMatch = kRegex.exec(lower);
  while (kMatch) {
    const parsed = parseSalaryAmount(kMatch[1], "k");
    if (parsed !== null) {
      numbers.push(maybeAnnualizeRate(parsed, kMatch[2]));
    }
    kMatch = kRegex.exec(lower);
  }

  const fullRegex = new RegExp(
    `${currency}(\\d{2,3}(?:,\\d{3})+|\\d{5,6})(?:\\.\\d{1,2})?(?:\\s*(/\\s*hr|/\\s*hour|per hour|hourly))?`,
    "gi"
  );
  let fullMatch = fullRegex.exec(lower);
  while (fullMatch) {
    const parsed = parseSalaryAmount(fullMatch[1], null);
    if (parsed !== null) {
      numbers.push(maybeAnnualizeRate(parsed, fullMatch[2]));
    }
    fullMatch = fullRegex.exec(lower);
  }

  if (numbers.length === 0) {
    return { min: null, max: null };
  }
  if (numbers.length === 1) {
    return { min: numbers[0], max: numbers[0] };
  }

  numbers.sort((a, b) => a - b);
  return { min: numbers[0], max: numbers[numbers.length - 1] };
}

// ============================================================================
// EXPERIENCE EXTRACTION
// ============================================================================

export function extractYearsExperience(text: string): {
  min: number | null;
  max: number | null;
} {
  if (!text) return { min: null, max: null };

  const lower = text.toLowerCase();

  // Patterns for experience requirements
  const patterns = [
    // "5+ years" or "5+ years of experience"
    /(\d+)\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:experience|exp)/gi,
    // "3-5 years experience"
    /(\d+)\s*[-–—to]+\s*(\d+)\s*(?:years?|yrs?)(?:\s+of)?\s+(?:experience|exp)/gi,
    // "minimum 3 years"
    /minimum\s+(\d+)\s*(?:years?|yrs?)/gi,
    // "at least 5 years"
    /at\s+least\s+(\d+)\s*(?:years?|yrs?)/gi,
  ];

  // Try range pattern first
  const rangePattern =
    /(\d+)\s*[-–—to]+\s*(\d+)\s*(?:years?|yrs?)(?:\s+of)?\s+(?:experience|exp)/gi;
  let match = rangePattern.exec(lower);
  if (match) {
    return {
      min: parseInt(match[1], 10),
      max: parseInt(match[2], 10),
    };
  }

  // Try "X+ years" pattern
  const plusPattern =
    /(\d+)\+\s*(?:years?|yrs?)(?:\s+of)?\s+(?:experience|exp)/gi;
  match = plusPattern.exec(lower);
  if (match) {
    return {
      min: parseInt(match[1], 10),
      max: null,
    };
  }

  // Try single number patterns
  const singlePatterns = [
    /(\d+)\s*(?:years?|yrs?)(?:\s+of)?\s+(?:experience|exp)/gi,
    /minimum\s+(\d+)\s*(?:years?|yrs?)/gi,
    /at\s+least\s+(\d+)\s*(?:years?|yrs?)/gi,
  ];

  for (const pattern of singlePatterns) {
    match = pattern.exec(lower);
    if (match) {
      return {
        min: parseInt(match[1], 10),
        max: null,
      };
    }
  }

  return { min: null, max: null };
}

// ============================================================================
// SENIORITY EXTRACTION
// ============================================================================

const SENIORITY_KEYWORDS: Record<string, string[]> = {
  intern: ["intern", "internship"],
  entry: ["entry level", "entry-level", "junior", "associate", "graduate"],
  mid: ["mid level", "mid-level", "intermediate"],
  senior: ["senior", "sr.", "sr "],
  lead: ["lead", "principal", "staff"],
  manager: ["manager", "management", "director", "head of", "vp ", "vice president"],
  executive: ["executive", "c-level", "cto", "ceo", "cfo", "chief"],
};

export function extractSeniorityLevel(
  title: string,
  description: string
): string | null {
  const combined = `${title} ${description}`.toLowerCase();

  // Check title first (more reliable)
  const titleLower = title.toLowerCase();

  // Priority order: check more specific levels first
  const priorityOrder = [
    "executive",
    "manager",
    "lead",
    "senior",
    "mid",
    "entry",
    "intern",
  ];

  for (const level of priorityOrder) {
    const keywords = SENIORITY_KEYWORDS[level];
    for (const keyword of keywords) {
      if (titleLower.includes(keyword)) {
        return level;
      }
    }
  }

  // Fallback: check description
  for (const level of priorityOrder) {
    const keywords = SENIORITY_KEYWORDS[level];
    for (const keyword of keywords) {
      if (combined.includes(keyword)) {
        return level;
      }
    }
  }

  return null;
}

// ============================================================================
// WORK TYPE EXTRACTION
// ============================================================================

export function extractWorkType(
  location: string | null,
  description: string
): string | null {
  const combined = `${location ?? ""} ${description}`
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ");

  // Remote indicators
  if (
    combined.includes("remote") ||
    combined.includes("work from home") ||
    combined.includes("wfh") ||
    combined.includes("anywhere")
  ) {
    // Check if it's hybrid
    if (
      combined.includes("hybrid") ||
      combined.includes("flexible") ||
      combined.includes("partially remote")
    ) {
      return "hybrid";
    }
    return "remote";
  }

  // Hybrid indicators
  if (
    combined.includes("hybrid") ||
    combined.includes("flexible location") ||
    combined.includes("2-3 days")
  ) {
    return "hybrid";
  }

  // On-site indicators
  if (
    combined.includes("on-site") ||
    combined.includes("onsite") ||
    combined.includes("in-office") ||
    combined.includes("in office")
  ) {
    return "on-site";
  }

  return null;
}

// ============================================================================
// SKILLS EXTRACTION
// ============================================================================

// Common tech skills for extraction
const COMMON_SKILLS = [
  // Languages
  "javascript",
  "typescript",
  "python",
  "java",
  "c++",
  "c#",
  "go",
  "golang",
  "rust",
  "ruby",
  "php",
  "swift",
  "kotlin",
  "scala",
  "r",
  // Frontend
  "react",
  "reactjs",
  "react.js",
  "vue",
  "vuejs",
  "vue.js",
  "angular",
  "svelte",
  "next.js",
  "nextjs",
  "nuxt",
  "html",
  "css",
  "sass",
  "tailwind",
  "bootstrap",
  // Backend
  "node",
  "nodejs",
  "node.js",
  "express",
  "fastapi",
  "django",
  "flask",
  "spring",
  "spring boot",
  ".net",
  "rails",
  "laravel",
  // Databases
  "sql",
  "postgresql",
  "postgres",
  "mysql",
  "mongodb",
  "redis",
  "elasticsearch",
  "dynamodb",
  "cassandra",
  "oracle",
  // Cloud
  "aws",
  "azure",
  "gcp",
  "google cloud",
  "heroku",
  "vercel",
  "netlify",
  "digitalocean",
  // DevOps
  "docker",
  "kubernetes",
  "k8s",
  "terraform",
  "ansible",
  "jenkins",
  "ci/cd",
  "github actions",
  "gitlab ci",
  // Data
  "machine learning",
  "ml",
  "deep learning",
  "tensorflow",
  "pytorch",
  "pandas",
  "numpy",
  "spark",
  "hadoop",
  "airflow",
  "dbt",
  // Other
  "git",
  "linux",
  "agile",
  "scrum",
  "jira",
  "rest",
  "graphql",
  "api",
  "microservices",
  "kafka",
  "rabbitmq",
];

export function extractSkills(text: string): {
  required: string[];
  preferred: string[];
} {
  if (!text) return { required: [], preferred: [] };

  const lower = text.toLowerCase();
  const required: string[] = [];
  const preferred: string[] = [];

  // Try to identify required vs preferred sections
  const requiredSectionMatch = lower.match(
    /(?:required|must have|requirements|qualifications)[:\s]*([^]*?)(?:preferred|nice to have|bonus|$)/i
  );
  const preferredSectionMatch = lower.match(
    /(?:preferred|nice to have|bonus|plus)[:\s]*([^]*?)$/i
  );

  const requiredSection = requiredSectionMatch?.[1] ?? lower;
  const preferredSection = preferredSectionMatch?.[1] ?? "";

  for (const skill of COMMON_SKILLS) {
    const skillRegex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");

    if (skillRegex.test(requiredSection)) {
      required.push(skill);
    } else if (skillRegex.test(preferredSection)) {
      preferred.push(skill);
    }
  }

  return { required, preferred };
}

// ============================================================================
// INDUSTRY EXTRACTION
// ============================================================================

const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  technology: [
    "software",
    "tech",
    "saas",
    "platform",
    "digital",
    "app",
    "startup",
  ],
  finance: [
    "fintech",
    "banking",
    "financial",
    "investment",
    "trading",
    "insurance",
  ],
  healthcare: [
    "health",
    "medical",
    "biotech",
    "pharma",
    "clinical",
    "hospital",
  ],
  ecommerce: ["ecommerce", "e-commerce", "retail", "marketplace", "shopping"],
  education: ["edtech", "education", "learning", "university", "school"],
  gaming: ["gaming", "game", "esports", "entertainment"],
  media: ["media", "news", "publishing", "content", "streaming"],
  travel: ["travel", "hospitality", "tourism", "airline", "hotel"],
  automotive: ["automotive", "car", "vehicle", "ev", "electric vehicle"],
  manufacturing: ["manufacturing", "industrial", "supply chain", "logistics"],
};

export function extractIndustry(
  company: string | null,
  description: string
): string | null {
  const combined = `${company ?? ""} ${description}`.toLowerCase();

  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (combined.includes(keyword)) {
        return industry;
      }
    }
  }

  return null;
}

// ============================================================================
// COMPANY SIZE EXTRACTION
// ============================================================================

export function extractCompanySize(description: string): string | null {
  const lower = description.toLowerCase();

  // Look for explicit size mentions
  if (
    lower.includes("startup") ||
    lower.includes("early stage") ||
    lower.includes("seed") ||
    lower.includes("series a")
  ) {
    return "startup";
  }

  if (
    lower.includes("fortune 500") ||
    lower.includes("enterprise") ||
    lower.includes("global company") ||
    lower.includes("multinational")
  ) {
    return "enterprise";
  }

  // Look for employee count patterns
  const countMatch = lower.match(/(\d+)(?:,\d+)?\s*(?:\+\s*)?employees/i);
  if (countMatch) {
    const count = parseInt(countMatch[1].replace(",", ""), 10);
    if (count <= 50) return "startup";
    if (count <= 500) return "mid-size";
    return "enterprise";
  }

  return null;
}

// ============================================================================
// VISA SPONSORSHIP EXTRACTION
// ============================================================================

export function extractVisaSponsorship(description: string): boolean | null {
  const lower = description.toLowerCase();

  // Positive indicators
  if (
    lower.includes("visa sponsorship available") ||
    lower.includes("will sponsor") ||
    lower.includes("sponsorship provided")
  ) {
    return true;
  }

  // Negative indicators
  if (
    lower.includes("no visa sponsorship") ||
    lower.includes("cannot sponsor") ||
    lower.includes("must be authorized") ||
    lower.includes("must be eligible to work") ||
    lower.includes("u.s. citizen") ||
    lower.includes("security clearance")
  ) {
    return false;
  }

  return null;
}

// ============================================================================
// EMPLOYMENT TYPE EXTRACTION
// ============================================================================

export function extractEmploymentType(
  title: string,
  description: string
): string | null {
  const combined = `${title} ${description}`.toLowerCase();

  if (combined.includes("contract") || combined.includes("contractor")) {
    return "contract";
  }

  if (combined.includes("part-time") || combined.includes("part time")) {
    return "part-time";
  }

  if (combined.includes("internship") || combined.includes("intern")) {
    return "internship";
  }

  if (combined.includes("full-time") || combined.includes("full time")) {
    return "full-time";
  }

  // Default assumption for most jobs
  return "full-time";
}

// ============================================================================
// FULL PARSING FUNCTION
// ============================================================================

export interface ParsedJobData {
  salary_min: number | null;
  salary_max: number | null;
  seniority_level: string | null;
  work_type: string | null;
  years_experience_min: number | null;
  years_experience_max: number | null;
  required_skills: string[];
  preferred_skills: string[];
  industry: string | null;
  company_size: string | null;
  offers_visa_sponsorship: boolean | null;
  employment_type: string | null;
}

export function parseJobPost(
  title: string,
  company: string | null,
  location: string | null,
  description: string | null,
  salaryText?: string | null
): ParsedJobData {
  const desc = description ?? "";

  const salary = extractSalaryRangeFromSources(salaryText, desc);
  const experience = extractYearsExperience(desc);
  const skills = extractSkills(desc);

  return {
    salary_min: salary.min,
    salary_max: salary.max,
    seniority_level: extractSeniorityLevel(title, desc),
    work_type: extractWorkType(location, desc),
    years_experience_min: experience.min,
    years_experience_max: experience.max,
    required_skills: skills.required,
    preferred_skills: skills.preferred,
    industry: extractIndustry(company, desc),
    company_size: extractCompanySize(desc),
    offers_visa_sponsorship: extractVisaSponsorship(desc),
    employment_type: extractEmploymentType(title, desc),
  };
}
