import { NextResponse } from "next/server";
import {
  parseResumeBuffer,
  isAllowedResumeFile,
  getResumeExtension,
} from "@/lib/resume-parser";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * Shared anonymous resume-parse handler used by both auth-legacy and public endpoints.
 */
export async function handleAnonymousResumeParse(request: Request) {
  const rateLimit = await enforceRateLimit({
    request,
    scope: "auth_parse_resume",
    identifier: "ip",
    limit: 5,
    windowSeconds: 60,
    blockSeconds: 120,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Please wait a moment and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, rateLimit.retryAfterSeconds)) },
      }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  if (!isAllowedResumeFile(file)) {
    return NextResponse.json(
      { error: "Only PDF, DOCX, DOC, and TXT files are allowed." },
      { status: 400 }
    );
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be under 5MB." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = getResumeExtension(file) || "pdf";
  const { rawText, parsed } = await parseResumeBuffer(buffer, ext);

  if (!rawText && Object.keys(parsed).length === 0) {
    return NextResponse.json(
      { error: "Could not read any text from this file. Please try a different format." },
      { status: 422 }
    );
  }

  return NextResponse.json({
    parsed,
    raw_text: rawText.slice(0, 50000),
  });
}
