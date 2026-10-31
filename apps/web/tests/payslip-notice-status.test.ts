import { describe, expect, it } from "vitest";
import { categoryForPayslipNotice, payslipNoticeState, type PayslipNotice } from "@/lib/payslip-notice-status";

const notice = (patch: Partial<PayslipNotice>): PayslipNotice => ({ id: "n", category: "payslip_awaiting_sign", status: "pending", sent_at: null, error: null, created_at: "2026-10-31T00:00:00Z", ...patch });

describe("payslip email delivery status", () => {
  it("keeps queued, sent, and failed distinct from an in-app read", () => {
    expect(payslipNoticeState(null)).toBe("not_queued");
    expect(payslipNoticeState(notice({ status: "pending" }))).toBe("queued");
    expect(payslipNoticeState(notice({ status: "sent", sent_at: "2026-10-31T01:00:00Z" }))).toBe("sent");
    expect(payslipNoticeState(notice({ status: "failed", error: "send failed" }))).toBe("failed");
    expect(payslipNoticeState(notice({ status: "read" }))).toBe("failed");
  });

  it("uses the correct notice for each payslip transition", () => {
    expect(categoryForPayslipNotice("issued")).toBe("payslip_awaiting_sign");
    expect(categoryForPayslipNotice("paid")).toBe("payslip_paid");
  });
});
