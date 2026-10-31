export type PayslipNoticeKind = "issued" | "paid";
export type PayslipNotice = { id: string; category: string; status: string; sent_at: string | null; error: string | null; created_at: string };

export const categoryForPayslipNotice = (kind: PayslipNoticeKind) => kind === "issued" ? "payslip_awaiting_sign" : "payslip_paid";

export function payslipNoticeState(notice: PayslipNotice | null): "not_queued" | "queued" | "sent" | "failed" {
  if (!notice) return "not_queued";
  if (notice.sent_at) return "sent";
  if (notice.status === "pending") return "queued";
  return "failed";
}
