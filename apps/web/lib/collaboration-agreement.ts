// ============================================================
// JobGenius — Client Collaboration, Communication, Offer Disclosure
// & Placement Fee Agreement.
//
// Two-part fee structure: a one-time Campaign Setup & Execution Fee due at
// campaign activation (amount set by the Client's selected plan, see
// PRICING_PLANS), plus a 5% success fee on an Accepted Placement, due within
// two months of the employment start date (extension up to three months).
// Bump AGREEMENT_VERSION whenever the legal text changes so prior
// acceptances stay auditable.
// ============================================================

import { PRICING_PLANS, CAMPAIGN_FEE_LABEL } from "@/app/components/homepage/marketingContent";

export const AGREEMENT_VERSION = "2026-07-collaboration-v2";
export const DEFAULT_COMMISSION_RATE = 0.05;

export interface CollaborationAgreementParams {
  clientName: string;
  clientEmail: string;
  /** ISO date the agreement takes effect (defaults to today). */
  effectiveDate?: string;
  /** Placement fee as a percentage, e.g. 5. */
  commissionRatePercent?: number;
  /** The typed e-signature (client full name). Present once signed. */
  signatureName?: string | null;
  /** ISO timestamp of acceptance. Present once signed. */
  agreedDate?: string | null;
  /** Client's selected plan (job_seekers.campaign_tier). Unset shows both plan fees as a range. */
  campaignTier?: "essentials" | "premium" | null;
}

function esc(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "____________________";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export function generateCollaborationAgreementHTML(params: CollaborationAgreementParams): string {
  const clientName = esc(params.clientName || "");
  const clientEmail = esc(params.clientEmail || "");
  const pct = params.commissionRatePercent ?? DEFAULT_COMMISSION_RATE * 100;
  const effective = fmtDate(params.effectiveDate ?? new Date().toISOString());
  const signature = params.signatureName ? esc(params.signatureName) : "________________________________";
  const signedDate = params.agreedDate ? fmtDate(params.agreedDate) : "________________________________";

  const section = (n: number, title: string, body: string) =>
    `<h2>${n}. ${title}</h2>${body}`;

  const selectedPlan = params.campaignTier
    ? PRICING_PLANS.find((plan) => plan.name.toLowerCase() === params.campaignTier)
    : undefined;

  const setupFeeLine = selectedPlan
    ? `$${selectedPlan.setupFeeUsd.toLocaleString()} (${selectedPlan.name} plan)`
    : PRICING_PLANS.map((plan) => `$${plan.setupFeeUsd.toLocaleString()} (${plan.name} plan)`).join(
        " or "
      );

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" />
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1f2937; line-height: 1.55; font-size: 14px; max-width: 720px; margin: 0 auto; padding: 8px; }
  .org { text-align: center; color: #6d28d9; font-weight: 700; letter-spacing: 0.04em; }
  .sub { text-align: center; color: #6b7280; font-size: 12px; margin-bottom: 14px; }
  h1 { font-size: 18px; text-align: center; text-transform: uppercase; letter-spacing: 0.03em; margin: 12px 0 4px; }
  h2 { font-size: 14px; margin: 16px 0 4px; color: #111827; }
  p { margin: 6px 0; }
  ul { margin: 6px 0 6px 18px; }
  .meta { text-align: center; color: #374151; margin-bottom: 8px; }
  .fee { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 8px 12px; }
  .sig { margin-top: 22px; border-top: 1px solid #e5e7eb; padding-top: 12px; }
  .sig-row { margin: 8px 0; }
  .label { color: #6b7280; font-size: 12px; }
  .val { font-weight: 600; }
  .disclaimer { color: #9ca3af; font-size: 11px; margin-top: 18px; }
</style></head>
<body>
  <div class="org">JOBGENIUS</div>
  <div class="sub">Career Services &amp; Job Search Coordination · Houston, Texas</div>
  <h1>Client Collaboration, Communication, Offer Disclosure &amp; Placement Fee Agreement</h1>
  <p class="meta"><strong>Effective Date:</strong> ${effective}</p>

  <p><strong>Purpose.</strong> This Agreement establishes a clear, collaborative process between JobGenius ("Company") and the undersigned client ("Client") for job-search support, employer communications, offer transparency, and payment of the agreed Campaign Setup &amp; Execution Fee and placement fee.</p>

  ${section(1, "Scope of Collaboration", `
    <p>JobGenius may provide resume optimization, LinkedIn optimization, job-search coordination, application support, recruiter outreach, interview scheduling, interview preparation, portfolio guidance, follow-up support, and related career services. Client and JobGenius agree to work as a coordinated team toward securing suitable employment opportunities.</p>
    <p>JobGenius does not guarantee interviews, job offers, salary levels, employer decisions, work authorization outcomes, or employment.</p>`)}

  ${section(2, "Designated Communication Channels", `
    <p>Client agrees that the designated job-search email account approved by JobGenius will be used for applications, recruiter communications, interview invitations, employer updates, background-check coordination, and offer-related correspondence whenever reasonably possible.</p>
    <p>Client must promptly forward or provide copies of material employment-related communications received through any alternate email account, LinkedIn account, phone number, job board, recruiter platform, referral, or other channel.</p>
    <p>Client must not use an undisclosed email address, alternate resume, or alternate communication channel to conceal an opportunity, interview, offer, compensation discussion, or employment result connected to JobGenius services.</p>`)}

  ${section(3, "Recruiter and Employer Communication Protocol", `
    <p>The assigned JobGenius Account Manager will primarily coordinate recruiter and employer communications, including responses, follow-ups, meeting confirmations, document submissions, and scheduling support. Client may communicate directly when necessary, but agrees to:</p>
    <ul>
      <li>Maintain professional, timely, and accurate communication;</li>
      <li>Inform or copy the assigned Account Manager on material communications within twenty-four (24) hours;</li>
      <li>Avoid independently committing to availability, compensation, start dates, or other substantive terms without promptly informing JobGenius; and</li>
      <li>Forward any recruiter message, employer request, interview invitation, offer, or compensation discussion that requires action or strategic guidance.</li>
    </ul>`)}

  ${section(4, "Approved Resume and Document Control", `
    <p>Client agrees to use only the current JobGenius-approved resume and supporting documents for opportunities supported by JobGenius. Client shall not submit outdated resumes, self-modified resumes, Word versions, documents containing alternate contact details, or unapproved materials to employers or recruiters without prior review by JobGenius.</p>`)}

  ${section(5, "Opportunity, Interview, and Offer Disclosure", `
    <p>Client must notify JobGenius within twenty-four (24) hours of receiving any recruiter outreach, interview invitation, request for resume or references, compensation discussion, background-check update, rejection, withdrawal, verbal offer, or written offer.</p>
    <p>For every offer, Client must provide a complete copy, screenshot, or written summary showing the employer, position, employment type, base compensation, guaranteed compensation, anticipated start date, and any material conditions. This disclosure is required for transparency, service coordination, and placement-fee administration.</p>`)}

  ${section(6, "Campaign Setup & Execution Fee", `
    <p class="fee">Client agrees to pay JobGenius a one-time, non-refundable ${CAMPAIGN_FEE_LABEL} of <strong>${setupFeeLine}</strong>, due at the time Client activates a paid Job Search Campaign. This fee covers campaign setup, positioning, and execution of the selected plan, and is separate from and in addition to the placement fee described in Section 7.</p>`)}

  ${section(7, "Placement Fee and Fee Trigger", `
    <p class="fee">Client agrees to pay JobGenius a placement fee equal to <strong>${pct}% of the Client's gross first-year base salary plus guaranteed cash compensation</strong> for an Accepted Placement.</p>
    <p>"Accepted Placement" means an employment offer accepted by Client that results from, relates to, or is materially supported by JobGenius services, including applications, recruiter outreach, resume submission, LinkedIn optimization, referrals, interview preparation, career coaching, or job-search strategy.</p>
    <p>The placement fee applies regardless of whether the employer, recruiter, or opportunity communicates with Client through a personal email address, LinkedIn account, phone number, job board, referral, or other channel.</p>`)}

  ${section(8, "Payment Timing and Approved Extension", `
    <p>The placement fee is due in full within two (2) months after Client's employment start date. JobGenius may approve a written payment extension of up to three (3) months after the employment start date. Any extension must document the agreed installment amounts and due dates.</p>`)}

  ${section(9, "Non-Circumvention and Transparency", `
    <p>Client agrees not to conceal, redirect, delay reporting, misrepresent, or otherwise attempt to avoid the placement fee for an Accepted Placement connected to JobGenius services. Client acknowledges that complete and timely disclosure of job-search activity and outcomes is a material part of this Agreement.</p>`)}

  ${section(10, "Client Responsibilities", `
    <p>Client agrees to provide accurate information, respond promptly to reasonable requests, attend scheduled interviews and preparation sessions, communicate professionally, and promptly advise JobGenius of changes to availability, job preferences, work authorization, compensation expectations, or search status.</p>`)}

  ${section(11, "Termination and Continuing Fee Obligation", `
    <p>Either party may end active services by written notice. The Campaign Setup &amp; Execution Fee is non-refundable once campaign work has begun. The placement fee remains due if Client accepts an offer within twelve (12) months after termination where the opportunity was introduced, supported, applied to, submitted, referred, or materially advanced through JobGenius during the active service period.</p>`)}

  ${section(12, "Privacy and Records", `
    <p>JobGenius will use Client information solely for agreed career services and will take reasonable steps to protect Client documents and personal information. Client authorizes JobGenius to maintain records of applications, recruiter communications, interview activity, and offer documentation for service-management, transparency, and payment-administration purposes.</p>`)}

  ${section(13, "Governing Law and Good-Faith Resolution", `
    <p>This Agreement shall be governed by the laws of the State of Texas, without regard to conflict-of-law rules. Before initiating a formal dispute, both parties agree to attempt good-faith written resolution of the matter.</p>`)}

  <h2>Acknowledgment and Acceptance</h2>
  <p>By signing below, Client confirms that Client has read, understood, and agrees to the terms of this Agreement. Electronic signatures and electronic acceptance shall be treated as valid to the extent permitted by applicable law.</p>

  <div class="sig">
    <div class="sig-row"><span class="label">Client Full Name:</span> <span class="val">${clientName || "________________________________"}</span></div>
    <div class="sig-row"><span class="label">Client Email:</span> <span class="val">${clientEmail || "________________________________"}</span></div>
    <div class="sig-row"><span class="label">Client Signature:</span> <span class="val">${signature}</span></div>
    <div class="sig-row"><span class="label">Date:</span> <span class="val">${signedDate}</span></div>
    <div class="sig-row"><span class="label">Company Address:</span> <span class="val">Houston, Texas</span></div>
  </div>

  <p class="disclaimer">Agreement version ${AGREEMENT_VERSION}. For legal review purposes, this template should be tailored to the Company's final service model and applicable client jurisdiction before broad deployment.</p>
</body></html>`;
}
