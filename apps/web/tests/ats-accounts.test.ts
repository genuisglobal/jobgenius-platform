import { describe, it, expect } from "vitest";
import {
  generateAtsPassword,
  passwordMeetsComplexity,
  encryptPassword,
  decryptPassword,
  getAtsAccountKey,
  normalizeAtsHost,
} from "@/lib/apply/ats-accounts";
import crypto from "crypto";

describe("generateAtsPassword", () => {
  it("meets Workday complexity on every draw", () => {
    for (let i = 0; i < 50; i += 1) {
      const password = generateAtsPassword();
      expect(password).toHaveLength(20);
      expect(passwordMeetsComplexity(password)).toBe(true);
    }
  });

  it("never emits ambiguous glyphs (O/0/l/1/I)", () => {
    for (let i = 0; i < 20; i += 1) {
      expect(generateAtsPassword()).not.toMatch(/[O0l1I]/);
    }
  });

  it("enforces a minimum length", () => {
    expect(generateAtsPassword(4).length).toBeGreaterThanOrEqual(12);
  });
});

describe("encryptPassword / decryptPassword", () => {
  const key = crypto.createHash("sha256").update("test-key").digest();

  it("round-trips", () => {
    const blob = encryptPassword("S3cret!Passw0rd$", key);
    expect(decryptPassword(blob, key)).toBe("S3cret!Passw0rd$");
  });

  it("produces a fresh IV per encryption (no blob reuse)", () => {
    expect(encryptPassword("same", key)).not.toBe(encryptPassword("same", key));
  });

  it("returns null (not garbage) on wrong key or tampered blob", () => {
    const otherKey = crypto.createHash("sha256").update("other").digest();
    const blob = encryptPassword("secret", key);
    expect(decryptPassword(blob, otherKey)).toBeNull();
    expect(decryptPassword(blob.slice(0, -8) + '"AAAA"}', key)).toBeNull();
    expect(decryptPassword("not-json", key)).toBeNull();
  });
});

describe("getAtsAccountKey", () => {
  it("derives a 32-byte key from any passphrase form", () => {
    const original = process.env.ATS_ACCOUNT_ENCRYPTION_KEY;
    try {
      process.env.ATS_ACCOUNT_ENCRYPTION_KEY = "some passphrase";
      expect(getAtsAccountKey()?.length).toBe(32);
      process.env.ATS_ACCOUNT_ENCRYPTION_KEY = "base64:" + Buffer.alloc(32, 7).toString("base64");
      expect(getAtsAccountKey()?.length).toBe(32);
      delete process.env.ATS_ACCOUNT_ENCRYPTION_KEY;
      expect(getAtsAccountKey()).toBeNull();
    } finally {
      if (original === undefined) delete process.env.ATS_ACCOUNT_ENCRYPTION_KEY;
      else process.env.ATS_ACCOUNT_ENCRYPTION_KEY = original;
    }
  });
});

describe("normalizeAtsHost", () => {
  it("normalizes URLs and bare hosts to a lowercase hostname", () => {
    expect(normalizeAtsHost("https://Acme.wd5.MyWorkdayJobs.com/careers/job/1")).toBe(
      "acme.wd5.myworkdayjobs.com"
    );
    expect(normalizeAtsHost("acme.wd5.myworkdayjobs.com")).toBe(
      "acme.wd5.myworkdayjobs.com"
    );
    expect(normalizeAtsHost("")).toBe("");
    expect(normalizeAtsHost("::::")).toBe("");
  });
});
