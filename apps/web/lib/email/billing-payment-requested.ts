export function billingPaymentRequestedHtml({
  adminName,
  seekerName,
  method,
  dashboardUrl,
}: {
  adminName: string;
  seekerName: string;
  method: string;
  dashboardUrl: string;
}): string {
  const methodLabel = method.charAt(0).toUpperCase() + method.slice(1);
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#6d28d9;">Payment Details Requested</h2>
      <p>Hello ${adminName},</p>
      <p><strong>${seekerName}</strong> has requested payment details via <strong>${methodLabel}</strong>.</p>
      <p>Please log in to the admin dashboard and send the pre-configured payment details with one click.</p>
      <a href="${dashboardUrl}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
        View in Dashboard
      </a>
      <p style="color:#6b7280;font-size:12px;margin-top:24px;">JobGenius Billing System</p>
    </div>
  `;
}
