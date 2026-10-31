import { supabaseAdmin } from "@/lib/auth";
import { sendNotification, NOTIFICATION_CATEGORIES } from "@/lib/notify";
import { categoryForPayslipNotice, type PayslipNotice, type PayslipNoticeKind } from "@/lib/payslip-notice-status";

export async function loadPayslipNotices(payslipId: string): Promise<PayslipNotice[]> {
  const { data, error } = await supabaseAdmin.from("notifications")
    .select("id, category, status, sent_at, error, created_at")
    .contains("payload", { payslip_id: payslipId })
    .in("category", [NOTIFICATION_CATEGORIES.payslip_awaiting_sign, NOTIFICATION_CATEGORIES.payslip_paid])
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not load payslip notification status.");
  return (data ?? []) as PayslipNotice[];
}

export async function queuePayslipNotice(payslipId: string, kind: PayslipNoticeKind): Promise<boolean> {
  const { data: payslip } = await supabaseAdmin.from("payslips")
    .select("net_pay, currency, worker_id, pay_period_id")
    .eq("id", payslipId).maybeSingle();
  if (!payslip) return false;
  const { data: worker } = await supabaseAdmin.from("payroll_workers")
    .select("account_manager_id, full_name")
    .eq("id", payslip.worker_id).maybeSingle();
  if (!worker?.account_manager_id) return false;
  const { data: period } = await supabaseAdmin.from("pay_periods")
    .select("label").eq("id", payslip.pay_period_id).maybeSingle();
  const label = period?.label ?? "your pay period";
  const issued = kind === "issued";
  const result = await sendNotification({
    userId: worker.account_manager_id,
    userType: "am",
    category: categoryForPayslipNotice(kind),
    subject: issued ? `Your payslip for ${label} is ready to sign` : `Your payslip for ${label} has been paid`,
    body: issued
      ? `Hi ${worker.full_name ?? ""}, your payslip is available for ${label}. Sign in, review the amount and additions, then confirm receipt. Confirming receipt does not mean payment has been made.`
      : `Hi ${worker.full_name ?? ""}, your payslip has been marked paid.`,
    linkUrl: "/dashboard/me/payslips",
    channel: "both",
    payload: { payslip_id: payslipId, net_pay: payslip.net_pay, currency: payslip.currency },
  });
  return Boolean(result.id);
}
