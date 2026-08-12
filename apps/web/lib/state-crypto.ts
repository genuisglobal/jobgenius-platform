import crypto from "crypto";

// ============================================================
// At-rest encryption for runner storage state (ATS session cookies).
//
// Mirrors apps/runner/src/storage.js exactly (aes-256-gcm, STATE_ENCRYPTION_KEY)
// so the cloud runner can decrypt what the web encrypts and vice-versa. When
// STATE_ENCRYPTION_KEY is unset the helpers are no-ops (plaintext), keeping
// behaviour unchanged until the key is configured on both web and runner.
// ============================================================

function deriveKey(rawKey: string | undefined): Buffer | null {
  if (!rawKey) return null;
  if (rawKey.startsWith("base64:")) return Buffer.from(rawKey.slice(7), "base64");
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) return Buffer.from(rawKey, "hex");
  return crypto.createHash("sha256").update(rawKey, "utf8").digest();
}

export function getStateKey(): Buffer | null {
  const key = deriveKey(process.env.STATE_ENCRYPTION_KEY);
  if (!key) return null;
  if (key.length !== 32) return crypto.createHash("sha256").update(key).digest();
  return key;
}

export function encryptState(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  });
}

function isEncryptedEnvelope(value: unknown): value is { iv: string; tag: string; data: string } {
  return Boolean(
    value &&
      typeof value === "object" &&
      "iv" in value &&
      "tag" in value &&
      "data" in value
  );
}

export function decryptState(payload: string, key: Buffer): string {
  const parsed = JSON.parse(payload);
  if (!isEncryptedEnvelope(parsed)) throw new Error("Invalid encrypted payload.");
  const iv = Buffer.from(parsed.iv, "base64");
  const tag = Buffer.from(parsed.tag, "base64");
  const data = Buffer.from(parsed.data, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/**
 * Serialize state for storage — encrypted when a key is configured, plaintext
 * otherwise.
 */
export function serializeState(state: unknown): string {
  const json = JSON.stringify(state);
  const key = getStateKey();
  return key ? encryptState(json, key) : json;
}

/**
 * Parse a stored blob that may be a plaintext JSON document or an encrypted
 * envelope. Returns null on failure.
 */
export function parseState(text: string): unknown {
  try {
    const parsed = JSON.parse(text);
    const key = getStateKey();
    if (key && isEncryptedEnvelope(parsed)) {
      return JSON.parse(decryptState(text, key));
    }
    return parsed;
  } catch {
    return null;
  }
}
