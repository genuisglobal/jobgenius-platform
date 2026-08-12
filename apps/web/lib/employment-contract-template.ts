// ============================================================
// Employment Contract Template — JobGenius staff
// Mirrors lib/contract-template.ts styling. E-sign by recording
// signed_at + signed_ip on employment_contracts.
// ============================================================

import type {
  EmploymentContractType,
  PayFrequency,
} from "@/lib/payroll";

export interface EmploymentContractParams {
  employeeName: string;
  employeeEmail?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  contractType: EmploymentContractType;
  baseSalary: number;
  payFrequency: PayFrequency;
  currency?: string;
  commissionTerms?: string | null;
  effectiveDate: string; // ISO date string
  endDate?: string | null;
  employerName?: string;
}

const CONTRACT_TYPE_LABELS: Record<EmploymentContractType, string> = {
  offer_letter: "Offer Letter",
  employment_agreement: "Employment Agreement",
  amendment: "Contract Amendment",
};

const PAY_FREQUENCY_LABELS: Record<PayFrequency, string> = {
  monthly: "monthly",
  biweekly: "bi-weekly",
  weekly: "weekly",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function generateEmploymentContractHTML(
  params: EmploymentContractParams
): string {
  const {
    employeeName,
    employeeEmail,
    jobTitle,
    department,
    contractType,
    baseSalary,
    payFrequency,
    currency = "USD",
    commissionTerms,
    effectiveDate,
    endDate,
    employerName = "JobGenius LLC",
  } = params;

  const docLabel = CONTRACT_TYPE_LABELS[contractType] ?? "Employment Agreement";
  const freqLabel = PAY_FREQUENCY_LABELS[payFrequency] ?? "monthly";
  const salaryFormatted = (Number(baseSalary) || 0).toLocaleString("en-US", {
    style: "currency",
    currency,
  });
  const effectiveFormatted = formatDate(effectiveDate);

  const commissionSection = commissionTerms
    ? `
  <h2>4. Variable Compensation</h2>
  <p>In addition to base compensation, the Employee may earn commission and/or bonus compensation under the following terms:</p>
  <div class="highlight">${commissionTerms.replace(/\n/g, "<br/>")}</div>`
    : "";

  const termSection =
    contractType === "amendment"
      ? `
  <h2>6. Effect of Amendment</h2>
  <p>This Amendment modifies the referenced terms of the Employee's existing employment arrangement effective <strong>${effectiveFormatted}</strong>. All other terms of the prior agreement remain in full force and effect.</p>`
      : `
  <h2>6. Term &amp; Termination</h2>
  <p>Employment with ${employerName} is <strong>at-will</strong>, meaning either party may terminate the relationship at any time, with or without cause or notice, subject to applicable law.${
          endDate
            ? ` This engagement is currently scheduled through <strong>${formatDate(
                endDate
              )}</strong>.`
            : ""
        }</p>
  <p>Upon termination, the Employee is entitled to all earned but unpaid compensation through the final day of work.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${employerName} ${docLabel}</title>
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
    .party-info { display: flex; justify-content: space-between; gap: 24px; margin: 12px 0; }
    .party-box { flex: 1; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; padding: 12px; }
    p { margin: 6px 0; }
  </style>
</head>
<body>

  <h1>${docLabel}</h1>
  <p class="subtitle">${employerName} — Human Resources</p>

  <h2>1. Parties</h2>
  <div class="party-info">
    <div class="party-box">
      <strong>Employer</strong><br/>
      ${employerName}<br/>
      Human Resources
    </div>
    <div class="party-box">
      <strong>Employee</strong><br/>
      ${employeeName}<br/>
      ${employeeEmail ?? ""}
    </div>
  </div>
  <p>This ${docLabel} ("Agreement") is entered into and effective as of <strong>${effectiveFormatted}</strong> between ${employerName} ("Employer") and the Employee named above.</p>

  <h2>2. Position &amp; Duties</h2>
  <p>The Employee is engaged in the role of <strong>${
    jobTitle ?? "Team Member"
  }</strong>${
    department ? ` within the <strong>${department}</strong> department` : ""
  }. The Employee agrees to perform the duties associated with this role diligently and in good faith, and to comply with the Employer's policies and procedures.</p>

  <h2>3. Base Compensation</h2>
  <table>
    <tbody>
      <tr>
        <td>Base compensation (per ${freqLabel} period)</td>
        <td><strong>${salaryFormatted}</strong></td>
      </tr>
      <tr>
        <td>Pay frequency</td>
        <td>${freqLabel.charAt(0).toUpperCase() + freqLabel.slice(1)}</td>
      </tr>
      <tr>
        <td>Currency</td>
        <td>${currency}</td>
      </tr>
    </tbody>
  </table>
  <p>Base compensation is paid on a ${freqLabel} basis, less any applicable deductions itemized on the Employee's payslip.</p>
${commissionSection}

  <h2>5. Confidentiality</h2>
  <p>The Employee agrees to keep confidential all proprietary, financial, and client information of the Employer, both during and after the term of employment, and to use such information solely for the benefit of the Employer.</p>
${termSection}

  <h2>7. Governing Law</h2>
  <p>This Agreement shall be governed by and construed in accordance with the laws of the State of California, without regard to its conflict of law provisions.</p>

  <h2>8. Entire Agreement</h2>
  <p>This Agreement constitutes the entire understanding between the parties with respect to its subject matter and supersedes all prior discussions. Any modification must be made in writing and signed by both parties.</p>

  <div class="signature-block">
    <p><strong>By accepting this agreement electronically, the Employee acknowledges that they have read, understood, and agree to all terms set forth above.</strong></p>
    <br/>
    <p><strong>Employee:</strong> ${employeeName} &nbsp;&nbsp; <strong>Effective Date:</strong> ${effectiveFormatted}</p>
    <p><em>Electronically signed via the JobGenius dashboard</em></p>
    <br/>
    <p><strong>${employerName}</strong> &nbsp;&nbsp; Authorized Representative</p>
  </div>

</body>
</html>`;
}
