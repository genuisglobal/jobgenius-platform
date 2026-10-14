export function billingDetailsSentHtml({
  seekerName,
  methodLabel,
  details,
  portalUrl,
}: {
  seekerName: string;
  methodLabel: string;
  details: string;
  portalUrl: string;
}): string {
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#6d28d9;">Payment Details — ${methodLabel}</h2>
      <p>Hello ${seekerName},</p>
      <p>Here are the payment details you requested via <strong>${methodLabel}</strong>:</p>
      <div style="background:#f3f4f6;border-radius:8px;padding:16px;font-family:monospace;white-space:pre-wrap;font-size:14px;margin:16px 0;">
${details}
      </div>
      <p>After making your payment, please upload a screenshot in your portal to confirm the transaction.</p>
      <a href="${portalUrl}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
        Upload Screenshot
      </a>
      <p style="color:#6b7280;font-size:12px;margin-top:24px;">JobGenius Billing System</p>
    </div>
  `;
}
