import crypto from "crypto";

// ============================================================
// Per-seeker ATS account credentials (migration 105).
//
// Workday requires an account per (seeker, tenant host) before an
// application can be submitted. The cloud runner requests credentials
// from POST /api/apply/ats-account; on first use we create them here —
// account email = the seeker's email (so Workday's email-verification
// codes flow through the existing /api/otp pipeline), password
// generated to satisfy Workday's complexity rules and stored
// AES-256-GCM-encrypted under ATS_ACCOUNT_ENCRYPTION_KEY. Plaintext
// exists only in the response to an authenticated caller, never at rest.
// ============================================================

export type AtsAccountStatus = "ACTIVE" | "LOGIN_FAILED" | "RESET_REQUIRED";

export type AtsAccount = {
  id: string;
  job_seeker_id: string;
  host: string;
  ats_type: string;
  account_email: string;
  password: string;
  status: AtsAccountStatus;
  created: boolean;
};

// ─── Password generation ────────────────────────────────────────────────
// Workday default policy: min 8 chars with upper, lower, digit, special.
// We generate 20 chars and guarantee one of each class. Ambiguous glyphs
// (O/0, l/1, I) are excluded — an AM may need to read one over a call.

const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const LOWER = "abcdefghjkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SPECIAL = "!@#$%^&*";
const ALL = UPPER + LOWER + DIGITS + SPECIAL;

function pickChar(pool: string): string {
  return pool[crypto.randomInt(pool.length)];
}

export function generateAtsPassword(length = 20): string {
  const size = Math.max(12, length);
  const chars = [pickChar(UPPER), pickChar(LOWER), pickChar(DIGITS), pickChar(SPECIAL)];
  while (chars.length < size) chars.push(pickChar(ALL));
  // Fisher–Yates with crypto randomness so the guaranteed classes aren't
  // always in the first four positions.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function passwordMeetsComplexity(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

// ─── Encryption (same envelope shape as the runner's storage.js) ────────

function deriveKey(rawKey: string | undefined): Buffer | null {
  if (!rawKey) return null;
  if (rawKey.startsWith("base64:")) return Buffer.from(rawKey.slice(7), "base64");
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) return Buffer.from(rawKey, "hex");
  return crypto.createHash("sha256").update(rawKey, "utf8").digest();
}

export function getAtsAccountKey(): Buffer | null {
  const key = deriveKey(process.env.ATS_ACCOUNT_ENCRYPTION_KEY);
  if (!key) return null;
  return key.length === 32 ? key : crypto.createHash("sha256").update(key).digest();
}

export function encryptPassword(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: data.toString("base64"),
  });
}

export function decryptPassword(blob: string, key: Buffer): string | null {
  try {
    const parsed = JSON.parse(blob) as { iv: string; tag: string; data: string };
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(parsed.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(parsed.data, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export function normalizeAtsHost(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname;
  } catch {
    return "";
  }
}

// ─── DB helpers (lazy supabase import — same pattern as velocity.ts) ────

export async function getOrCreateAtsAccount(
  jobSeekerId: string,
  hostInput: string,
  atsType = "WORKDAY"
): Promise<
  | { ok: true; account: AtsAccount }
  | { ok: false; status: number; error: string }
> {
  const host = normalizeAtsHost(hostInput);
  if (!host) return { ok: false, status: 400, error: "Invalid host." };

  const key = getAtsAccountKey();
  if (!key) {
    return {
      ok: false,
      status: 503,
      error: "ATS_ACCOUNT_ENCRYPTION_KEY is not configured.",
    };
  }

  const { supabaseServer } = await import("@/lib/supabase/server");

  const { data: existing } = await supabaseServer
    .from("seeker_ats_accounts")
    .select("id, job_seeker_id, host, ats_type, account_email, password_encrypted, status")
    .eq("job_seeker_id", jobSeekerId)
    .eq("host", host)
    .maybeSingle();

  if (existing) {
    const password = decryptPassword(existing.password_encrypted as string, key);
    if (!password) {
      // Key rotated or blob corrupted — surface instead of silently failing
      // a login with garbage.
      return {
        ok: false,
        status: 500,
        error: "Stored credential could not be decrypted (key mismatch?).",
      };
    }
    await supabaseServer
      .from("seeker_ats_accounts")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", existing.id);
    return {
      ok: true,
      account: {
        id: existing.id as string,
        job_seeker_id: existing.job_seeker_id as string,
        host: existing.host as string,
        ats_type: existing.ats_type as string,
        account_email: existing.account_email as string,
        password,
        status: existing.status as AtsAccountStatus,
        created: false,
      },
    };
  }

  const { data: seeker } = await supabaseServer
    .from("job_seekers")
    .select("id, email")
    .eq("id", jobSeekerId)
    .maybeSingle();
  if (!seeker?.email) {
    return { ok: false, status: 404, error: "Job seeker (or their email) not found." };
  }

  const password = generateAtsPassword();
  const nowIso = new Date().toISOString();
  const { data: created, error: insertError } = await supabaseServer
    .from("seeker_ats_accounts")
    .insert({
      job_seeker_id: jobSeekerId,
      host,
      ats_type: atsType,
      account_email: seeker.email,
      password_encrypted: encryptPassword(password, key),
      status: "ACTIVE",
      last_used_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    // Unique-violation race (two runners, same seeker+host): re-read.
    const retry = await supabaseServer
      .from("seeker_ats_accounts")
      .select("id, job_seeker_id, host, ats_type, account_email, password_encrypted, status")
      .eq("job_seeker_id", jobSeekerId)
      .eq("host", host)
      .maybeSingle();
    if (retry.data) {
      const racedPassword = decryptPassword(retry.data.password_encrypted as string, key);
      if (racedPassword) {
        return {
          ok: true,
          account: {
            id: retry.data.id as string,
            job_seeker_id: jobSeekerId,
            host,
            ats_type: retry.data.ats_type as string,
            account_email: retry.data.account_email as string,
            password: racedPassword,
            status: retry.data.status as AtsAccountStatus,
            created: false,
          },
        };
      }
    }
    return { ok: false, status: 500, error: "Failed to create ATS account." };
  }

  return {
    ok: true,
    account: {
      id: created.id as string,
      job_seeker_id: jobSeekerId,
      host,
      ats_type: atsType,
      account_email: seeker.email as string,
      password,
      status: "ACTIVE",
      created: true,
    },
  };
}

/** Runner reported the stored credentials no longer work. */
export async function markAtsAccountFailed(
  jobSeekerId: string,
  hostInput: string
): Promise<boolean> {
  const host = normalizeAtsHost(hostInput);
  if (!host) return false;
  const { supabaseServer } = await import("@/lib/supabase/server");
  const { error } = await supabaseServer
    .from("seeker_ats_accounts")
    .update({ status: "LOGIN_FAILED", updated_at: new Date().toISOString() })
    .eq("job_seeker_id", jobSeekerId)
    .eq("host", host);
  return !error;
}
