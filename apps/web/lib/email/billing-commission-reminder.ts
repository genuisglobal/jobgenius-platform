export function billingCommissionReminderHtml({
  seekerName,
  company,
  role,
  commissionAmount,
  dueDate,
  daysRemaining,
  portalUrl,
}: {
  seekerName: string;
  company: string;
  role: string;
  commissionAmount: number;
  dueDate: string;
  daysRemaining: number;
  portalUrl: string;
}): string {
  const isUrgent = daysRemaining <= 7;
  const headerColor = isUrgent ? "#dc2626" : "#d97706";
  const headerText = isUrgent
    ? `⚠️ Urgent: Commission Due in ${daysRemaining} Days`
    : `Reminder: Commission Due in ${daysRemaining} Days`;

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:${headerColor};">${headerText}</h2>
      <p>Hello ${seekerName},</p>
      <p>This is a reminder that your placement commission is due soon.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:8px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:600;">Company</td><td style="padding:8px;border:1px solid #e5e7eb;">${company}</td></tr>
        <tr><td style="padding:8px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:600;">Role</td><td style="padding:8px;border:1px solid #e5e7eb;">${role}</td></tr>
        <tr><td style="padding:8px;background:#fff9e6;border:1px solid #e5e7eb;font-weight:600;">Commission Due</td><td style="padding:8px;border:1px solid #e5e7eb;color:#d97706;font-weight:600;">$${commissionAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
        <tr><td style="padding:8px;background:#fef2f2;border:1px solid #e5e7eb;font-weight:600;">Due Date</td><td style="padding:8px;border:1px solid #e5e7eb;color:#dc2626;font-weight:600;">${new Date(dueDate).toLocaleDateString()}</td></tr>
      </table>
      ${
        isUrgent
          ? `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px;margin:16px 0;">
               <p style="margin:0;color:#dc2626;"><strong>Important:</strong> If payment is not received by the due date, you may request a one-time 30-day extension through your portal. After that, legal action may be initiated.</p>
             </div>`
          : `<p>Please arrange payment through your portal at your earliest convenience. A one-time 30-day extension is available on request if needed.</p>`
      }
      <a href="${portalUrl}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
        Pay Commission Now
      </a>
      <p style="color:#6b7280;font-size:12px;margin-top:24px;">JobGenius Billing System</p>
    </div>
  `;
}
