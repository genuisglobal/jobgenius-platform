import { supabaseAdmin } from "@/lib/auth";
import { PAYROLL_BUCKET } from "@/lib/payroll";

// ============================================================
// Staff Payroll — server-only storage helpers (payroll-documents).
// Service-role client; do NOT import from client components.
// ============================================================

export async function uploadPayrollDocument(
  storagePath: string,
  body: Buffer | Uint8Array | Blob,
  contentType: string
): Promise<boolean> {
  const { error } = await supabaseAdmin.storage
    .from(PAYROLL_BUCKET)
    .upload(storagePath, body, { contentType, upsert: true });
  return !error;
}

export async function createPayrollDocumentSignedUrl(
  storagePath: string,
  expiresInSeconds: number = 7 * 24 * 60 * 60
): Promise<string | null> {
  const { data } = await supabaseAdmin.storage
    .from(PAYROLL_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  return data?.signedUrl ?? null;
}
