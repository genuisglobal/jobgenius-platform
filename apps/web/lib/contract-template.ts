// ============================================================
// Contract Template — JobGenius Client Engagement Agreement
// ============================================================

export interface ContractParams {
  seekerName: string;
  seekerEmail: string;
  planType: "essentials" | "premium";
  registrationFee: number;
  baseRegistrationFee?: number;
  discountAmount?: number;
  discountPercent?: number;
  discountCode?: string | null;
  discountLabel?: string | null;
  commissionRate: number; // 0.05
  agreedDate: string; // ISO date string
  installmentPlan?: {
    count: number;
    installments: { amount: number; proposedDate: string }[];
  };
}

export function generateContractHTML(params: ContractParams): string {
  const {
    seekerName,
    seekerEmail,
    planType,
    registrationFee,
    baseRegistrationFee,
    discountAmount,
    discountPercent,
    discountCode,
    discountLabel,
    commissionRate,
    agreedDate,
    installmentPlan,
  } = params;

  const planLabel = planType === "premium" ? "Premium" : "Essentials";
  const commissionPercent = (commissionRate * 100).toFixed(0);
  const feeFormatted = registrationFee.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  const baseFeeValue =
    typeof baseRegistrationFee === "number" && baseRegistrationFee > 0
      ? baseRegistrationFee
      : registrationFee;
  const baseFeeFormatted = baseFeeValue.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  const discountValue =
    typeof discountAmount === "number" && discountAmount > 0 ? discountAmount : 0;
  const discountFormatted = discountValue.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  const discountPercentLabel =
    typeof discountPercent === "number" && discountPercent > 0
      ? `${Math.round(discountPercent * 100)}%`
      : null;
  const dateFormatted = new Date(agreedDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const hasDiscount = discountValue > 0 && baseFeeValue > registrationFee;
  const discountLineItems = hasDiscount
    ? `
      <tr>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;">Base registration fee</td>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;">${baseFeeFormatted}</td>
      </tr>
      <tr>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;">Discount${
          discountLabel ? ` (${discountLabel})` : ""
        }${discountCode ? ` - ${discountCode}` : ""}</td>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;">-${discountFormatted}${
          discountPercentLabel ? ` (${discountPercentLabel})` : ""
        }</td>
      </tr>
      <tr>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;"><strong>Registration fee due</strong></td>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;"><strong>${feeFormatted}</strong></td>
      </tr>
    `
    : `
      <tr>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;"><strong>Registration fee due</strong></td>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;"><strong>${feeFormatted}</strong></td>
      </tr>
    `;

  const installmentRows =
    installmentPlan && installmentPlan.installments.length > 0
      ? installmentPlan.installments
          .map(
            (inst, i) =>
              `<tr>
                <td style="padding:6px 12px;border:1px solid #e5e7eb;">Installment ${i + 1}</td>
                <td style="padding:6px 12px;border:1px solid #e5e7eb;">${new Date(inst.proposedDate).toLocaleDateString("en-US")}</td>
                <td style="padding:6px 12px;border:1px solid #e5e7eb;">${inst.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })}</td>
              </tr>`
          )
          .join("")
      : `<tr><td colspan="3" style="padding:6px 12px;border:1px solid #e5e7eb;">One-time payment of ${feeFormatted}</td></tr>`;

  const essentialsFeatures = `
    <ul>
      <li>Unlimited job applications on your behalf</li>
      <li>Up to 20 referrals within our network</li>
      <li>Dedicated Account Manager support</li>
      <li>Resume optimization guidance</li>
    </ul>`;

  const premiumFeatures = `
    <ul>
      <li>Unlimited job applications on your behalf</li>
      <li>Unlimited referrals within our network</li>
      <li>Dedicated Account Manager support</li>
      <li>Resume optimization guidance</li>
      <li>Full interview preparation coaching</li>
      <li>Priority referral network access</li>
    </ul>`;

  const serviceFeatures =
    planType === "premium" ? premiumFeatures : essentialsFeatures;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>JobGenius Client Engagement Agreement</title>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 14px; line-height: 1.7; color: #111827; max-width: 800px; margin: 0 auto; padding: 40px 32px; }
    h1 { font-size: 20px; text-align: center; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 28px; margin-bottom: 6px; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; }
    .subtitle { text-align: center; color: #6b7280; font-size: 13px; margin-bottom: 32px; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 13px; }
    th { background: #f3f4f6; padding: 8px 12px; border: 1px solid #e5e7eb; text-align: left; }
    td { padding: 6px 12px; border: 1px solid #e5e7eb; }
    .highlight { background: #fffbeb; border: 1px solid #fbbf24; border-radius: 4px; padding: 10px 14px; margin: 12px 0; }
    .signature-block { margin-top: 40px; border-top: 1px solid #d1d5db; padding-top: 20px; }
    ul { margin: 6px 0; padding-left: 22px; }
    li { margin-bottom: 4px; }
    .party-info { display: flex; justify-content: space-between; gap: 24px; margin: 12px 0; }
    .party-box { flex: 1; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; padding: 12px; }
    p { margin: 6px 0; }
  </style>
</head>
<body>

  <h1>Client Engagement Agreement</h1>
  <p class="subtitle">JobGenius Job Placement Services</p>

  <h2>1. Parties</h2>
  <div class="party-info">
    <div class="party-box">
      <strong>Service Provider</strong><br/>
      JobGenius LLC<br/>
      Job Placement &amp; Career Services
    </div>
    <div class="party-box">
      <strong>Client</strong><br/>
      ${seekerName}<br/>
      ${seekerEmail}
    </div>
  </div>
  <p>This Client Engagement Agreement ("Agreement") is entered into on <strong>${dateFormatted}</strong> between JobGenius LLC ("JobGenius") and the Client named above.</p>

  <h2>2. Services — ${planLabel} Plan</h2>
  <p>JobGenius agrees to provide the following services under the <strong>${planLabel}</strong> tier:</p>
  ${serviceFeatures}
  <p>Services begin only after the first registration payment has been received and acknowledged by JobGenius. JobGenius will use commercially reasonable efforts to find suitable employment opportunities for the Client but does not guarantee job placement.</p>

  <h2>3. Registration Fee</h2>
  <p>Client agrees to pay the following non-refundable registration fee under the selected plan:</p>
  <table>
    <tbody>
      ${discountLineItems}
    </tbody>
  </table>
  ${
    hasDiscount
      ? `<p>This agreement reflects an approved signup discount that applies only to the registration fee and does not change the 5% placement commission.</p>`
      : ""
  }
  <p>Payment will be made under the following schedule:</p>
  <table>
    <thead>
      <tr><th>Installment</th><th>Proposed Date</th><th>Amount</th></tr>
    </thead>
    <tbody>
      ${installmentRows}
    </tbody>
  </table>
  <div class="highlight">
    <strong>Important:</strong> All installments must be completed within 1 month of this agreement date. Failure to complete payments may result in suspension of services. The registration fee is non-refundable once services have commenced.
  </div>

  <h2>4. Commission Terms</h2>
  <p>Upon Client's acceptance of a job offer facilitated or supported by JobGenius, the Client agrees to pay a placement commission of <strong>${commissionPercent}% of the first year's base salary</strong>.</p>
  <ul>
    <li>Commission is due within <strong>90 days</strong> of the offer acceptance date.</li>
    <li>Client must report the job offer through the JobGenius portal within 5 business days of acceptance.</li>
    <li>Commission applies to the base salary only (excluding bonuses, equity, or other compensation).</li>
    <li>Commission is owed regardless of employment duration, provided the position was facilitated or referred by JobGenius.</li>
  </ul>

  <h2>5. Extension Policy</h2>
  <p>If the Client is unable to pay the commission within the 90-day window due to documented financial hardship, the Client may request a <strong>one-time 30-day extension</strong> through the portal prior to the due date.</p>
  <ul>
    <li>Extension requests must be submitted at least 5 days before the commission due date.</li>
    <li>Only one extension is permitted per placement.</li>
    <li>If payment is not received by the extended due date (90 days from offer acceptance), JobGenius reserves the right to pursue legal action to collect the outstanding commission.</li>
    <li>Client is responsible for any legal fees and collection costs incurred by JobGenius in collecting unpaid commissions.</li>
  </ul>

  <h2>6. Termination Conditions</h2>
  <p>This Agreement may be terminated by JobGenius under the following circumstances:</p>
  <ul>
    <li><strong>No Job Offer After 25 Interviews:</strong> If the Client has completed 25 or more interviews facilitated by JobGenius without receiving a job offer, JobGenius may review and potentially terminate the engagement. The registration fee is non-refundable in this case.</li>
    <li><strong>Missed Interviews:</strong> If the Client misses 5 or more scheduled interviews without providing an acceptable reason at least 24 hours in advance, JobGenius may terminate the engagement. The registration fee is non-refundable.</li>
    <li><strong>Client-Initiated Termination:</strong> The Client may terminate this Agreement at any time with written notice. No refund of the registration fee will be provided. Any outstanding commission from accepted offers remains due.</li>
  </ul>
  <p>Upon termination, the Client's portal access will be deactivated and all ongoing applications will be halted.</p>

  <h2>7. Payment Methods</h2>
  <p>JobGenius accepts the following payment methods. Clients must request payment details through the portal, and payment details will be provided by JobGenius:</p>
  <ul>
    <li>Bank Transfer (ACH/Wire)</li>
    <li>CashApp</li>
    <li>Zelle</li>
    <li>PayPal</li>
  </ul>
  <p>All payments must be made in US Dollars. After making a payment, the Client must upload a payment screenshot through the portal for confirmation. Work will commence after the first payment is confirmed by JobGenius.</p>

  <h2>8. Confidentiality</h2>
  <p>Both parties agree to keep the terms of this Agreement and any related communications confidential. JobGenius will protect the Client's personal and financial information in accordance with applicable privacy laws.</p>

  <h2>9. Governing Law</h2>
  <p>This Agreement shall be governed by and construed in accordance with the laws of the State of California, without regard to its conflict of law provisions. Any disputes arising under this Agreement shall be resolved in the courts of California.</p>

  <h2>10. Entire Agreement</h2>
  <p>This Agreement constitutes the entire agreement between the parties with respect to the subject matter herein and supersedes all prior discussions, representations, or agreements. Any modifications must be made in writing and signed by both parties.</p>

  <div class="signature-block">
    <p><strong>By accepting this agreement electronically, the Client acknowledges that they have read, understood, and agree to all terms and conditions set forth in this Agreement.</strong></p>
    <br/>
    <p><strong>Client:</strong> ${seekerName} &nbsp;&nbsp; <strong>Date:</strong> ${dateFormatted}</p>
    <p><em>Electronically signed via JobGenius Portal</em></p>
    <br/>
    <p><strong>JobGenius LLC</strong> &nbsp;&nbsp; Authorized Representative</p>
  </div>

</body>
</html>`;
}

// React component type for ContractView (used in Next.js app)
export interface ContractViewProps {
  params: ContractParams;
  className?: string;
}
