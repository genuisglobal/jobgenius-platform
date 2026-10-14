import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { writeOutcomeEvent } from "@/lib/outcomes-server";
import { resolveLeadOutcomeSourceChannel } from "@/lib/outcomes";
import { normalizePhone } from "@/lib/voice/service";
import { startLeadQualificationCall } from "@/lib/voice/lead-call";
import { isValidTimeZone } from "@/lib/voice/calling-window";
import { CALL_CONSENT_TEXT, CALL_CONSENT_VERSION } from "@/lib/voice/consent";
import {
  ALLOWED_RESUME_MIME_TYPES,
  getResumeExtension,
  isAllowedResumeFile,
  parseResumeBuffer,
  type ParsedResume,
} from "@/lib/resume-parser";

type MarketingLeadPayload = {
  full_name?: string;
  email?: string;
  phone?: string;
  location?: string;
  target_roles?: string[] | string;
  notes?: string;
  consent_voice?: boolean | string;
  consent_marketing?: boolean | string;
  source?: string;
  offer_code?: string;
  linkedin_url?: string;
  timezone?: string;
  resume_raw_text?: string;
  resume_parsed?: ParsedResume | string;
};

type ResumeUploadMetadata = {
  bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  signed_url: string | null;
};

type ParsedSubmission = {
  fullName: string | null;
  email: string | null;
  phone: string;
  location: string | null;
  targetRoles: string[];
  notes: string | null;
  consentVoice: boolean;
  consentMarketing: boolean;
  source: string | null;
  offerCode: string | null;
  linkedinUrl: string | null;
  resumeRawText: string | null;
  resumeParsed: ParsedResume | null;
  resumeFile: File | null;
  timezone: string | null;
};

const RESUME_BUCKET = "resumes";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
}

function parseTargetRoles(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[;,]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function parseResumePayload(value: unknown): ParsedResume | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as ParsedResume;
      return Object.keys(parsed ?? {}).length > 0 ? parsed : null;
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const parsed = value as ParsedResume;
    return Object.keys(parsed).length > 0 ? parsed : null;
  }
  return null;
}

function compactRecord(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => {
      if (value === null || value === undefined) return false;
      if (typeof value === "string") return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === "object") return Object.keys(value).length > 0;
      return true;
    })
  );
}

function sanitizeFileName(name: string) {
  const ext = name.includes(".") ? `.${name.split(".").pop()}` : "";
  const stem = name.replace(/\.[^.]+$/, "");
  const safeStem = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${safeStem || "resume"}${ext.toLowerCase()}`;
}

async function ensureResumeBucket() {
  const { data: buckets } = await supabaseServer.storage.listBuckets();
  const bucketExists = buckets?.some((bucket) => bucket.id === RESUME_BUCKET);
  if (!bucketExists) {
    await supabaseServer.storage.createBucket(RESUME_BUCKET, {
      public: false,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: ALLOWED_RESUME_MIME_TYPES,
    });
  }
}

async function uploadLeadResume(file: File): Promise<ResumeUploadMetadata> {
  if (!isAllowedResumeFile(file)) {
    throw new Error("Only PDF, DOCX, DOC, and TXT files are allowed.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("File must be under 5MB.");
  }

  await ensureResumeBucket();

  const ext = getResumeExtension(file) || "pdf";
  const safeName = sanitizeFileName(file.name);
  const storagePath = `leads/${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";

  const { error: uploadError } = await supabaseServer.storage
    .from(RESUME_BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Failed to upload resume: ${uploadError.message}`);
  }

  const { data: signedUrlData } = await supabaseServer.storage
    .from(RESUME_BUCKET)
    .createSignedUrl(storagePath, 365 * 24 * 60 * 60);

  return {
    bucket: RESUME_BUCKET,
    storage_path: storagePath,
    file_name: file.name,
    mime_type: contentType,
    size_bytes: file.size,
    signed_url: signedUrlData?.signedUrl ?? null,
  };
}

async function parseRequest(request: Request): Promise<ParsedSubmission> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const resumeCandidate = formData.get("resume");
    const resumeFile = resumeCandidate instanceof File && resumeCandidate.size > 0
      ? resumeCandidate
      : null;

    return {
      fullName: toText(formData.get("full_name")),
      email: toText(formData.get("email"))?.toLowerCase() ?? null,
      phone: normalizePhone(toText(formData.get("phone"))),
      location: toText(formData.get("location")),
      targetRoles: parseTargetRoles(formData.get("target_roles")),
      notes: toText(formData.get("notes")),
      consentVoice: parseBoolean(formData.get("consent_voice")),
      consentMarketing: parseBoolean(formData.get("consent_marketing")),
      source: toText(formData.get("source")),
      offerCode: toText(formData.get("offer_code")),
      linkedinUrl: toText(formData.get("linkedin_url")),
      resumeRawText: toText(formData.get("resume_raw_text")),
      resumeParsed: parseResumePayload(formData.get("resume_parsed")),
      resumeFile,
      timezone: toText(formData.get("timezone")),
    };
  }

  const payload = (await request.json()) as MarketingLeadPayload;
  return {
    fullName: toText(payload.full_name),
    email: toText(payload.email)?.toLowerCase() ?? null,
    phone: normalizePhone(payload.phone),
    location: toText(payload.location),
    targetRoles: parseTargetRoles(payload.target_roles),
    notes: toText(payload.notes),
    consentVoice: parseBoolean(payload.consent_voice),
    consentMarketing: parseBoolean(payload.consent_marketing),
    source: toText(payload.source),
    offerCode: toText(payload.offer_code),
    linkedinUrl: toText(payload.linkedin_url),
    resumeRawText: toText(payload.resume_raw_text),
    resumeParsed: parseResumePayload(payload.resume_parsed),
    resumeFile: null,
    timezone: toText(payload.timezone),
  };
}

async function findExistingLead(email: string | null, phone: string | null) {
  if (email) {
    const { data: byEmail } = await supabaseServer
      .from("lead_intake_submissions")
      .select("id")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (byEmail?.id) return byEmail.id as string;
  }

  if (phone) {
    const { data: byPhone } = await supabaseServer
      .from("lead_intake_submissions")
      .select("id")
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();
    if (byPhone?.id) return byPhone.id as string;
  }

  return null;
}

export async function POST(request: Request) {
  let parsedRequest: ParsedSubmission;
  try {
    parsedRequest = await parseRequest(request);
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  let {
    fullName,
    email,
    phone,
    location,
    targetRoles,
    notes,
    consentVoice,
    consentMarketing,
    source,
    offerCode,
    linkedinUrl,
    resumeRawText,
    resumeParsed,
    resumeFile,
    timezone,
  } = parsedRequest;
  const leadTimezone = isValidTimeZone(timezone) ? timezone : null;

  let uploadedResume: ResumeUploadMetadata | null = null;

  try {
    if (resumeFile) {
      uploadedResume = await uploadLeadResume(resumeFile);

      if (!resumeRawText || !resumeParsed) {
        const buffer = Buffer.from(await resumeFile.arrayBuffer());
        const ext = getResumeExtension(resumeFile) || "pdf";
        const parsedResume = await parseResumeBuffer(buffer, ext);
        resumeRawText = resumeRawText ?? (parsedResume.rawText || null);
        resumeParsed = resumeParsed ?? (Object.keys(parsedResume.parsed).length > 0 ? parsedResume.parsed : null);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to process resume.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  fullName = fullName ?? resumeParsed?.full_name ?? null;
  email = email ?? resumeParsed?.email?.trim().toLowerCase() ?? null;
  phone = phone || normalizePhone(resumeParsed?.phone);
  location = location ?? resumeParsed?.location ?? null;
  linkedinUrl = linkedinUrl ?? resumeParsed?.linkedin_url ?? null;

  if (!fullName) {
    return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  }

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }

  if (!phone) {
    return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
  }

  if (!consentVoice) {
    return NextResponse.json(
      { error: "Voice consent is required before we can schedule qualification calls." },
      { status: 400 }
    );
  }

  const metadata = compactRecord({
    submitted_via: "marketing_form",
    source: source ?? "website",
    intake_variant: "jobseeker_light_signup",
    source_route: "/api/marketing/lead",
    offer_code: offerCode,
    linkedin_url: linkedinUrl,
    resume: uploadedResume,
    resume_text: resumeRawText ? resumeRawText.slice(0, 50000) : null,
    parsed_resume: resumeParsed,
    // Proof of prior express written consent for automated calls.
    call_consent: {
      version: CALL_CONSENT_VERSION,
      text: CALL_CONSENT_TEXT,
      agreed_at: new Date().toISOString(),
      source_route: "/api/marketing/lead",
    },
  });

  const nowIso = new Date().toISOString();
  const existingLeadId = await findExistingLead(email, phone);
  let leadId = existingLeadId;

  if (existingLeadId) {
    await supabaseServer
      .from("lead_intake_submissions")
      .update({
        full_name: fullName,
        email,
        phone,
        location: location ?? undefined,
        target_roles: targetRoles,
        notes: notes ?? undefined,
        consent_voice: true,
        consent_marketing: consentMarketing,
        metadata,
        status: "new",
        timezone: leadTimezone ?? undefined,
        next_call_due_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", existingLeadId);
  } else {
    const { data: lead, error: leadError } = await supabaseServer
      .from("lead_intake_submissions")
      .insert({
        source: "marketing_form",
        status: "new",
        full_name: fullName,
        email,
        phone,
        location,
        target_roles: targetRoles,
        notes,
        consent_voice: true,
        consent_marketing: consentMarketing,
        metadata,
        timezone: leadTimezone,
        next_call_due_at: nowIso,
      })
      .select("id")
      .single();

    if (leadError || !lead?.id) {
      return NextResponse.json({ error: "Failed to submit lead." }, { status: 500 });
    }
    leadId = lead.id as string;
  }

  if (!leadId) {
    return NextResponse.json({ error: "Lead submission could not be created." }, { status: 500 });
  }

  const leadSourceChannel = resolveLeadOutcomeSourceChannel({
    submissionSource: source,
    metadata,
  });

  // Emi calls straight away (inside the lead's calling hours, else at the next window).
  const started = await startLeadQualificationCall({
    leadId,
    phone,
    fullName,
    dispatchSource: String(metadata.submitted_via ?? "marketing_form"),
  });
  const voiceCallId = started.voiceCallId;
  const playbook = started.playbookId ? { id: started.playbookId } : null;

  const shadowWrites = [
    writeOutcomeEvent({
      eventType: "lead_captured",
      occurredAt: nowIso,
      leadSubmissionId: leadId,
      sourceChannel: leadSourceChannel,
      sourceRecordType: "lead_submission",
      sourceRecordId: leadId,
      metadata: {
        submitted_via: metadata.submitted_via ?? "marketing_form",
        source_route: metadata.source_route ?? "/api/marketing/lead",
        offer_code: offerCode,
        target_roles_count: targetRoles.length,
        has_resume: Boolean(uploadedResume || resumeRawText),
        consent_voice: true,
      },
    }),
  ];

  if (voiceCallId) {
    shadowWrites.push(
      writeOutcomeEvent({
        eventType: "qualification_call_queued",
        occurredAt: nowIso,
        leadSubmissionId: leadId,
        voiceCallId,
        sourceChannel: "voice_automation",
        sourceRecordType: "voice_call",
        sourceRecordId: voiceCallId,
        metadata: {
          call_type: "lead_qualification",
          dispatch_source: metadata.submitted_via ?? "marketing_form",
          playbook_id: playbook?.id ?? null,
        },
      })
    );
  }

  const shadowResults = await Promise.allSettled(shadowWrites);
  shadowResults.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error("[outcomes] marketing lead shadow write failed", {
        leadId,
        eventIndex: index,
        error: result.reason,
      });
    }
  });

  return NextResponse.json({
    ok: true,
    lead_id: leadId,
    voice_call_id: voiceCallId,
  });
}
