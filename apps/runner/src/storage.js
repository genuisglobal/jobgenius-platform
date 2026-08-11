import fs from "fs";
import crypto from "crypto";

function deriveKey(rawKey) {
  if (!rawKey) {
    return null;
  }

  if (rawKey.startsWith("base64:")) {
    return Buffer.from(rawKey.slice(7), "base64");
  }

  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, "hex");
  }

  return crypto.createHash("sha256").update(rawKey, "utf8").digest();
}

export function getStateKey() {
  const rawKey = process.env.STATE_ENCRYPTION_KEY;
  const key = deriveKey(rawKey);
  if (!key) {
    return null;
  }
  if (key.length !== 32) {
    return crypto.createHash("sha256").update(key).digest();
  }
  return key;
}

function encryptString(plaintext, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  });
}

function decryptString(payload, key) {
  const parsed = JSON.parse(payload);
  if (!parsed?.iv || !parsed?.tag || !parsed?.data) {
    throw new Error("Invalid encrypted payload.");
  }
  const iv = Buffer.from(parsed.iv, "base64");
  const tag = Buffer.from(parsed.tag, "base64");
  const data = Buffer.from(parsed.data, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

// Parse a storage-state blob downloaded from the server bucket, which may be
// plaintext JSON or an encrypted envelope (when STATE_ENCRYPTION_KEY is set).
export function parseStorageStateText(text) {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    const key = getStateKey();
    if (key && parsed?.iv && parsed?.tag && parsed?.data) {
      return JSON.parse(decryptString(text, key));
    }
    return parsed;
  } catch {
    return null;
  }
}

export function readStorageState({ encryptedPath, legacyPath, key }) {
  if (key && fs.existsSync(encryptedPath)) {
    const payload = fs.readFileSync(encryptedPath, "utf8");
    const plaintext = decryptString(payload, key);
    return JSON.parse(plaintext);
  }

  if (fs.existsSync(legacyPath)) {
    const plaintext = fs.readFileSync(legacyPath, "utf8");
    return JSON.parse(plaintext);
  }

  return null;
}

export function writeStorageState({ encryptedPath, legacyPath, state, key }) {
  if (key) {
    const payload = encryptString(JSON.stringify(state), key);
    fs.writeFileSync(encryptedPath, payload, "utf8");
    return;
  }

  fs.writeFileSync(legacyPath, JSON.stringify(state), "utf8");
}
