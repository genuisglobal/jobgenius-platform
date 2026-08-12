import crypto from "crypto";

// ============================================================
// Svix-compatible webhook signature verification.
// Resend webhooks are delivered through Svix and carry:
//   svix-id, svix-timestamp, svix-signature
// signature header may contain multiple space-separated values, each
// formatted as "<version>,<base64-hmac-sha256(svixId.svixTimestamp.body)>".
// The signing secret is typically prefixed "whsec_" + base64.
// ============================================================

const ALLOWED_SKEW_MS = 5 * 60 * 1000;

function decodeSecret(secret: string): Buffer {
  const trimmed = secret.trim();
  const stripped = trimmed.startsWith("whsec_") ? trimmed.slice(6) : trimmed;
  // base64 first; fall back to raw bytes if that's clearly not base64.
  const looksBase64 = /^[A-Za-z0-9+/]+=*$/.test(stripped);
  return looksBase64 ? Buffer.from(stripped, "base64") : Buffer.from(stripped, "utf8");
}

function timingSafeEqualBase64(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "base64");
  const bufB = Buffer.from(b, "base64");
  if (bufA.length !== bufB.length) return false;
  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export interface SvixVerificationInput {
  rawBody: string;
  headers: Headers;
  secret: string;
}

export type SvixVerificationResult =
  | { valid: true }
  | { valid: false; reason: string };

export function verifySvixSignature(
  input: SvixVerificationInput
): SvixVerificationResult {
  const svixId = input.headers.get("svix-id");
  const svixTimestamp = input.headers.get("svix-timestamp");
  const svixSignature = input.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return { valid: false, reason: "missing_svix_headers" };
  }

  const tsSeconds = Number(svixTimestamp);
  if (!Number.isFinite(tsSeconds)) {
    return { valid: false, reason: "invalid_timestamp" };
  }
  const driftMs = Math.abs(Date.now() - tsSeconds * 1000);
  if (driftMs > ALLOWED_SKEW_MS) {
    return { valid: false, reason: "timestamp_outside_window" };
  }

  const signedPayload = `${svixId}.${svixTimestamp}.${input.rawBody}`;
  const secretKey = decodeSecret(input.secret);
  const expected = crypto
    .createHmac("sha256", secretKey)
    .update(signedPayload)
    .digest("base64");

  // Header looks like "v1,base64sig v1,base64sig2" — accept any match.
  const candidates = svixSignature
    .split(" ")
    .map((entry) => entry.split(",")[1])
    .filter((sig): sig is string => Boolean(sig));

  for (const candidate of candidates) {
    if (timingSafeEqualBase64(candidate, expected)) {
      return { valid: true };
    }
  }

  return { valid: false, reason: "no_signature_match" };
}
