import {
  lookupFieldRule,
  recordFieldClassification,
  recordFieldHit,
  type FieldDescriptor,
} from "@/lib/learned-fields";
import { getOpenAIClient, isOpenAIConfigured, OPENAI_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";

// ============================================================
// Shared server-side "fill brain" used by both the browser extension
// (via POST /api/apply/classify-fields) and, indirectly, the cloud
// runner. For each unfilled field it resolves a value through one
// pipeline so every surface benefits from the same learning + LLM:
//
//   1. learned_field_rules cache  (lookupFieldRule)        source=learned
//   2. per-seeker screening answer (job_seeker_screening_answers) source=screening
//   3. LLM classification          (OpenAI, batched)        source=llm  → recorded back
//
// Screening answers are consulted BEFORE the LLM so a seeker's own
// answer always wins over a blanket default. Hardcoded EEO / work-auth
// fallbacks only apply when the seeker has not configured an answer.
// ============================================================

const log = createLogger("field-resolver");

export interface ScreeningAnswer {
  question_key: string;
  answer_value: string;
  answer_type?: string | null;
}

export interface ResolveFieldsInput {
  atsType: string | null | undefined;
  urlHost: string | null | undefined;
  fields: FieldDescriptor[];
  profile: Record<string, unknown> | null | undefined;
  screeningAnswers: ScreeningAnswer[] | null | undefined;
  job?: { title?: string | null; company?: string | null; description?: string | null } | null;
  amId?: string | null;
}

export type ResolvedFieldSource = "learned" | "screening" | "default" | "llm";

export interface ScreeningMatch {
  value: string;
  /** "screening" = the seeker's configured answer; "default" = a deterministic fallback. */
  source: "screening" | "default";
}

export interface ResolvedField {
  label: string;
  value: string;
  source: ResolvedFieldSource;
  confidence: number;
}

export interface ResolveFieldsResult {
  /** One entry per field we could answer. */
  resolved: ResolvedField[];
  /** Convenience { label -> value } map for the caller to apply. */
  map: Record<string, string>;
  /** Labels we could not answer from any source. */
  unresolved: string[];
}

// ─── Screening-answer matching (ported + hardened from the cloud classifier) ───

const QUESTION_KEY_PATTERNS: { key: string; patterns: string[] }[] = [
  { key: "work_authorization", patterns: ["authorized", "legally work", "eligible to work", "work authorization", "right to work"] },
  { key: "sponsorship", patterns: ["sponsor", "sponsorship", "visa sponsor"] },
  { key: "salary_expectations", patterns: ["salary", "compensation", "desired pay", "pay expectation", "expected salary"] },
  { key: "years_experience", patterns: ["years of experience", "years experience", "how many years"] },
  { key: "willing_to_relocate", patterns: ["relocate", "relocation", "willing to move"] },
  { key: "start_date", patterns: ["start date", "when can you start", "earliest start", "available to start"] },
  { key: "notice_period", patterns: ["notice period", "notice required", "two weeks"] },
  { key: "education_level", patterns: ["highest degree", "education level", "highest level of education", "degree"] },
  { key: "cover_letter", patterns: ["cover letter", "letter of interest", "introduction letter"] },
  { key: "gender", patterns: ["gender", "sex"] },
  { key: "race_ethnicity", patterns: ["race", "ethnicity", "ethnic background"] },
  { key: "veteran_status", patterns: ["veteran", "military service", "armed forces"] },
  { key: "disability_status", patterns: ["disability", "disabled"] },
  { key: "languages", patterns: ["language", "fluent", "proficient in"] },
  { key: "remote_preference", patterns: ["remote", "hybrid", "on-site", "work arrangement", "work location preference"] },
  { key: "how_did_you_hear", patterns: ["how did you hear", "where did you find", "referred by", "how did you find"] },
];

/**
 * Map a form field label to a canonical screening question_key, or null if the
 * label doesn't match a known question. Shared with the Mode 3 learning emitter
 * so a human's answer is stored under the same key the resolver later reads.
 */
export function deriveQuestionKey(label: string | null | undefined): string | null {
  const l = (label ?? "").toLowerCase().trim();
  if (!l) return null;
  for (const { key, patterns } of QUESTION_KEY_PATTERNS) {
    if (patterns.some((p) => l.includes(p))) return key;
  }
  return null;
}

const EEO_KEYWORDS = ["gender", "race", "ethnicity", "veteran", "disability", "demographic"];
const WORK_AUTH_PATTERNS = ["authorized", "legally work", "eligible to work", "work authorization", "right to work"];
const SPONSORSHIP_PATTERNS = ["sponsor", "sponsorship", "visa sponsor"];

function coerceAffirmative(field: FieldDescriptor, yes: boolean): string {
  if (Array.isArray(field.options) && field.options.length > 0) {
    return (
      findBestOptionMatch(field.options, yes ? "yes" : "no") ??
      findBestOptionMatch(field.options, yes ? "authorized" : "does not require") ??
      findBestOptionMatch(field.options, yes ? "i am authorized" : "will not require") ??
      (yes ? "Yes" : "No")
    );
  }
  return yes ? "Yes" : "No";
}

export function findBestOptionMatch(
  options: string[] | null | undefined,
  target: string | null | undefined
): string | null {
  if (!options?.length || !target) return null;
  const normalized = target.toLowerCase().trim();
  const exact = options.find((o) => (o ?? "").toLowerCase().trim() === normalized);
  if (exact) return exact;
  const partial = options.find((o) => (o ?? "").toLowerCase().includes(normalized));
  if (partial) return partial;
  const reverse = options.find((o) => normalized.includes((o ?? "").toLowerCase().trim()));
  return reverse ?? null;
}

function coerceToField(
  value: string,
  field: FieldDescriptor
): string | null {
  if (Array.isArray(field.options) && field.options.length > 0) {
    return findBestOptionMatch(field.options, value);
  }
  return value;
}

/**
 * Resolve a field from a seeker's configured screening answers.
 * Returns null when the seeker has no relevant answer (so the caller
 * can fall through to the LLM rather than guessing).
 */
export function matchScreeningAnswer(
  field: FieldDescriptor,
  screeningAnswers: ScreeningAnswer[]
): ScreeningMatch | null {
  const label = (field.label ?? "").toLowerCase();
  if (!label) return null;

  // The seeker's own configured answer always wins → source "screening".
  for (const answer of screeningAnswers) {
    if (!answer?.question_key || !answer?.answer_value) continue;
    const mapping = QUESTION_KEY_PATTERNS.find((m) => m.key === answer.question_key);
    if (!mapping) continue;
    if (mapping.patterns.some((p) => label.includes(p))) {
      const coerced = coerceToField(answer.answer_value, field);
      if (coerced) return { value: coerced, source: "screening" };
    }
  }

  // Deterministic safe defaults when the seeker has not configured an answer →
  // source "default" (so callers/UIs don't mislabel these as the seeker's choice).
  if (WORK_AUTH_PATTERNS.some((p) => label.includes(p))) {
    return { value: coerceAffirmative(field, true), source: "default" };
  }
  if (SPONSORSHIP_PATTERNS.some((p) => label.includes(p))) {
    return { value: coerceAffirmative(field, false), source: "default" };
  }

  // EEO / demographic fields with no seeker-provided answer → decline.
  if (EEO_KEYWORDS.some((kw) => label.includes(kw))) {
    if (Array.isArray(field.options) && field.options.length > 0) {
      const declined =
        findBestOptionMatch(field.options, "prefer not") ??
        findBestOptionMatch(field.options, "decline") ??
        findBestOptionMatch(field.options, "choose not");
      return declined ? { value: declined, source: "default" } : null;
    }
    return { value: "Prefer not to answer", source: "default" };
  }

  return null;
}

// ─── Learned-rule reading ───

function readRuleValue(mapping: Record<string, unknown> | null | undefined): string | null {
  if (!mapping || typeof mapping !== "object") return null;
  const value = (mapping as { value?: unknown }).value;
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

// ─── LLM classification (batched) ───

function truncate(value: unknown, max: number): string {
  const str = typeof value === "string" ? value : value == null ? "" : String(value);
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

type ClassifyJob = {
  title?: string | null;
  company?: string | null;
  description?: string | null;
};

// Aggregate the client's information into a compact dossier the LLM can use to
// answer spontaneous / case-based questions (essays, "describe a time…", "why
// this company") grounded in the applicant's real background.
function buildProfileSummary(profile: Record<string, unknown> | null | undefined): string {
  const p = profile ?? {};
  const workHistory = Array.isArray(p.work_history) ? p.work_history : [];
  return JSON.stringify({
    name: p.full_name ?? p.name ?? "",
    location: p.location ?? "",
    seniority: p.seniority ?? "",
    years_experience: p.years_experience ?? "",
    target_titles: Array.isArray(p.target_titles) ? p.target_titles.slice(0, 5) : [],
    preferred_industries: Array.isArray(p.preferred_industries)
      ? p.preferred_industries.slice(0, 5)
      : [],
    skills: Array.isArray(p.skills) ? p.skills.slice(0, 20) : [],
    education: truncate(p.education, 400),
    summary: truncate(p.bio ?? p.summary, 600),
    work_history: workHistory.slice(0, 5).map((w: Record<string, unknown>) => ({
      title: w?.title ?? "",
      company: w?.company ?? "",
      dates: [w?.start_date ?? w?.start ?? "", w?.end_date ?? w?.end ?? ""]
        .filter(Boolean)
        .join("–"),
      summary: truncate(w?.description ?? w?.summary ?? w?.responsibilities, 400),
    })),
    resume_excerpt: truncate(p.resume_text, 2000),
  });
}

function buildPrompt(
  fields: FieldDescriptor[],
  profile: Record<string, unknown> | null | undefined,
  job?: ClassifyJob | null
): string {
  const profileSummary = buildProfileSummary(profile);
  const jobLines = job
    ? [
        `Job title: ${job.title ?? ""}`,
        `Company: ${job.company ?? ""}`,
        job.description ? `Job description (excerpt): ${truncate(job.description, 1500)}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";
  const fieldDescriptions = fields
    .map((f) => {
      let desc = `- "${f.label}" (type: ${f.type ?? "text"})`;
      if (Array.isArray(f.options) && f.options.length > 0) {
        desc += ` options: [${f.options.join(", ")}]`;
      }
      return desc;
    })
    .join("\n");

  return `You are completing a job application on behalf of the applicant described below. Answer each unfilled field as the applicant would, in the first person, grounded ONLY in the applicant's real background. Never invent employers, job titles, degrees, or credentials that are not present in the applicant data.

Applicant: ${profileSummary}

${jobLines}

Fields to answer:
${fieldDescriptions}

Guidance:
- Factual fields (name, salary, years of experience, yes/no, selects): give a short, direct value. For select fields, return the exact option text from the provided options.
- Open-ended / case-based questions ("describe a time…", "why are you interested…", "tell us about…", cover letters, "in N sentences…"): write a concise, specific, professional first-person answer drawn from the applicant's work history, skills, and resume, tailored to THIS job and company. Respect any stated length limit (e.g. "2–3 sentences"). Do not fabricate specifics — if the background lacks detail, stay general but truthful.
- EEO/demographic (gender, race, veteran, disability): "Prefer not to answer" or the decline option.
- Work authorization: "Yes". Sponsorship: "No". "How did you hear about us": "Job board".
- Keep every answer plausible and submission-ready.

Return a JSON object mapping each field label to its answer. Only include fields you can answer.`;
}

// Only enumerated or short-factual fields may be cached as global learned rules.
// Free-text / essay answers are applicant- and job-specific and must never be
// shared across seekers.
function isCacheableField(field: FieldDescriptor): boolean {
  const type = (field.type ?? "").toLowerCase();
  if (type === "textarea") return false;
  if (Array.isArray(field.options) && field.options.length > 0) return true;
  const label = (field.label ?? "").toLowerCase();
  if (
    /describe|tell us|why |cover letter|in \d|sentence|explain|what makes|your experience|motivat/.test(
      label
    )
  ) {
    return false;
  }
  return true;
}

async function classifyWithLlm(
  fields: FieldDescriptor[],
  profile: Record<string, unknown> | null | undefined,
  job?: ClassifyJob | null
): Promise<Record<string, string>> {
  if (!isOpenAIConfigured() || fields.length === 0) return {};
  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: buildPrompt(fields, profile, job) }],
    });
    const content = response.choices[0]?.message?.content;
    if (!content) return {};
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [label, value] of Object.entries(parsed)) {
      if (value === null || value === undefined) continue;
      const str = typeof value === "string" ? value : String(value);
      if (str.trim()) out[label] = str;
    }
    return out;
  } catch (err) {
    log.warn("LLM classify failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}

// ─── Public resolver ───

export async function resolveFields(input: ResolveFieldsInput): Promise<ResolveFieldsResult> {
  const { atsType, urlHost, job, amId } = input;
  const fields = Array.isArray(input.fields) ? input.fields : [];
  const screeningAnswers = Array.isArray(input.screeningAnswers) ? input.screeningAnswers : [];

  const resolved: ResolvedField[] = [];
  const map: Record<string, string> = {};
  const unresolved: string[] = [];
  const needsLlm: FieldDescriptor[] = [];

  // Pass 1: learned cache, then screening answers.
  for (const field of fields) {
    if (!field?.label) continue;

    const rule = await lookupFieldRule({ atsType, urlHost, field });
    const ruleValue = rule ? readRuleValue(rule.mapping) : null;
    if (rule && ruleValue) {
      const coerced = coerceToField(ruleValue, field) ?? ruleValue;
      resolved.push({ label: field.label, value: coerced, source: "learned", confidence: rule.confidence });
      map[field.label] = coerced;
      void recordFieldHit(rule.id);
      continue;
    }

    const screening = matchScreeningAnswer(field, screeningAnswers);
    if (screening) {
      resolved.push({
        label: field.label,
        value: screening.value,
        source: screening.source,
        confidence: screening.source === "screening" ? 0.85 : 0.6,
      });
      map[field.label] = screening.value;
      continue;
    }

    needsLlm.push(field);
  }

  // Pass 2: batch LLM for whatever is left, and learn from it.
  if (needsLlm.length > 0) {
    const llmResults = await classifyWithLlm(needsLlm, input.profile, job);
    for (const field of needsLlm) {
      const raw = llmResults[field.label];
      if (!raw) {
        unresolved.push(field.label);
        continue;
      }
      const coerced = coerceToField(raw, field) ?? raw;
      resolved.push({ label: field.label, value: coerced, source: "llm", confidence: 0.6 });
      map[field.label] = coerced;

      // Cache only enumerated / short-factual answers. Free-text and essay
      // answers are applicant- and job-specific, so they are generated fresh
      // each time rather than shared across seekers via a global rule.
      if (isCacheableField(field)) {
        void recordFieldClassification({
          atsType,
          urlHost,
          field,
          mapping: { kind: "static", value: coerced },
          source: "llm",
          confidence: 0.6,
          createdBy: amId ?? null,
        });
      }
    }
  }

  return { resolved, map, unresolved };
}
