/**
 * Smart JD parser.
 *
 * The legacy `parseJobPost` (extractors.ts) is pure regex + a hardcoded ~130-entry
 * tech-only skill list, so non-tech roles extract zero skills and the match/tailor
 * pipeline that reads job_posts.required_skills/preferred_skills is starved of data.
 *
 * `parseJobPostSmart` keeps the regex parse as a free base + guaranteed fallback,
 * then layers an OpenAI pass that extracts role-appropriate skills for ANY domain
 * plus responsibilities and screening questions. The merge is a pure function
 * (`mergeJdParse`) so it can be unit-tested without the network.
 *
 * Cost note: callers persist the result onto job_posts (gated by parsed_at), so the
 * LLM runs once per job, never per match.
 */

import { getOpenAIClient, isOpenAIConfigured, OPENAI_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { parseJobPost, type ParsedJobData } from "./extractors";

const log = createLogger("jd-parser");

// JD parsing benefits from a stronger model than the default mini. Override with
// JD_PARSER_MODEL (e.g. gpt-4o) without touching the rest of the app.
const JD_MODEL = process.env.JD_PARSER_MODEL || OPENAI_MODEL;

export interface ScreeningQuestion {
  question: string;
  type: "boolean" | "select" | "text";
  options?: string[];
}

export interface ParsedJobDataSmart extends ParsedJobData {
  responsibilities: string[] | null;
  screening_questions: ScreeningQuestion[] | null;
  parse_source: "regex" | "hybrid";
}

/** Shape the LLM is asked to return. Every field is optional/nullable — we only
 *  trust what it gives us and always fall back to the regex base. */
interface LlmJobData {
  required_skills?: unknown;
  preferred_skills?: unknown;
  seniority_level?: unknown;
  work_type?: unknown;
  salary_min?: unknown;
  salary_max?: unknown;
  years_experience_min?: unknown;
  years_experience_max?: unknown;
  industry?: unknown;
  company_size?: unknown;
  offers_visa_sponsorship?: unknown;
  employment_type?: unknown;
  responsibilities?: unknown;
  screening_questions?: unknown;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0);
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function toBooleanOrNull(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["yes", "true", "available", "offered"].includes(v)) return true;
    if (["no", "false", "not offered", "none"].includes(v)) return false;
  }
  return null;
}

/** Union two skill lists, case-insensitively de-duped, preserving the primary order. */
function unionSkills(primary: string[], secondary: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const skill of [...primary, ...secondary]) {
    const key = skill.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(skill);
  }
  return out;
}

function normalizeScreeningQuestions(value: unknown): ScreeningQuestion[] | null {
  if (!Array.isArray(value)) return null;
  const out: ScreeningQuestion[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const q = raw as Record<string, unknown>;
    const question = toStringOrNull(q.question);
    if (!question) continue;
    const rawType = toStringOrNull(q.type)?.toLowerCase();
    const type: ScreeningQuestion["type"] =
      rawType === "boolean" || rawType === "select" || rawType === "text"
        ? rawType
        : "text";
    const options = toStringArray(q.options);
    out.push(options.length ? { question, type, options } : { question, type });
  }
  return out.length ? out : null;
}

/**
 * Pure merge of the deterministic regex parse and the LLM parse. Exported so the
 * merge policy is unit-testable without any network call.
 *
 * - Skills: LLM authoritative when non-empty, unioned with the regex hits so an
 *   on-list tech term is never lost; regex-only when the LLM returned nothing.
 * - Numeric fields (salary, years): keep the precise regex value, fall back to LLM.
 * - Categorical fields: prefer LLM (it handles any domain), fall back to regex.
 * - responsibilities / screening_questions: LLM-only.
 */
export function mergeJdParse(
  base: ParsedJobData,
  llm: LlmJobData | null
): ParsedJobDataSmart {
  if (!llm) {
    return {
      ...base,
      responsibilities: null,
      screening_questions: null,
      parse_source: "regex",
    };
  }

  const llmRequired = toStringArray(llm.required_skills);
  const llmPreferred = toStringArray(llm.preferred_skills);

  return {
    // Numeric — regex is precise; only fill gaps from the LLM.
    salary_min: base.salary_min ?? toNumberOrNull(llm.salary_min),
    salary_max: base.salary_max ?? toNumberOrNull(llm.salary_max),
    years_experience_min:
      base.years_experience_min ?? toNumberOrNull(llm.years_experience_min),
    years_experience_max:
      base.years_experience_max ?? toNumberOrNull(llm.years_experience_max),

    // Categorical — prefer the LLM (domain-aware), fall back to regex.
    seniority_level: toStringOrNull(llm.seniority_level) ?? base.seniority_level,
    work_type: toStringOrNull(llm.work_type) ?? base.work_type,
    industry: toStringOrNull(llm.industry) ?? base.industry,
    company_size: toStringOrNull(llm.company_size) ?? base.company_size,
    offers_visa_sponsorship:
      toBooleanOrNull(llm.offers_visa_sponsorship) ?? base.offers_visa_sponsorship,
    employment_type: toStringOrNull(llm.employment_type) ?? base.employment_type,

    // Skills — the core win. LLM leads, unioned with regex; regex-only if LLM empty.
    required_skills: llmRequired.length
      ? unionSkills(llmRequired, base.required_skills)
      : base.required_skills,
    preferred_skills: llmPreferred.length
      ? unionSkills(llmPreferred, base.preferred_skills)
      : base.preferred_skills,

    // LLM-only enrichments.
    responsibilities: (() => {
      const r = toStringArray(llm.responsibilities);
      return r.length ? r : null;
    })(),
    screening_questions: normalizeScreeningQuestions(llm.screening_questions),

    parse_source: "hybrid",
  };
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function buildPrompt(
  title: string,
  company: string | null,
  location: string | null,
  description: string
): string {
  return `You are parsing a job posting into structured data. The role can be in ANY profession — tech, healthcare, finance, legal, sales, trades, operations, design, etc. Extract role-appropriate skills and requirements; do not assume software. Never invent requirements the posting does not state. Mirror the posting's own terminology.

Job title: ${title}
${company ? `Company: ${company}` : ""}
${location ? `Location: ${location}` : ""}

Job description:
${truncate(description, 6000)}

Return a JSON object with these fields (use null / [] when the posting does not state something):
- "required_skills": string[]  — must-have skills/tools/competencies for this role
- "preferred_skills": string[]  — nice-to-have / bonus skills
- "responsibilities": string[]  — key duties (short phrases)
- "seniority_level": one of "intern","entry","mid","senior","lead","manager","executive" or null
- "work_type": one of "remote","hybrid","on-site" or null
- "employment_type": one of "full-time","part-time","contract","internship" or null
- "salary_min": number|null   (annual USD)
- "salary_max": number|null   (annual USD)
- "years_experience_min": number|null
- "years_experience_max": number|null
- "industry": string|null
- "company_size": one of "startup","mid-size","enterprise" or null
- "offers_visa_sponsorship": true|false|null
- "screening_questions": array of { "question": string, "type": "boolean"|"select"|"text", "options"?: string[] } — the application-form questions this posting would likely ask (e.g. work authorization, sponsorship, years of experience, relevant certifications). Empty array if none are implied.`;
}

/**
 * Parse a job posting into structured data. Always returns a usable result:
 * the regex parse is the base + fallback, and the LLM pass only enriches it.
 */
export async function parseJobPostSmart(
  title: string,
  company: string | null,
  location: string | null,
  description: string | null,
  salaryText?: string | null
): Promise<ParsedJobDataSmart> {
  const base = parseJobPost(title, company, location, description, salaryText);

  const llmDisabled = process.env.JD_PARSER_LLM_ENABLED === "false";
  if (llmDisabled || !isOpenAIConfigured() || !description || !description.trim()) {
    return mergeJdParse(base, null);
  }

  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: JD_MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "user", content: buildPrompt(title, company, location, description) },
      ],
    });
    const content = response.choices[0]?.message?.content;
    if (!content) return mergeJdParse(base, null);
    const parsed = JSON.parse(content) as LlmJobData;
    return mergeJdParse(base, parsed);
  } catch (err) {
    log.warn("LLM JD parse failed; falling back to regex", {
      error: err instanceof Error ? err.message : String(err),
    });
    return mergeJdParse(base, null);
  }
}
