import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";

type LeadResumeMetadata = {
  bucket?: unknown;
  storage_path?: unknown;
  file_name?: unknown;
  mime_type?: unknown;
  signed_url?: unknown;
};

function getResumeMetadata(value: unknown): {
  bucket: string | null;
  storagePath: string | null;
  fileName: string;
  mimeType: string;
  signedUrl: string | null;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const data = value as LeadResumeMetadata;
  const bucket = typeof data.bucket === "string" && data.bucket.trim() ? data.bucket.trim() : null;
  const storagePath =
    typeof data.storage_path === "string" && data.storage_path.trim()
      ? data.storage_path.trim()
      : null;
  const fileName =
    typeof data.file_name === "string" && data.file_name.trim()
      ? data.file_name.trim()
      : "resume";
  const mimeType =
    typeof data.mime_type === "string" && data.mime_type.trim()
      ? data.mime_type.trim()
      : "application/octet-stream";
  const signedUrl =
    typeof data.signed_url === "string" && data.signed_url.trim()
      ? data.signed_url.trim()
      : null;

  if (!bucket && !signedUrl) {
    return null;
  }

  return { bucket, storagePath, fileName, mimeType, signedUrl };
}

function buildDownloadFileName(fileName: string) {
  return fileName.replace(/[\r\n"]/g, "_");
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const leadId = params.id;
  if (!leadId) {
    return NextResponse.json({ error: "Lead id is required." }, { status: 400 });
  }

  const { data: lead, error } = await supabaseAdmin
    .from("lead_intake_submissions")
    .select("metadata")
    .eq("id", leadId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Could not load lead." }, { status: 500 });
  }

  const metadata =
    lead?.metadata && typeof lead.metadata === "object" && !Array.isArray(lead.metadata)
      ? (lead.metadata as Record<string, unknown>)
      : null;
  const resume = getResumeMetadata(metadata?.resume);

  if (!resume) {
    return NextResponse.json({ error: "No resume found for this lead." }, { status: 404 });
  }

  if (resume.bucket && resume.storagePath) {
    const { data: file, error: downloadError } = await supabaseAdmin.storage
      .from(resume.bucket)
      .download(resume.storagePath);

    if (!downloadError && file) {
      const body = await file.arrayBuffer();
      return new NextResponse(body, {
        headers: {
          "Content-Type": resume.mimeType,
          "Content-Disposition": `attachment; filename="${buildDownloadFileName(
            resume.fileName
          )}"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
  }

  if (resume.signedUrl) {
    return NextResponse.redirect(resume.signedUrl);
  }

  return NextResponse.json({ error: "Resume file is not available." }, { status: 404 });
}
