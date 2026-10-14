import { BRAND } from "@/lib/brand";
import { brandEmailShell, brandCtaButton } from "@/lib/email/brand-shell";

export function billingOfferReportedHtml({
  recipientName,
  seekerName,
  company,
  role,
  baseSalary,
  guaranteedCompensation = 0,
  offerAcceptedAt,
  actionUrl,
  needsConfirmation,
}: {
  recipientName: string;
  seekerName: string;
  company: string;
  role: string;
  baseSalary: number;
  guaranteedCompensation?: number;
  offerAcceptedAt: string;
  actionUrl: string;
  needsConfirmation: boolean;
}): string {
  const guaranteed = Number(guaranteedCompensation) || 0;
  const commission = (baseSalary + guaranteed) * 0.05;
  const cell = `padding:8px;border:1px solid ${BRAND.gray200};`;
  const labelCell = `padding:8px;background:#f9fafb;border:1px solid ${BRAND.gray200};font-weight:600;`;

  const inner = `
    <h2 style="color:${BRAND.violetDark};margin-top:0;">Job Offer Reported 🎉</h2>
    <p>Hello ${recipientName},</p>
    <p>A job offer has been reported for <strong>${seekerName}</strong>:</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="${labelCell}">Company</td><td style="${cell}">${company}</td></tr>
      <tr><td style="${labelCell}">Role</td><td style="${cell}">${role}</td></tr>
      <tr><td style="${labelCell}">Base Salary</td><td style="${cell}">$${baseSalary.toLocaleString()}</td></tr>
      ${guaranteed > 0 ? `<tr><td style="${labelCell}">Guaranteed Compensation</td><td style="${cell}">$${guaranteed.toLocaleString()}</td></tr>` : ""}
      <tr><td style="${labelCell}">Accepted On</td><td style="${cell}">${new Date(offerAcceptedAt).toLocaleDateString()}</td></tr>
      <tr><td style="padding:8px;background:${BRAND.orange50};border:1px solid ${BRAND.gray200};font-weight:600;">Placement Fee (5% of base + guaranteed)</td><td style="padding:8px;border:1px solid ${BRAND.gray200};color:${BRAND.orange600};font-weight:600;">$${commission.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
    </table>
    ${
      needsConfirmation
        ? `<div style="background:${BRAND.orange50};border:1px solid #fbbf24;border-radius:8px;padding:12px;margin:16px 0;">
             <p style="margin:0;color:#92400e;"><strong>Action Required:</strong> Please confirm this offer is accurate. The placement fee (due within 2 months of the start date) does not begin until both parties confirm.</p>
           </div>
           ${brandCtaButton("Confirm Offer", actionUrl)}`
        : `<p>The other party will be asked to confirm. Once both confirm, the placement fee (due within 2 months of the start date) begins.</p>
           ${brandCtaButton("View Details", actionUrl)}`
    }
  `;

  return brandEmailShell(inner);
}
