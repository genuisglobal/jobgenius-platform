/**
 * Resume Text Extraction
 *
 * Extracts structured signals from free-text resume content:
 * - Skills mentioned in resume but not in profile
 * - Years of experience from work history narrative
 * - Technologies from project descriptions
 * - Seniority signals from job titles held
 */

const TECH_KEYWORDS: Record<string, string[]> = {
  // Languages
  javascript: ['javascript', 'js', 'ecmascript'],
  typescript: ['typescript', 'ts'],
  python: ['python'],
  java: ['java ', 'java,', 'java.'],
  'c++': ['c++', 'cpp'],
  'c#': ['c#', 'csharp', '.net'],
  go: ['golang', ' go ', 'go,'],
  rust: ['rust'],
  ruby: ['ruby'],
  php: ['php'],
  swift: ['swift'],
  kotlin: ['kotlin'],
  scala: ['scala'],
  r: [' r ', 'r,', 'rstudio'],

  // Frameworks
  react: ['react', 'reactjs'],
  vue: ['vue', 'vuejs'],
  angular: ['angular'],
  svelte: ['svelte'],
  'next.js': ['next.js', 'nextjs'],
  'node.js': ['node.js', 'nodejs', 'node'],
  django: ['django'],
  flask: ['flask'],
  fastapi: ['fastapi'],
  spring: ['spring boot', 'spring framework'],
  rails: ['rails', 'ruby on rails'],
  laravel: ['laravel'],
  express: ['express.js', 'expressjs'],

  // Databases
  postgresql: ['postgresql', 'postgres', 'psql'],
  mysql: ['mysql'],
  mongodb: ['mongodb', 'mongo'],
  redis: ['redis'],
  elasticsearch: ['elasticsearch', 'elastic search'],
  dynamodb: ['dynamodb'],
  cassandra: ['cassandra'],

  // Cloud & DevOps
  aws: ['aws', 'amazon web services', 'ec2', 's3', 'lambda'],
  gcp: ['gcp', 'google cloud'],
  azure: ['azure'],
  docker: ['docker'],
  kubernetes: ['kubernetes', 'k8s'],
  terraform: ['terraform'],
  'ci/cd': ['ci/cd', 'cicd', 'jenkins', 'github actions', 'gitlab ci'],

  // Data & ML
  'machine learning': ['machine learning', 'ml model', 'ml pipeline'],
  'deep learning': ['deep learning', 'neural network'],
  tensorflow: ['tensorflow'],
  pytorch: ['pytorch', 'torch'],
  pandas: ['pandas'],
  spark: ['apache spark', 'pyspark', 'spark'],

  // Architecture
  microservices: ['microservices', 'micro-services'],
  graphql: ['graphql'],
  rest: ['rest api', 'restful'],
  kafka: ['kafka'],
  rabbitmq: ['rabbitmq'],

  // Practices
  agile: ['agile', 'scrum', 'kanban', 'sprint'],
  tdd: ['tdd', 'test-driven', 'test driven'],
};

// Seniority signals from past job titles
const SENIORITY_TITLE_PATTERNS: Array<{ pattern: RegExp; level: string; yearsWeight: number }> = [
  { pattern: /\b(?:cto|ceo|vp|vice president|chief)\b/i, level: 'executive', yearsWeight: 12 },
  { pattern: /\b(?:director|head of)\b/i, level: 'director', yearsWeight: 10 },
  { pattern: /\b(?:staff|principal|distinguished)\b/i, level: 'staff', yearsWeight: 8 },
  { pattern: /\bsenior\b/i, level: 'senior', yearsWeight: 5 },
  { pattern: /\blead\b/i, level: 'lead', yearsWeight: 6 },
  { pattern: /\b(?:mid[\s-]?level|intermediate)\b/i, level: 'mid', yearsWeight: 3 },
  { pattern: /\b(?:junior|associate|entry)\b/i, level: 'junior', yearsWeight: 1 },
  { pattern: /\bintern\b/i, level: 'intern', yearsWeight: 0 },
];

// Year detection patterns for work experience
const YEAR_PATTERNS = [
  // "2018 - 2023" or "2018 – present"
  /(\d{4})\s*[-–—]\s*(\d{4}|present|current|now)/gi,
  // "Jan 2018 - Mar 2023"
  /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{4})\s*[-–—]\s*(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+)?(\d{4}|present|current|now)/gi,
  // "3 years at Company" or "5+ years"
  /(\d+)\+?\s*years?\s+(?:at|of|experience|with)/gi,
];

export interface ResumeSignals {
  /** Skills found in resume text not already in profile */
  additionalSkills: string[];
  /** All skills found in resume (including profile ones) */
  allResumeSkills: string[];
  /** Estimated total years of experience from date ranges */
  estimatedYears: number | null;
  /** Highest seniority level detected from past titles */
  peakSeniority: string | null;
  /** Technologies grouped by density (most mentioned first) */
  topTechnologies: Array<{ skill: string; mentions: number }>;
  /** Whether resume mentions leadership/management */
  hasLeadershipSignals: boolean;
  /** Number of distinct roles/positions detected */
  distinctRoles: number;
}

/**
 * Extract structured signals from resume free text.
 */
export function extractResumeSignals(
  resumeText: string,
  existingSkills: string[] = []
): ResumeSignals {
  if (!resumeText || resumeText.trim().length < 50) {
    return {
      additionalSkills: [],
      allResumeSkills: [],
      estimatedYears: null,
      peakSeniority: null,
      topTechnologies: [],
      hasLeadershipSignals: false,
      distinctRoles: 0,
    };
  }

  const lower = resumeText.toLowerCase();
  const existingSet = new Set(existingSkills.map((s) => s.toLowerCase()));

  // 1. Extract skills
  const skillMentions: Record<string, number> = {};
  for (const [skill, keywords] of Object.entries(TECH_KEYWORDS)) {
    let count = 0;
    for (const kw of keywords) {
      const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = lower.match(regex);
      if (matches) count += matches.length;
    }
    if (count > 0) {
      skillMentions[skill] = count;
    }
  }

  const allResumeSkills = Object.keys(skillMentions);
  const additionalSkills = allResumeSkills.filter((s) => !existingSet.has(s));

  const topTechnologies = Object.entries(skillMentions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([skill, mentions]) => ({ skill, mentions }));

  // 2. Estimate years of experience
  let estimatedYears: number | null = null;
  const currentYear = new Date().getFullYear();
  const dateRanges: Array<{ start: number; end: number }> = [];

  // Find "YYYY - YYYY" patterns
  const yearRangeRegex = /(\d{4})\s*[-–—]\s*(\d{4}|present|current|now)/gi;
  let match;
  while ((match = yearRangeRegex.exec(resumeText)) !== null) {
    const start = parseInt(match[1], 10);
    const endStr = match[2].toLowerCase();
    const end = endStr === 'present' || endStr === 'current' || endStr === 'now'
      ? currentYear
      : parseInt(match[2], 10);

    if (start >= 1980 && start <= currentYear && end >= start && end <= currentYear + 1) {
      dateRanges.push({ start, end });
    }
  }

  if (dateRanges.length > 0) {
    // Calculate total non-overlapping years
    dateRanges.sort((a, b) => a.start - b.start);
    let totalYears = 0;
    let lastEnd = 0;
    for (const range of dateRanges) {
      const effectiveStart = Math.max(range.start, lastEnd);
      if (range.end > effectiveStart) {
        totalYears += range.end - effectiveStart;
        lastEnd = range.end;
      }
    }
    estimatedYears = totalYears;
  }

  // 3. Detect peak seniority from past titles
  let peakSeniority: string | null = null;
  let peakWeight = -1;
  for (const { pattern, level, yearsWeight } of SENIORITY_TITLE_PATTERNS) {
    if (pattern.test(resumeText)) {
      if (yearsWeight > peakWeight) {
        peakWeight = yearsWeight;
        peakSeniority = level;
      }
    }
  }

  // 4. Leadership signals
  const leadershipPatterns = [
    /\b(?:led|managed|supervised|oversaw|directed)\s+(?:a\s+)?(?:team|group|department)/i,
    /\b(?:team lead|tech lead|engineering manager|people manager)/i,
    /\bmanag(?:ed|ing)\s+\d+\s+(?:engineers|developers|people|reports)/i,
    /\b(?:mentored|coached|hired|onboarded)\b/i,
  ];
  const hasLeadershipSignals = leadershipPatterns.some((p) => p.test(resumeText));

  // 5. Count distinct roles
  const rolePatterns = /(?:^|\n)\s*(?:senior|junior|lead|staff|principal)?\s*\w+\s+(?:engineer|developer|manager|designer|analyst|scientist|architect|consultant|director)/gim;
  const roles = resumeText.match(rolePatterns);
  const distinctRoles = roles ? new Set(roles.map((r) => r.trim().toLowerCase())).size : 0;

  return {
    additionalSkills,
    allResumeSkills,
    estimatedYears,
    peakSeniority,
    topTechnologies,
    hasLeadershipSignals,
    distinctRoles,
  };
}

/**
 * Compute a resume-based bonus score (0-8 points) that enriches the main match.
 * This adds signal from resume text that structured fields miss.
 */
export function computeResumeBonus(
  resumeText: string | null,
  seekerSkills: string[],
  jobRequiredSkills: string[],
  jobPreferredSkills: string[],
  jobDescription: string | null
): {
  bonus: number;
  details: {
    additionalSkillHits: string[];
    resumeYears: number | null;
    leadershipSignal: boolean;
  };
} {
  if (!resumeText || resumeText.trim().length < 50) {
    return { bonus: 0, details: { additionalSkillHits: [], resumeYears: null, leadershipSignal: false } };
  }

  const signals = extractResumeSignals(resumeText, seekerSkills);
  let bonus = 0;
  const additionalSkillHits: string[] = [];

  // Check if any additional resume skills match job requirements
  const allJobSkills = [...jobRequiredSkills, ...jobPreferredSkills].map((s) => s.toLowerCase());
  const descLower = (jobDescription ?? '').toLowerCase();

  for (const skill of signals.additionalSkills) {
    const skillLower = skill.toLowerCase();
    if (allJobSkills.includes(skillLower) || descLower.includes(skillLower)) {
      additionalSkillHits.push(skill);
    }
  }

  // Up to 4 points for additional skill matches from resume
  bonus += Math.min(4, additionalSkillHits.length * 1.5);

  // Up to 2 points for tech density (well-rounded engineer)
  if (signals.topTechnologies.length >= 8) bonus += 2;
  else if (signals.topTechnologies.length >= 5) bonus += 1;

  // Up to 2 points for leadership signals (if job seems senior)
  if (signals.hasLeadershipSignals) {
    const descMentionsLead = descLower.includes('lead') || descLower.includes('senior') || descLower.includes('manage');
    if (descMentionsLead) bonus += 2;
    else bonus += 0.5;
  }

  return {
    bonus: Math.min(8, Math.round(bonus * 10) / 10),
    details: {
      additionalSkillHits,
      resumeYears: signals.estimatedYears,
      leadershipSignal: signals.hasLeadershipSignals,
    },
  };
}
