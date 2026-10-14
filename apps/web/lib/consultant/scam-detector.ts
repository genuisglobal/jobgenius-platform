// Scam / fraud red-flag scorer (Org Singularity) — encodes the course's
// M2L9 "Common Job Scam Red Flags" checklist into a reusable signal.
// Used to drive the Decision Engine's escalate path on suspicious messages/jobs.

export type ScamSignals = {
  score: number; // 0-100
  redFlags: string[];
  isLikelyScam: boolean;
};

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "ymail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "aol.com",
  "gmx.com",
  "proton.me",
  "protonmail.com",
  "icloud.com",
  "mail.com",
  "yandex.com",
  "zoho.com",
]);

const RULES: { code: string; weight: number; re: RegExp }[] = [
  {
    code: "PAYMENT_OR_FEE_REQUEST",
    weight: 55,
    re: /\b(shipping fee|equipment fee|processing fee|registration fee|activation fee|training fee|onboarding fee|pay (a|the)?\s?(fee|deposit)|upfront payment|send (money|payment))\b/,
  },
  {
    code: "BANK_OR_FINANCIAL_DETAILS",
    weight: 55,
    re: /\b(bank details|bank account|routing number|account number|void(ed)? check|direct deposit form)\b/,
  },
  {
    code: "CRYPTO_GIFTCARD_WIRE",
    weight: 55,
    re: /\b(bitcoin|crypto(currency)?|gift\s?card|wire transfer|zelle|cash\s?app|venmo|western union|moneygram)\b/,
  },
  {
    code: "SENSITIVE_ID_UPFRONT",
    weight: 50,
    re: /\b(social security (number|card)|ssn|passport number|driver'?s?\s?licen[cs]e|government[- ]issued id)\b/,
  },
  {
    code: "OFFER_WITHOUT_INTERVIEW",
    weight: 40,
    re: /\b(no interview (is )?(needed|required|necessary)|without (an )?interview|hired? (immediately|on the spot)|you (have|'ve) been (selected|hired)|congratulations[, ].{0,40}(selected|hired|offer))\b/,
  },
  {
    code: "OFF_PLATFORM_REDIRECT",
    weight: 25,
    re: /\b(text|message|contact|reach|chat) (me|us) (on|via|through)\b.{0,24}\b(telegram|whatsapp|signal|google\s?chat|hangouts|skype)\b/,
  },
  {
    code: "URGENCY_OR_GUARANTEE",
    weight: 15,
    re: /\b(act now|urgent(ly)?|immediate start|start (today|immediately)|guaranteed (job|position|income)|limited (slots|spots))\b/,
  },
  {
    code: "SUSPICIOUS_LINK",
    weight: 20,
    re: /\b(bit\.ly|tinyurl\.com|t\.co\/|goo\.gl|rebrand\.ly|cutt\.ly|is\.gd)\b/,
  },
];

function domainOf(email?: string | null): string | null {
  if (!email) return null;
  const match = email.trim().toLowerCase().match(/@([^>\s]+)$/);
  return match ? match[1] : null;
}

export function scoreScamSignals(input: {
  subject?: string | null;
  body?: string | null;
  senderEmail?: string | null;
  /** Whether an interview is on record — makes "offer without interview" far more suspicious. */
  hadInterview?: boolean;
}): ScamSignals {
  const text = `${input.subject ?? ""}\n${input.body ?? ""}`.toLowerCase();
  const redFlags: string[] = [];
  let score = 0;

  for (const rule of RULES) {
    if (rule.re.test(text)) {
      redFlags.push(rule.code);
      score += rule.weight;
    }
  }

  // A "recruiter" writing from a free/personal email domain is a supporting signal.
  const domain = domainOf(input.senderEmail);
  if (domain && FREE_EMAIL_DOMAINS.has(domain)) {
    redFlags.push("FREE_EMAIL_SENDER");
    score += 25;
  }

  // Offer-without-interview is much worse when no interview exists for this thread.
  if (redFlags.includes("OFFER_WITHOUT_INTERVIEW") && input.hadInterview === false) {
    score += 20;
  }

  return {
    score: Math.min(score, 100),
    redFlags,
    isLikelyScam: score >= 50,
  };
}
