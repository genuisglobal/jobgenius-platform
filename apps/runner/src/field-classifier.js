/**
 * LLM-powered field classifier for the cloud runner.
 *
 * When the rules-based field mapper returns no match, this module
 * sends the field label + type to a lightweight LLM call to determine
 * the best answer from profile data or screening answers.
 *
 * Set FIELD_CLASSIFIER_ENABLED=true and OPENAI_API_KEY or ANTHROPIC_API_KEY.
 */

import { logLine } from "./logger.js";

const ENABLED = ["1", "true", "yes", "on"].includes(
  String(process.env.FIELD_CLASSIFIER_ENABLED ?? "false").toLowerCase()
);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const CLASSIFIER_TIMEOUT_MS = Number(process.env.FIELD_CLASSIFIER_TIMEOUT_MS ?? 15000);

/**
 * Classify a field and return a suggested value.
 * @param {object} field - { label, type, options }
 * @param {object} profile - job seeker profile data
 * @param {object[]} screeningAnswers - pre-configured screening answers
 * @param {object} job - job details (title, company)
 * @param {object} [learnCtx] - { apiBaseUrl, authToken, claimToken, runnerId, atsType, urlHost }
 * @returns {Promise<string|null>} suggested value or null
 */
export async function classifyField(field, profile, screeningAnswers, job, learnCtx) {
  const results = await classifyFields([field], profile, screeningAnswers, job, learnCtx);
  return results[field.label] ?? null;
}

/**
 * Classify multiple missing fields at once (batch mode).
 *
 * Resolution order per field:
 *   1. learned_field_rules cache  (GET /api/apply/field-rules)  — needs learnCtx
 *   2. per-seeker screening answer (local, fast)
 *   3. LLM classification          (gated by FIELD_CLASSIFIER_ENABLED) → recorded back
 *
 * Screening answers and the learned cache work even when the LLM flag is
 * off, so the runner still benefits from prior learning without an API key.
 */
export async function classifyFields(fields, profile, screeningAnswers, job, learnCtx) {
  if (!fields?.length) return {};

  const results = {};
  const remaining = [];

  for (const field of fields) {
    // Pass 1: learned-rule cache (cross-application memory).
    const cached = await lookupLearnedRule(field, learnCtx);
    if (cached) {
      results[field.label] = coerceToOptions(field, cached);
      continue;
    }

    // Pass 2: this seeker's configured screening answer.
    const match = matchScreeningAnswer(field, screeningAnswers ?? []);
    if (match) {
      results[field.label] = match;
      continue;
    }

    remaining.push(field);
  }

  // Pass 3: batch LLM for whatever is left, then learn from it.
  if (remaining.length > 0 && ENABLED) {
    const llmResults = await callLlmClassifierBatch(remaining, profile, job);
    for (const field of remaining) {
      const value = llmResults[field.label];
      if (value === undefined || value === null || value === "") continue;
      const coerced = coerceToOptions(field, value);
      results[field.label] = coerced;
      // Record so the next application with this signature is a cache hit.
      void recordLearnedRule(field, coerced, learnCtx);
    }
  }

  return results;
}

function coerceToOptions(field, value) {
  if (field?.options?.length > 0) {
    return findBestOptionMatch(field.options, value) ?? value;
  }
  return value;
}

// ─── Screening answer matching ───

const QUESTION_KEY_PATTERNS = [
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

function matchScreeningAnswer(field, screeningAnswers) {
  const label = (field.label ?? "").toLowerCase();
  if (!label) return null;

  // Direct key match
  for (const answer of screeningAnswers) {
    if (!answer?.question_key || !answer?.answer_value) continue;
    for (const mapping of QUESTION_KEY_PATTERNS) {
      if (answer.question_key !== mapping.key) continue;
      if (mapping.patterns.some((p) => label.includes(p))) {
        // For select fields, try to match answer to options
        if (field.options?.length > 0) {
          return findBestOptionMatch(field.options, answer.answer_value);
        }
        return answer.answer_value;
      }
    }
  }

  // Deterministic safe defaults for gating questions when the seeker has not
  // configured an explicit answer. Seeker screening answers above always win.
  const workAuthPatterns = ["authorized", "legally work", "eligible to work", "work authorization", "right to work"];
  if (workAuthPatterns.some((p) => label.includes(p))) {
    return coerceAffirmative(field, true);
  }
  const sponsorshipPatterns = ["sponsor", "sponsorship", "visa sponsor"];
  if (sponsorshipPatterns.some((p) => label.includes(p))) {
    return coerceAffirmative(field, false);
  }

  // EEO / demographic fields - default to "Prefer not to answer"
  const eeoKeywords = ["gender", "race", "ethnicity", "veteran", "disability", "demographic"];
  if (eeoKeywords.some((kw) => label.includes(kw))) {
    if (field.options?.length > 0) {
      return findBestOptionMatch(field.options, "prefer not") ??
        findBestOptionMatch(field.options, "decline") ??
        findBestOptionMatch(field.options, "choose not");
    }
    return "Prefer not to answer";
  }

  return null;
}

function coerceAffirmative(field, yes) {
  if (field.options?.length > 0) {
    return (
      findBestOptionMatch(field.options, yes ? "yes" : "no") ??
      findBestOptionMatch(field.options, yes ? "authorized" : "does not require") ??
      findBestOptionMatch(field.options, yes ? "i am authorized" : "will not require") ??
      (yes ? "Yes" : "No")
    );
  }
  return yes ? "Yes" : "No";
}

function findBestOptionMatch(options, target) {
  if (!options?.length || !target) return null;
  const normalized = target.toLowerCase();
  const exact = options.find((o) => (o ?? "").toLowerCase() === normalized);
  if (exact) return exact;
  const partial = options.find((o) => (o ?? "").toLowerCase().includes(normalized));
  if (partial) return partial;
  const reverse = options.find((o) => normalized.includes((o ?? "").toLowerCase()));
  return reverse ?? null;
}

// ─── Learned-rule cache (learned_field_rules via /api/apply/field-rules) ───

function learnReady(learnCtx) {
  return Boolean(learnCtx?.apiBaseUrl && learnCtx?.urlHost);
}

function learnHeaders(learnCtx) {
  const headers = { "Content-Type": "application/json", "x-runner": "cloud" };
  if (learnCtx?.authToken) headers.Authorization = `Bearer ${learnCtx.authToken}`;
  if (learnCtx?.claimToken) headers["x-claim-token"] = learnCtx.claimToken;
  if (learnCtx?.runnerId) headers["x-runner-id"] = learnCtx.runnerId;
  return headers;
}

async function lookupLearnedRule(field, learnCtx) {
  if (!learnReady(learnCtx) || !field?.label) return null;
  try {
    const params = new URLSearchParams({
      ats: String(learnCtx.atsType ?? "UNKNOWN"),
      host: String(learnCtx.urlHost),
      label: String(field.label),
    });
    if (field.type) params.set("type", String(field.type));
    if (field.options?.length > 0) params.set("options", field.options.join(","));

    const response = await fetch(
      `${learnCtx.apiBaseUrl}/api/apply/field-rules?${params.toString()}`,
      { headers: learnHeaders(learnCtx) }
    );
    if (!response.ok) return null;
    const data = await response.json();
    const value = data?.rule?.mapping?.value;
    return typeof value === "string" && value.trim() ? value : null;
  } catch (error) {
    logLine({
      level: "WARN",
      step: "FIELD_CLASSIFIER",
      msg: `learned-rule lookup failed: ${error?.message ?? "unknown"}`,
    });
    return null;
  }
}

async function recordLearnedRule(field, value, learnCtx) {
  if (!learnReady(learnCtx) || !field?.label) return;
  try {
    await fetch(`${learnCtx.apiBaseUrl}/api/apply/field-rules`, {
      method: "POST",
      headers: learnHeaders(learnCtx),
      body: JSON.stringify({
        ats_type: learnCtx.atsType ?? "UNKNOWN",
        url_host: learnCtx.urlHost,
        field: { label: field.label, type: field.type ?? null, options: field.options ?? null },
        mapping: { kind: "static", value },
        source: "llm",
        confidence: 0.6,
      }),
    });
  } catch (error) {
    logLine({
      level: "WARN",
      step: "FIELD_CLASSIFIER",
      msg: `learned-rule record failed: ${error?.message ?? "unknown"}`,
    });
  }
}

// ─── LLM classification ───

async function callLlmClassifierBatch(fields, profile, job) {
  const prompt = buildPrompt(fields, profile, job);
  const response = await callLlm(prompt);
  if (!response) return {};

  try {
    return JSON.parse(response);
  } catch {
    return {};
  }
}

function buildPrompt(fields, profile, job) {
  const profileSummary = JSON.stringify({
    name: profile?.full_name ?? profile?.name ?? "",
    email: profile?.email ?? "",
    phone: profile?.phone ?? "",
    location: profile?.location ?? "",
    linkedin: profile?.linkedin_url ?? "",
    portfolio: profile?.portfolio_url ?? "",
    work_history: (profile?.work_history ?? []).slice(0, 3).map((w) => ({
      title: w?.title ?? "",
      company: w?.company ?? "",
    })),
    education: profile?.education ?? "",
    skills: (profile?.skills ?? []).slice(0, 10),
  });

  const jobSummary = job ? `Job: ${job.title ?? ""} at ${job.company ?? ""}` : "";

  const fieldDescriptions = fields
    .map((f) => {
      let desc = `- "${f.label}" (type: ${f.type ?? "text"})`;
      if (f.options?.length > 0) desc += ` options: [${f.options.join(", ")}]`;
      return desc;
    })
    .join("\n");

  return `You are filling out a job application form. Given the applicant profile and the following unfilled required fields, provide the best answer for each field.

Profile: ${profileSummary}
${jobSummary}

Fields to fill:
${fieldDescriptions}

Rules:
- For EEO/demographic questions (gender, race, veteran, disability), always answer "Prefer not to answer" or select the decline option.
- For work authorization, answer "Yes" (assume authorized).
- For sponsorship, answer "No" (does not require).
- For salary, give a reasonable range based on the job title, or "Negotiable".
- For years of experience, estimate from work history.
- For "How did you hear about us", answer "Job board".
- For select fields, choose the exact option text from the provided options.
- Keep answers concise and professional.

Return a JSON object mapping field labels to answers. Only include fields you can answer.`;
}

async function callLlm(prompt) {
  try {
    if (ANTHROPIC_API_KEY) {
      return await callAnthropic(prompt);
    }
    if (OPENAI_API_KEY) {
      return await callOpenAI(prompt);
    }
    return null;
  } catch (error) {
    logLine({
      level: "WARN",
      step: "FIELD_CLASSIFIER",
      msg: `LLM call failed: ${error?.message ?? "unknown"}`,
    });
    return null;
  }
}

async function callAnthropic(prompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    const data = await response.json();
    return data?.content?.[0]?.text ?? null;
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenAI(prompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1024,
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    const data = await response.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } finally {
    clearTimeout(timeout);
  }
}
