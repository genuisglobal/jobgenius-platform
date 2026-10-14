import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  normalizeRetellWebhookPayload,
  verifyRetellWebhookSignature,
} from "@/lib/voice/retell";

const KEY = "key_test_webhook";
const BODY = JSON.stringify({ event: "call_analyzed", call: { call_id: "c1" } });

function headers(value: string) {
  return new Headers({ "x-retell-signature": value });
}

describe("verifyRetellWebhookSignature", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.RETELL_WEBHOOK_SECRET = KEY;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("accepts Retell's v=<ms>,d=<hmac(body + ts)> format", () => {
    const ts = "1760450000000";
    const d = createHmac("sha256", KEY).update(BODY + ts).digest("hex");
    expect(verifyRetellWebhookSignature(BODY, headers(`v=${ts},d=${d}`), Number(ts) + 1000)).toBe(true);
  });

  it("rejects a stale timestamp (replay) even with a valid digest", () => {
    const ts = "1760450000000";
    const d = createHmac("sha256", KEY).update(BODY + ts).digest("hex");
    expect(verifyRetellWebhookSignature(BODY, headers(`v=${ts},d=${d}`), Number(ts) + 6 * 60_000)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const ts = "1760450000000";
    const d = createHmac("sha256", KEY).update(BODY + ts).digest("hex");
    expect(verifyRetellWebhookSignature(BODY + " ", headers(`v=${ts},d=${d}`), Number(ts))).toBe(false);
  });

  it("fails closed with no secret configured", () => {
    delete process.env.RETELL_WEBHOOK_SECRET;
    delete process.env.RETELL_API_KEY;
    expect(verifyRetellWebhookSignature(BODY, headers("v=1,d=abc"))).toBe(false);
  });
});

describe("normalizeRetellWebhookPayload", () => {
  it("reads Emi's custom analysis fields from call_analyzed", () => {
    const n = normalizeRetellWebhookPayload({
      event: "call_analyzed",
      call: {
        call_id: "c1",
        call_status: "ended",
        disconnection_reason: "user_hangup",
        call_analysis: {
          call_summary: "Qualified GRC lead.",
          in_voicemail: false,
          custom_analysis_data: { call_outcome: "qualified_conversation", years_experience: 6 },
        },
      },
    });
    expect(n.status).toBe("completed");
    expect(n.analyzed).toBe(true);
    expect(n.customAnalysis.call_outcome).toBe("qualified_conversation");
    expect(n.summary).toBe("Qualified GRC lead.");
  });

  it("maps unanswered and voicemail calls from disconnection_reason", () => {
    const noAnswer = normalizeRetellWebhookPayload({
      event: "call_ended",
      call: { call_id: "c2", call_status: "not_connected", disconnection_reason: "dial_no_answer" },
    });
    expect(noAnswer.status).toBe("no_answer");
    expect(noAnswer.analyzed).toBe(false);

    const voicemail = normalizeRetellWebhookPayload({
      event: "call_ended",
      call: { call_id: "c3", call_status: "ended", disconnection_reason: "voicemail_reached" },
    });
    expect(voicemail.status).toBe("voicemail");

    const failed = normalizeRetellWebhookPayload({
      event: "call_ended",
      call: { call_id: "c4", call_status: "error", disconnection_reason: "invalid_destination" },
    });
    expect(failed.status).toBe("failed");
  });
});
