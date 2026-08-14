/**
 * Shared Resume Parsing
 *
 * Extracts text from PDF/DOCX/DOC/TXT buffers and structures it into
 * a profile shape (name, email, phone, skills, work_history, education).
 *
 * Used by both the authenticated upload route (/api/portal/resume/upload)
 * and the anonymous signup-time parse route (/api/auth/parse-resume).
 */

import { getOpenAIClient, isOpenAIConfigured, OPENAI_MODEL } from "@/lib/openai";

export type ParsedResume = {
  full_name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin_url?: string;
  bio?: string;
  skills?: string[];
  work_history?: Array<{
    title: string;
    company: string;
    start_date: string;
    end_date: string;
    current: boolean;
    description: string;
  }>;
  education?: Array<{
    degree: string;
    school: string;
    field: string;
    graduation_year: string;
  }>;
};

export const ALLOWED_RESUME_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
];

export const ALLOWED_RESUME_EXTENSIONS = ["pdf", "docx", "doc", "txt"];

export function getResumeExtension(file: File): string {
  return (file.name.split(".").pop() || "").toLowerCase();
}

export function isAllowedResumeFile(file: File): boolean {
  const ext = getResumeExtension(file);
  return (
    ALLOWED_RESUME_MIME_TYPES.includes(file.type) ||
    ALLOWED_RESUME_EXTENSIONS.includes(ext)
  );
}

/**
 * Strip null bytes, C0 control chars (keeping tab/newline/cr),
 * lone surrogates, and replacement characters that PostgreSQL JSONB rejects.
 */
export function sanitizeText(text: string): string {
  return text
    .replace(/\0/g, "")
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[\uD800-\uDFFF]/g, "")
    .replace(/�/g, "");
}

/**
 * Extract raw text from a resume buffer. Returns "" on failure.
 */
export async function extractResumeText(buffer: Buffer, ext: string): Promise<string> {
  let raw = "";
  if (ext === "txt") {
    raw = new TextDecoder().decode(buffer);
  } else if (ext === "pdf") {
    raw = await extractPdfText(buffer);
  } else if (ext === "docx" || ext === "doc") {
    raw = await extractDocxText(buffer);
  }
  return raw ? sanitizeText(raw) : "";
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = (await import("pdf-parse")
      .then((m) => (m as { default?: unknown }).default || m)
      .catch((err) => {
        console.error("[resume-parser] pdf-parse import failed:", err);
        return null;
      })) as ((buf: Buffer) => Promise<{ text: string }>) | null;
    if (pdfParse) {
      const data = await pdfParse(buffer);
      return data.text || "";
    }
  } catch (e) {
    console.error("[resume-parser] pdf-parse failed:", e);
  }

  // Fallback: extract text between PDF text objects
  try {
    const text = buffer.toString("utf-8");
    const matches: string[] = [];
    const regex = /\(([^)]+)\)/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const decoded = match[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "")
        .replace(/\\\\/g, "\\")
        .replace(/\\([()])/g, "$1");
      if (decoded.length > 2 && /[a-zA-Z]/.test(decoded)) {
        matches.push(decoded);
      }
    }
    return matches.join(" ").slice(0, 50000);
  } catch (err) {
    console.error("[resume-parser] PDF fallback failed:", err);
    return "";
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  try {
    const mammoth = (await import("mammoth").catch((err) => {
      console.error("[resume-parser] mammoth import failed:", err);
      return null;
    })) as { extractRawText?: (opts: { buffer: Buffer }) => Promise<{ value: string }> } | null;
    if (mammoth?.extractRawText) {
      const result = await mammoth.extractRawText({ buffer });
      return result.value || "";
    }
  } catch (e) {
    console.error("[resume-parser] mammoth failed:", e);
  }

  // Fallback: strip XML from word/document.xml inside the .docx zip
  try {
    const JSZip = await import("jszip")
      .then((m) => m.default || m)
      .catch((err) => {
        console.error("[resume-parser] jszip import failed:", err);
        return null;
      });
    if (JSZip) {
      const zip = await JSZip.loadAsync(buffer);
      const docXml = await zip.file("word/document.xml")?.async("string");
      if (docXml) {
        return docXml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 50000);
      }
    }
  } catch (err) {
    console.error("[resume-parser] DOCX fallback failed:", err);
  }

  return "";
}

/**
 * Parse resume text using OpenAI. Returns null if unavailable.
 */
export async function parseResumeWithAI(text: string): Promise<ParsedResume | null> {
  if (!isOpenAIConfigured()) return null;

  try {
    const client = getOpenAIClient();
    const truncated = text.slice(0, 15000);

    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a resume parser. Extract structured data from the resume text provided. Return a JSON object with these fields (use null for missing data):
- full_name: string
- email: string
- phone: string
- location: string (City, State format)
- linkedin_url: string
- bio: string (1-2 sentence professional summary)
- skills: string[] (list of technical and professional skills)
- work_history: array of { title: string, company: string, start_date: string, end_date: string, current: boolean, description: string }
- education: array of { degree: string, school: string, field: string, graduation_year: string }`,
        },
        { role: "user", content: truncated },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as Record<string, unknown>;
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value !== null && value !== undefined) cleaned[key] = value;
    }
    return Object.keys(cleaned).length > 0 ? (cleaned as ParsedResume) : null;
  } catch (err) {
    console.error("[resume-parser] OpenAI parsing failed:", err);
    return null;
  }
}

/**
 * Regex-based fallback parser. Always returns something even if OpenAI is unavailable.
 */
export function parseResumeText(text: string): ParsedResume {
  const result: ParsedResume = {};
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) result.email = emailMatch[0];

  const phoneMatch = text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  if (phoneMatch) result.phone = phoneMatch[0].replace(/[^\d+]/g, "");

  if (lines.length > 0 && lines[0].length < 60 && !/[@.:]/.test(lines[0])) {
    result.full_name = lines[0];
  }

  const linkedinMatch = text.match(/linkedin\.com\/in\/[a-zA-Z0-9_-]+/i);
  if (linkedinMatch) result.linkedin_url = `https://www.${linkedinMatch[0]}`;

  const skills: string[] = [];
  const skillPatterns = [
    /(?:skills|technical skills|core competencies|technologies|proficient in|expertise)\s*:?\s*([^\n]+)/i,
    /(?:programming languages|frameworks|tools)\s*:?\s*([^\n]+)/i,
  ];
  for (const pattern of skillPatterns) {
    const match = text.match(pattern);
    if (match) {
      const extracted = match[1]
        .split(/[,;|•·]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 1 && s.length < 40);
      skills.push(...extracted);
    }
  }
  if (skills.length > 0) result.skills = Array.from(new Set(skills)).slice(0, 50);

  const topLines = lines.slice(0, 10).join(" ");
  const locationMatch = topLines.match(/([A-Z][a-zA-Z\s]+),\s*([A-Z]{2})\b/);
  if (locationMatch) result.location = `${locationMatch[1].trim()}, ${locationMatch[2]}`;

  return result;
}

/**
 * Full pipeline: buffer → text → AI-parsed profile (with regex fallback).
 */
export async function parseResumeBuffer(
  buffer: Buffer,
  ext: string
): Promise<{ rawText: string; parsed: ParsedResume }> {
  const rawText = await extractResumeText(buffer, ext);
  if (!rawText) return { rawText: "", parsed: {} };

  const aiParsed = await parseResumeWithAI(rawText);
  return {
    rawText,
    parsed: aiParsed ?? parseResumeText(rawText),
  };
}
