import { getOpenAIClient, OPENAI_MODEL } from "./openai";
import type { StructuredResume } from "./resume-templates/types";
import { scoreResumeSkillCoverage, type SkillCoverage } from "./resume-score";
import { lintTailoredResume, type ResumeSafetyResult } from "./resume-safety";

// Resume tailoring benefits from a stronger model than the default mini.
// Override with RESUME_TAILOR_MODEL (e.g. gpt-4o) without touching matching.
const RESUME_MODEL = process.env.RESUME_TAILOR_MODEL || OPENAI_MODEL;

export interface TailorCoverage {
  before: SkillCoverage;
  after: SkillCoverage;
}

interface TailorResumeInput {
  resumeText: string;
  jobTitle: string;
  company: string | null;
  jobDescription: string | null;
  requiredSkills: string[] | null;
  preferredSkills: string[] | null;
}

interface TailorResumeResult {
  tailoredText: string;
  changesSummary: string;
}

export interface TailorResumeStructuredInput {
  baseResume: StructuredResume;
  jobTitle: string;
  company: string | null;
  jobDescription: string | null;
  requiredSkills: string[] | null;
  preferredSkills: string[] | null;
  excludedFields?: ResumeFieldKey[] | null;
}

export interface TailorResumeStructuredResult {
  tailoredData: StructuredResume;
  tailoredText: string;
  changesSummary: string;
  /** Before/after skill coverage. Present for job-targeted tailoring. */
  coverage?: TailorCoverage;
  /** Deterministic safety check (fabrication, identity, stuffing, length). */
  safety?: ResumeSafetyResult;
}

export interface OptimizeBaseResumeStructuredInput {
  baseResume: StructuredResume;
  targetTitles: string[] | null;
  seniority: string | null;
  preferredIndustries: string[] | null;
  keySkills: string[] | null;
  excludedFields?: ResumeFieldKey[] | null;
}

export interface RefineResumeStructuredInput {
  baseResume: StructuredResume;
  guidance: string;
  excludedFields?: ResumeFieldKey[] | null;
}

export type ResumeFieldKey =
  | "summary"
  | "workExperience"
  | "education"
  | "skills"
  | "certifications"
  | "contact.phone"
  | "contact.location"
  | "contact.linkedinUrl"
  | "contact.portfolioUrl";

export const EXCLUDABLE_RESUME_FIELDS: ResumeFieldKey[] = [
  "summary",
  "workExperience",
  "education",
  "skills",
  "certifications",
  "contact.phone",
  "contact.location",
  "contact.linkedinUrl",
  "contact.portfolioUrl",
];

export interface SeekerRow {
  full_name: string | null;
  email: string;
  phone: string | null;
  linkedin_url: string | null;
  address_city: string | null;
  address_state: string | null;
  bio: string | null;
  skills: string[] | null;
  work_history: unknown;
  education: unknown;
  resume_text: string | null;
}

export async function tailorResume(input: TailorResumeInput): Promise<TailorResumeResult> {
  const openai = getOpenAIClient();

  const skillsSection = [
    input.requiredSkills?.length ? `Required skills: ${input.requiredSkills.join(", ")}` : "",
    input.preferredSkills?.length ? `Preferred skills: ${input.preferredSkills.join(", ")}` : "",
  ].filter(Boolean).join("\n");

  const jobContext = [
    `Job Title: ${input.jobTitle}`,
    input.company ? `Company: ${input.company}` : "",
    input.jobDescription ? `Job Description:\n${input.jobDescription}` : "",
    skillsSection,
  ].filter(Boolean).join("\n\n");

  const response = await openai.chat.completions.create({
    model: RESUME_MODEL,
    messages: [
      {
        role: "system",
        content: `You are a professional resume writer. Your job is to tailor a candidate's resume to better match a specific job posting. You should:
- Reorder and emphasize relevant experience and skills
- Adjust language to mirror the job posting's terminology
- Highlight transferable skills that match the job requirements
- NEVER fabricate experience, skills, or qualifications the candidate doesn't have
- NEVER remove truthful information, only adjust emphasis and ordering
- Keep the resume professional and concise

Respond with valid JSON containing two fields:
- "tailored_resume": the full tailored resume text
- "changes_summary": a brief bullet-point summary of what was changed and why (2-5 bullets)`,
      },
      {
        role: "user",
        content: `Please tailor this resume for the following job:\n\n${jobContext}\n\n---\n\nOriginal Resume:\n${input.resumeText}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  const parsed = JSON.parse(content) as { tailored_resume: string; changes_summary: string };
  return {
    tailoredText: parsed.tailored_resume,
    changesSummary: parsed.changes_summary,
  };
}

function structuredResumeToText(data: StructuredResume): string {
  const lines: string[] = [];
  const c = data.contact;
  lines.push(c.fullName);
  const contactParts = [c.email, c.phone, c.location, c.linkedinUrl, c.portfolioUrl].filter(Boolean);
  if (contactParts.length) lines.push(contactParts.join(" | "));
  lines.push("");

  if (data.summary) {
    lines.push("SUMMARY");
    lines.push(data.summary);
    lines.push("");
  }

  if (data.workExperience.length) {
    lines.push("WORK EXPERIENCE");
    for (const w of data.workExperience) {
      lines.push(`${w.title} - ${w.company}${w.location ? `, ${w.location}` : ""}`);
      lines.push(`${w.startDate} - ${w.endDate}`);
      for (const b of w.bullets) lines.push(`  - ${b}`);
      lines.push("");
    }
  }

  if (data.education.length) {
    lines.push("EDUCATION");
    for (const e of data.education) {
      lines.push(`${e.degree}${e.field ? ` in ${e.field}` : ""} - ${e.institution}`);
      lines.push(e.graduationDate);
      if (e.gpa) lines.push(`GPA: ${e.gpa}`);
      if (e.honors) lines.push(e.honors);
      lines.push("");
    }
  }

  if (data.skills.length) {
    lines.push("SKILLS");
    lines.push(data.skills.join(", "));
    lines.push("");
  }

  if (data.certifications.length) {
    lines.push("CERTIFICATIONS");
    for (const cert of data.certifications) {
      const parts = [cert.name, cert.issuer, cert.date].filter(Boolean);
      lines.push(parts.join(" - "));
    }
  }

  return lines.join("\n");
}

const STRUCTURED_RESUME_SCHEMA = `{
  "contact": { "fullName": string, "email": string, "phone": string|null, "location": string|null, "linkedinUrl": string|null, "portfolioUrl": string|null },
  "summary": string,
  "workExperience": [{ "title": string, "company": string, "location": string|null, "startDate": string, "endDate": string, "bullets": string[] }],
  "education": [{ "degree": string, "institution": string, "field": string|null, "graduationDate": string, "gpa": string|null, "honors": string|null }],
  "skills": string[],
  "certifications": [{ "name": string, "issuer": string|null, "date": string|null }]
}`;

function sanitizeExcludedFields(value: unknown): ResumeFieldKey[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(EXCLUDABLE_RESUME_FIELDS);
  const unique = new Set<ResumeFieldKey>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    if (allowed.has(item as ResumeFieldKey)) {
      unique.add(item as ResumeFieldKey);
    }
  }
  return Array.from(unique);
}

function ensureStructuredResumeShape(data: StructuredResume): StructuredResume {
  if (!data?.contact?.fullName || !data?.contact?.email) {
    throw new Error("Invalid structured resume returned by AI: missing contact fields");
  }
  if (!Array.isArray(data.workExperience)) {
    data.workExperience = [];
  }
  if (!Array.isArray(data.education)) {
    data.education = [];
  }
  if (!Array.isArray(data.skills)) {
    data.skills = [];
  }
  if (!Array.isArray(data.certifications)) {
    data.certifications = [];
  }
  if (typeof data.summary !== "string") {
    data.summary = "";
  }
  data.contact.phone = data.contact.phone || null;
  data.contact.location = data.contact.location || null;
  data.contact.linkedinUrl = data.contact.linkedinUrl || null;
  data.contact.portfolioUrl = data.contact.portfolioUrl || null;
  return data;
}

function applyExcludedFields(
  data: StructuredResume,
  excluded: ResumeFieldKey[]
): StructuredResume {
  if (excluded.length === 0) return data;
  for (const field of excluded) {
    switch (field) {
      case "summary":
        data.summary = "";
        break;
      case "workExperience":
        data.workExperience = [];
        break;
      case "education":
        data.education = [];
        break;
      case "skills":
        data.skills = [];
        break;
      case "certifications":
        data.certifications = [];
        break;
      case "contact.phone":
        data.contact.phone = null;
        break;
      case "contact.location":
        data.contact.location = null;
        break;
      case "contact.linkedinUrl":
        data.contact.linkedinUrl = null;
        break;
      case "contact.portfolioUrl":
        data.contact.portfolioUrl = null;
        break;
    }
  }
  return data;
}

export async function tailorResumeStructured(
  input: TailorResumeStructuredInput
): Promise<TailorResumeStructuredResult> {
  const openai = getOpenAIClient();
  const excludedFields = sanitizeExcludedFields(input.excludedFields);
  const excludedHint =
    excludedFields.length > 0
      ? `\nExcluded fields (must be empty/null): ${excludedFields.join(", ")}`
      : "";

  const skillsSection = [
    input.requiredSkills?.length ? `Required skills: ${input.requiredSkills.join(", ")}` : "",
    input.preferredSkills?.length ? `Preferred skills: ${input.preferredSkills.join(", ")}` : "",
  ].filter(Boolean).join("\n");

  const jobContext = [
    `Job Title: ${input.jobTitle}`,
    input.company ? `Company: ${input.company}` : "",
    input.jobDescription ? `Job Description:\n${input.jobDescription}` : "",
    skillsSection,
  ].filter(Boolean).join("\n\n");

  // Measure the starting keyword gap so the model can aim at it (truthfully)
  // and we can report a before/after coverage delta.
  const before = scoreResumeSkillCoverage({
    resumeText: structuredResumeToText(input.baseResume),
    resumeSkills: input.baseResume.skills,
    requiredSkills: input.requiredSkills,
    preferredSkills: input.preferredSkills,
  });

  const gapHint =
    before.requiredMissing.length || before.preferredMissing.length
      ? `\n\nKeyword gap to close — surface these ONLY where the candidate has genuine evidence in the base resume (real experience or a close equivalent). NEVER fabricate:\n- Missing required: ${before.requiredMissing.join(", ") || "none"}\n- Missing preferred: ${before.preferredMissing.join(", ") || "none"}\nWhere the experience is real, mirror the job's exact terminology in the summary, skills list, and relevant bullets.`
      : "";

  const response = await openai.chat.completions.create({
    model: RESUME_MODEL,
    messages: [
      {
        role: "system",
        content: `You are an expert ATS resume writer. Tailor the candidate's structured resume JSON to better match the job posting and pass automated screening.

Rules:
- Reorder and emphasize the most relevant experience and skills first
- Mirror the job posting's exact terminology and keywords (for genuine experience only)
- Lead bullets with strong action verbs; keep quantified outcomes the source supports
- Highlight transferable skills that match the job requirements
- NEVER fabricate experience, skills, certifications, or qualifications
- NEVER remove truthful information, only adjust emphasis, wording, and ordering
- No keyword stuffing — keywords must read naturally in context
- Always return all schema fields (even when empty arrays/empty string/null as appropriate)
- If excluded fields are provided, keep those fields empty/null

Respond with valid JSON containing two fields:
- "tailored_resume": a JSON object matching this schema: ${STRUCTURED_RESUME_SCHEMA}
- "changes_summary": a brief bullet-point summary of what was changed and why (2-5 bullets)`,
      },
      {
        role: "user",
        content: `Tailor this resume for the following job:\n\n${jobContext}${gapHint}\n\n---\n\nOriginal Resume (JSON):\n${JSON.stringify(input.baseResume)}${excludedHint}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  const parsed = JSON.parse(content) as {
    tailored_resume: StructuredResume;
    changes_summary: string;
  };

  const tailoredData = applyExcludedFields(
    ensureStructuredResumeShape(parsed.tailored_resume),
    excludedFields
  );

  const tailoredText = structuredResumeToText(tailoredData);
  const after = scoreResumeSkillCoverage({
    resumeText: tailoredText,
    resumeSkills: tailoredData.skills,
    requiredSkills: input.requiredSkills,
    preferredSkills: input.preferredSkills,
  });

  return {
    tailoredData,
    tailoredText,
    changesSummary: parsed.changes_summary,
    coverage: { before, after },
    safety: lintTailoredResume(input.baseResume, tailoredData),
  };
}

export async function optimizeBaseResumeStructured(
  input: OptimizeBaseResumeStructuredInput
): Promise<TailorResumeStructuredResult> {
  const openai = getOpenAIClient();
  const excludedFields = sanitizeExcludedFields(input.excludedFields);
  const excludedHint =
    excludedFields.length > 0
      ? `\nExcluded fields (must be empty/null): ${excludedFields.join(", ")}`
      : "";

  const profileContext = [
    input.targetTitles?.length
      ? `Target roles: ${input.targetTitles.join(", ")}`
      : "",
    input.seniority ? `Seniority: ${input.seniority}` : "",
    input.preferredIndustries?.length
      ? `Preferred industries: ${input.preferredIndustries.join(", ")}`
      : "",
    input.keySkills?.length
      ? `Core skills to emphasize: ${input.keySkills.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await openai.chat.completions.create({
    model: RESUME_MODEL,
    messages: [
      {
        role: "system",
        content: `You are an expert ATS resume strategist. Optimize the candidate's base structured resume so it performs well across many job applications.

Rules:
- Improve ATS readability and keyword density naturally
- Strengthen impact bullets with measurable outcomes when present in source text
- Keep claims truthful and never invent companies, roles, dates, or credentials
- Preserve candidate identity and career direction
- Keep wording concise and professional
- Always return all schema fields (even when empty arrays/empty string/null as appropriate)
- If excluded fields are provided, keep those fields empty/null

Respond with valid JSON containing:
- "tailored_resume": a JSON object matching this schema: ${STRUCTURED_RESUME_SCHEMA}
- "changes_summary": a short bullet summary (3-6 bullets) of optimization changes.`,
      },
      {
        role: "user",
        content: `Optimize this base resume for broad ATS performance.\n\nCandidate context:\n${profileContext || "No additional profile context."}${excludedHint}\n\nOriginal Resume (JSON):\n${JSON.stringify(
          input.baseResume
        )}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  const parsed = JSON.parse(content) as {
    tailored_resume: StructuredResume;
    changes_summary: string;
  };

  const tailoredData = applyExcludedFields(
    ensureStructuredResumeShape(parsed.tailored_resume),
    excludedFields
  );

  return {
    tailoredData,
    tailoredText: structuredResumeToText(tailoredData),
    changesSummary: parsed.changes_summary,
    safety: lintTailoredResume(input.baseResume, tailoredData),
  };
}

export async function refineResumeStructuredWithGuidance(
  input: RefineResumeStructuredInput
): Promise<TailorResumeStructuredResult> {
  const openai = getOpenAIClient();
  const excludedFields = sanitizeExcludedFields(input.excludedFields);
  const excludedHint =
    excludedFields.length > 0
      ? `\nExcluded fields (must be empty/null): ${excludedFields.join(", ")}`
      : "";
  const response = await openai.chat.completions.create({
    model: RESUME_MODEL,
    messages: [
      {
        role: "system",
        content: `You are an expert resume editor. Update the candidate's structured resume JSON using the admin guidance.

Rules:
- Keep all claims truthful and do not fabricate facts
- Preserve candidate identity, timeline, and role history
- Apply the guidance with concise ATS-friendly phrasing
- Keep formatting schema-valid and professional
- Always return all schema fields (even when empty arrays/empty string/null as appropriate)
- If excluded fields are provided, keep those fields empty/null

Respond with valid JSON containing:
- "tailored_resume": a JSON object matching this schema: ${STRUCTURED_RESUME_SCHEMA}
- "changes_summary": a short bullet summary (3-6 bullets) of what you changed.`,
      },
      {
        role: "user",
        content: `Guidance to apply:\n${input.guidance}${excludedHint}\n\nCurrent Resume (JSON):\n${JSON.stringify(
          input.baseResume
        )}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  const parsed = JSON.parse(content) as {
    tailored_resume: StructuredResume;
    changes_summary: string;
  };

  const tailoredData = applyExcludedFields(
    ensureStructuredResumeShape(parsed.tailored_resume),
    excludedFields
  );

  return {
    tailoredData,
    tailoredText: structuredResumeToText(tailoredData),
    changesSummary: parsed.changes_summary,
    safety: lintTailoredResume(input.baseResume, tailoredData),
  };
}

interface WorkHistoryEntry {
  title?: string;
  job_title?: string;
  company?: string;
  company_name?: string;
  location?: string;
  start_date?: string;
  startDate?: string;
  end_date?: string;
  endDate?: string;
  bullets?: string[];
  description?: string;
}

interface EducationEntry {
  degree?: string;
  institution?: string;
  school?: string;
  field?: string;
  field_of_study?: string;
  graduation_date?: string;
  graduationDate?: string;
  gpa?: string;
  honors?: string;
}

export function buildStructuredResumeFromSeeker(seeker: SeekerRow): StructuredResume {
  const locationParts = [seeker.address_city, seeker.address_state].filter(Boolean);

  const workHistory = Array.isArray(seeker.work_history)
    ? (seeker.work_history as WorkHistoryEntry[])
    : [];

  const education = Array.isArray(seeker.education)
    ? (seeker.education as EducationEntry[])
    : [];

  return {
    contact: {
      fullName: seeker.full_name || seeker.email,
      email: seeker.email,
      phone: seeker.phone || null,
      location: locationParts.length > 0 ? locationParts.join(", ") : null,
      linkedinUrl: seeker.linkedin_url || null,
      portfolioUrl: null,
    },
    summary: seeker.bio || "",
    workExperience: workHistory.map((w) => ({
      title: w.title || w.job_title || "",
      company: w.company || w.company_name || "",
      location: w.location || null,
      startDate: w.start_date || w.startDate || "",
      endDate: w.end_date || w.endDate || "Present",
      bullets: Array.isArray(w.bullets)
        ? w.bullets
        : w.description
          ? [w.description]
          : [],
    })),
    education: education.map((e) => ({
      degree: e.degree || "",
      institution: e.institution || e.school || "",
      field: e.field || e.field_of_study || null,
      graduationDate: e.graduation_date || e.graduationDate || "",
      gpa: e.gpa || null,
      honors: e.honors || null,
    })),
    skills: seeker.skills || [],
    certifications: [],
  };
}
