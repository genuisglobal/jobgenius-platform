import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import {
  uploadPayrollDocument,
  createPayrollDocumentSignedUrl,
} from "@/lib/payroll-storage";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  const { data: payslip } = await supabaseAdmin
    .from("payslips")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!payslip) {
    return NextResponse.json({ error: "Payslip not found." }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, WebP, and PDF files are allowed." },
      { status: 400 }
    );
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be under 10MB." }, { status: 400 });
  }

  const ext = file.name.split(".").pop() || "bin";
  const storagePath = `payslips/${id}/proof-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const ok = await uploadPayrollDocument(storagePath, buffer, file.type);
  if (!ok) {
    return NextResponse.json({ error: "Failed to upload proof." }, { status: 500 });
  }

  const { error: dbError } = await supabaseAdmin
    .from("payslips")
    .update({ proof_storage_path: storagePath })
    .eq("id", id);
  if (dbError) {
    return NextResponse.json({ error: "Failed to save proof." }, { status: 500 });
  }

  const signedUrl = await createPayrollDocumentSignedUrl(storagePath);
  return NextResponse.json({ ok: true, storagePath, signedUrl }, { status: 201 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const { data: payslip } = await supabaseAdmin
    .from("payslips")
    .select("proof_storage_path")
    .eq("id", id)
    .maybeSingle();

  if (!payslip || !payslip.proof_storage_path) {
    return NextResponse.json({ error: "No proof on file." }, { status: 404 });
  }

  const signedUrl = await createPayrollDocumentSignedUrl(payslip.proof_storage_path);
  if (!signedUrl) {
    return NextResponse.json({ error: "Failed to sign URL." }, { status: 500 });
  }
  return NextResponse.json({ signedUrl });
}
