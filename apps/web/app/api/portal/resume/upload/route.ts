import { NextResponse } from "next/server";
import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";
import { calculateProfileCompletion } from "@/lib/portal/profile-completion";
import { getOpenAIClient, isOpenAIConfigured, OPENAI_MODEL } from "@/lib/openai";

/**
 * Strip null bytes, C0 control chars (keeping tab/newline/cr),
 * lone surrogates, and replacement characters that PostgreSQL JSONB rejects.
 */
function sanitizeText(text: string): string {
  return text
    // Remove null bytes
    .replace(/\0/g, "")
    // Remove C0 control chars except \t \n \r
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    // Remove lone surrogates (invalid in JSON/JSONB)
    .replace(/[\uD800-\uDFFF]/g, "")
    // Remove replacement character
    .replace(/\uFFFD/g, "");
}

/**
 * Parse resume text using OpenAI for accurate structured extraction.
 * Returns null if OpenAI is unavailable or the call fails.
 */
async function parseResumeWithAI(text: string): Promise<Record<string, unknown> | null> {
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
        {
          role: "user",
          content: truncated,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    // Remove null-valued keys
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value !== null && value !== undefined) {
        cleaned[key] = value;
      }
    }
    return Object.keys(cleaned).length > 0 ? cleaned : null;
  } catch (err) {
    console.error("OpenAI resume parsing failed:", err);
    return null;
  }
}

export async function POST(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  // Validate file type
  const allowedTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/plain",
  ];

  // Also check extension as a fallback (some browsers send wrong MIME type)
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const allowedExts = ["pdf", "docx", "doc", "txt"];

  if (!allowedTypes.includes(file.type) && !allowedExts.includes(ext)) {
    return NextResponse.json(
      { error: "Only PDF, DOCX, DOC, and TXT files are allowed." },
      { status: 400 }
    );
  }

  // Max 5MB
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be under 5MB." }, { status: 400 });
  }

  const fileExt = ext || "pdf";
  const storagePath = `${auth.user.id}/${Date.now()}.${fileExt}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Determine correct content type
  const contentTypeMap: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    txt: "text/plain",
  };
  const contentType = contentTypeMap[fileExt] || file.type || "application/octet-stream";

  // Ensure the storage bucket exists (create if missing)
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  const bucketExists = buckets?.some((b) => b.id === "resumes");
  if (!bucketExists) {
    await supabaseAdmin.storage.createBucket("resumes", {
      public: false,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: allowedTypes,
    });
  }

  // Upload to Supabase Storage using admin client (bypasses RLS)
  const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
    .from("resumes")
    .upload(storagePath, buffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    console.error("Resume upload error:", uploadError);
    return NextResponse.json(
      { error: `Failed to upload file: ${uploadError.message}` },
      { status: 500 }
    );
  }

  // For private buckets, create a signed URL (valid for 1 year)
  const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
    .from("resumes")
    .createSignedUrl(storagePath, 365 * 24 * 60 * 60); // 1 year

  // Fall back to constructing the URL if signed URL fails
  let fileUrl: string;
  if (signedUrlData?.signedUrl) {
    fileUrl = signedUrlData.signedUrl;
  } else {
    // Construct a direct storage URL as fallback
    const { data: urlData } = supabaseAdmin.storage
      .from("resumes")
      .getPublicUrl(storagePath);
    fileUrl = urlData.publicUrl;
  }

  // Extract text from the file for resume parsing
  let rawText = "";
  if (fileExt === "txt") {
    rawText = new TextDecoder().decode(buffer);
  } else if (fileExt === "pdf") {
    rawText = await extractPdfText(buffer);
  } else if (fileExt === "docx") {
    rawText = await extractDocxText(buffer);
  }

  // Sanitize extracted text to remove null bytes and control chars
  // that PostgreSQL JSONB rejects
  if (rawText) {
    rawText = sanitizeText(rawText);
  }

  // Save document record
  const { data: doc, error: docError } = await supabaseAdmin
    .from("job_seeker_documents")
    .insert({
      job_seeker_id: auth.user.id,
      doc_type: "resume",
      file_name: file.name,
      file_url: fileUrl,
      parsed_data: rawText ? { raw_text: rawText } : null,
    })
    .select()
    .single();

  if (docError) {
    console.error("Document record error:", docError);
    return NextResponse.json(
      { error: `Failed to save document record: ${docError.message}` },
      { status: 500 }
    );
  }

  // Update resume URL (for runner access) and resume_text (for matching)
  const seekerUpdates: Record<string, unknown> = {
    resume_url: fileUrl,
  };
  if (rawText) {
    seekerUpdates.resume_text = rawText.slice(0, 50000);
  }

  const { data: updatedSeeker } = await supabaseAdmin
    .from("job_seekers")
    .update(seekerUpdates)
    .eq("id", auth.user.id)
    .select("*")
    .single();

  if (updatedSeeker) {
    const completion = calculateProfileCompletion(updatedSeeker as Record<string, unknown>);
    if (typeof completion.percentage === "number") {
      const { error: completionError } = await supabaseAdmin
        .from("job_seekers")
        .update({ profile_completion: completion.percentage })
        .eq("id", auth.user.id);

      if (completionError) {
        console.error("[portal:resume] failed to update profile_completion:", completionError);
      }
    }
  }

  // Parse resume to extract structured profile data
  // Try AI parsing first, fall back to regex parser
  let parsedProfile = null;
  if (rawText) {
    parsedProfile = await parseResumeWithAI(rawText);
    if (!parsedProfile) {
      parsedProfile = parseResumeText(rawText);
    }
  }

  return NextResponse.json({
    document: doc,
    parsed_text: rawText || null,
    parsed_profile: parsedProfile,
  }, { status: 201 });
}

/**
 * Extract text from PDF buffer using basic parsing
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // Try pdf-parse if available
    const pdfParse = await import("pdf-parse").then((m) => (m as { default?: unknown }).default || m).catch((err) => { console.error("[resume] pdf-parse import failed:", err); return null; }) as ((buf: Buffer) => Promise<{ text: string }>) | null;
    if (pdfParse) {
      const data = await pdfParse(buffer);
      return data.text || "";
    }
  } catch (e) {
    console.error("pdf-parse failed:", e);
  }

  // Fallback: basic text extraction from PDF binary
  try {
    const text = buffer.toString("utf-8");
    const matches: string[] = [];
    // Extract text between BT and ET markers (PDF text objects)
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
    console.error("[resume] PDF fallback text extraction failed:", err);
    return "";
  }
}

/**
 * Extract text from DOCX buffer
 */
async function extractDocxText(buffer: Buffer): Promise<string> {
  try {
    // DOCX files are ZIP archives containing XML
    // Try to use mammoth if available
    // Dynamic require to avoid TS module resolution error (mammoth is optional)
    const mammoth = await import("mammoth").catch((err) => { console.error("[resume] mammoth import failed:", err); return null; }) as { extractRawText?: (opts: { buffer: Buffer }) => Promise<{ value: string }> } | null;
    if (mammoth?.extractRawText) {
      const result = await mammoth.extractRawText({ buffer });
      return result.value || "";
    }
  } catch (e) {
    console.error("mammoth failed:", e);
  }

  // Fallback: basic XML text extraction from DOCX
  try {
    const JSZip = await import("jszip").then((m) => m.default || m).catch((err) => { console.error("[resume] jszip import failed:", err); return null; });
    if (JSZip) {
      const zip = await JSZip.loadAsync(buffer);
      const docXml = await zip.file("word/document.xml")?.async("string");
      if (docXml) {
        // Strip XML tags to get text content
        return docXml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 50000);
      }
    }
  } catch (err) {
    console.error("[resume] DOCX fallback text extraction failed:", err);
  }

  return "";
}

/**
 * Parse resume text to extract structured profile fields
 */
function parseResumeText(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  // Extract email
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) result.email = emailMatch[0];

  // Extract phone
  const phoneMatch = text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  if (phoneMatch) result.phone = phoneMatch[0].replace(/[^\d+]/g, "");

  // Extract name (usually first line or first non-empty line)
  if (lines.length > 0 && lines[0].length < 60 && !/[@.:]/.test(lines[0])) {
    result.full_name = lines[0];
  }

  // Extract LinkedIn URL
  const linkedinMatch = text.match(/linkedin\.com\/in\/[a-zA-Z0-9_-]+/i);
  if (linkedinMatch) result.linkedin_url = `https://www.${linkedinMatch[0]}`;

  // Extract skills from common resume patterns
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
  if (skills.length > 0) {
    result.skills = Array.from(new Set(skills)).slice(0, 50);
  }

  // Extract work history entries
  const workHistory: Array<Record<string, string | boolean>> = [];
  const workSectionRegex = /(?:experience|work history|employment|professional experience)/i;
  const dateRangeRegex = /(\w+\.?\s+\d{4})\s*[-–—to]+\s*(\w+\.?\s+\d{4}|present|current)/gi;

  let inWorkSection = false;
  let currentEntry: Record<string, string | boolean> | null = null;

  for (let i = 0; i < lines.length; i++) {
    if (workSectionRegex.test(lines[i]) && lines[i].length < 50) {
      inWorkSection = true;
      continue;
    }
    if (inWorkSection && /^(?:education|skills|certifications|projects|references|awards)/i.test(lines[i])) {
      inWorkSection = false;
      if (currentEntry) workHistory.push(currentEntry);
      break;
    }
    if (inWorkSection) {
      const dateMatch = lines[i].match(dateRangeRegex);
      if (dateMatch || (lines[i].length < 80 && /\d{4}/.test(lines[i]) && i > 0)) {
        if (currentEntry) workHistory.push(currentEntry);
        currentEntry = {
          title: "",
          company: "",
          start_date: "",
          end_date: "",
          current: false,
          description: "",
        };
        // Try to extract title and company from nearby lines
        if (i > 0 && lines[i - 1] && !dateRangeRegex.test(lines[i - 1])) {
          const parts = lines[i - 1].split(/\s+(?:at|@|-|,)\s+/i);
          if (parts.length >= 2) {
            currentEntry.title = parts[0].trim();
            currentEntry.company = parts[1].trim();
          } else {
            currentEntry.title = lines[i - 1];
          }
        }
        if (dateMatch) {
          const dates = dateMatch[0].split(/[-–—]|to/i).map((d) => d.trim());
          currentEntry.start_date = dates[0] || "";
          currentEntry.end_date = dates[1] || "";
          currentEntry.current = /present|current/i.test(currentEntry.end_date as string);
        }
      } else if (currentEntry && lines[i].length > 10) {
        currentEntry.description = ((currentEntry.description as string) + " " + lines[i]).trim();
      }
    }
  }
  if (currentEntry) workHistory.push(currentEntry);
  if (workHistory.length > 0) result.work_history = workHistory.slice(0, 10);

  // Extract education
  const education: Array<Record<string, string>> = [];
  const eduSectionRegex = /^(?:education|academic|degrees)/i;
  let inEduSection = false;

  for (let i = 0; i < lines.length; i++) {
    if (eduSectionRegex.test(lines[i]) && lines[i].length < 40) {
      inEduSection = true;
      continue;
    }
    if (inEduSection && /^(?:experience|skills|certifications|projects|work)/i.test(lines[i])) {
      inEduSection = false;
      break;
    }
    if (inEduSection && lines[i].length > 5) {
      const degreeTypes = ["PhD", "Ph.D", "Master", "M.S.", "M.A.", "MBA", "Bachelor", "B.S.", "B.A.", "B.Sc", "Associate", "Diploma", "Certificate"];
      const hasDegree = degreeTypes.some((d) => lines[i].toLowerCase().includes(d.toLowerCase()));
      const yearMatch = lines[i].match(/\b(19|20)\d{2}\b/);

      if (hasDegree || yearMatch) {
        const entry: Record<string, string> = {
          degree: "",
          school: "",
          field: "",
          graduation_year: yearMatch ? yearMatch[0] : "",
        };

        // Try to parse degree and school
        const degreeMatch = degreeTypes.find((d) => lines[i].toLowerCase().includes(d.toLowerCase()));
        if (degreeMatch) {
          entry.degree = degreeMatch;
          // School is often on the same line or next line
          const afterDegree = lines[i].split(/[-–,]/).filter((p) => !degreeTypes.some((d) => p.toLowerCase().includes(d.toLowerCase())));
          if (afterDegree.length > 0) {
            entry.school = afterDegree[0].trim().replace(/\d{4}/g, "").trim();
          }
        }
        if (!entry.school && i + 1 < lines.length && lines[i + 1].length < 60) {
          entry.school = lines[i + 1].replace(/\d{4}/g, "").trim();
        }

        // Field of study
        const fieldMatch = lines[i].match(/(?:in|of)\s+([A-Za-z\s]+?)(?:\s*[-–,]|\s*\d{4}|$)/i);
        if (fieldMatch) entry.field = fieldMatch[1].trim();

        education.push(entry);
      }
    }
  }
  if (education.length > 0) result.education = education.slice(0, 5);

  // Extract location (look near the top of the resume)
  const topLines = lines.slice(0, 10).join(" ");
  const locationMatch = topLines.match(/([A-Z][a-zA-Z\s]+),\s*([A-Z]{2})\b/);
  if (locationMatch) {
    result.location = `${locationMatch[1].trim()}, ${locationMatch[2]}`;
  }

  return result;
}
