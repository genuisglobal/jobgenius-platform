import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { serializeState, parseState, getStateKey, encryptState } from "@/lib/state-crypto";

const sample = {
  cookies: [{ name: "li_at", value: "secret-token", domain: ".linkedin.com" }],
  origins: [],
};

describe("state-crypto", () => {
  const original = process.env.STATE_ENCRYPTION_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.STATE_ENCRYPTION_KEY;
    else process.env.STATE_ENCRYPTION_KEY = original;
  });

  it("stores plaintext when no key is configured (unchanged behaviour)", () => {
    delete process.env.STATE_ENCRYPTION_KEY;
    const blob = serializeState(sample);
    expect(JSON.parse(blob)).toEqual(sample); // plaintext JSON
    expect(parseState(blob)).toEqual(sample);
  });

  describe("with a key", () => {
    beforeEach(() => {
      process.env.STATE_ENCRYPTION_KEY = "a-shared-secret-passphrase-for-tests";
    });

    it("encrypts at rest and round-trips", () => {
      const blob = serializeState(sample);
      const envelope = JSON.parse(blob);
      // It's an encrypted envelope, not the raw cookies.
      expect(envelope).toHaveProperty("iv");
      expect(envelope).toHaveProperty("tag");
      expect(envelope).toHaveProperty("data");
      expect(blob).not.toContain("li_at");
      expect(blob).not.toContain("secret-token");
      // And it decrypts back to the original.
      expect(parseState(blob)).toEqual(sample);
    });

    it("still reads legacy plaintext blobs", () => {
      const plaintext = JSON.stringify(sample);
      expect(parseState(plaintext)).toEqual(sample);
    });

    it("envelope matches the runner's aes-256-gcm format (v1)", () => {
      const key = getStateKey()!;
      const blob = encryptState(JSON.stringify(sample), key);
      expect(JSON.parse(blob).v).toBe(1);
    });
  });
});
