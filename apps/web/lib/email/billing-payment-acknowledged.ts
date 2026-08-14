export function billingPaymentAcknowledgedHtml({
  seekerName,
  portalUrl,
  isWorkStarting,
}: {
  seekerName: string;
  portalUrl: string;
  isWorkStarting?: boolean;
}): string {
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#16a34a;">Payment Confirmed ✓</h2>
      <p>Hello ${seekerName},</p>
      <p>We have received and confirmed your payment. Thank you!</p>
      ${
        isWorkStarting
          ? `<div style="background:#dcfce7;border:1px solid #86efac;border-radius:8px;padding:12px;margin:16px 0;">
               <p style="margin:0;color:#15803d;font-weight:600;">Your Account Manager will now begin working on your job search! 🎉</p>
             </div>`
          : ""
      }
      <p>You can view your billing status and upcoming installments in your portal.</p>
      <a href="${portalUrl}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
        View Billing Status
      </a>
      <p style="color:#6b7280;font-size:12px;margin-top:24px;">JobGenius Billing System</p>
    </div>
  `;
}
