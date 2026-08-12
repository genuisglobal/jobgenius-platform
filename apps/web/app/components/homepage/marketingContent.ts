export const CAMPAIGN_FEE_LABEL = "Campaign Setup & Execution Fee";

export const FREE_ACCOUNT_PRICING_MESSAGE =
  "Creating an account is free. You only pay when you choose to activate a managed Job Search Campaign with JobGenius.";

export const PRE_PAYMENT_STEPS = [
  "Create a free JobGenius account.",
  "Share your resume, target roles, location preferences, and career goals.",
  "We review your profile and determine whether we can realistically support your job search.",
  "You receive a 7-day strategy preview showing your role targets, positioning recommendations, and job-search direction.",
  "You decide whether to activate a paid Job Search Campaign.",
] as const;

export const PRE_PAYMENT_TRUST_STATEMENT =
  "JobGenius does not guarantee job offers. We help improve positioning, application quality, consistency, recruiter outreach, and interview readiness so candidates can increase their chances of securing interviews and offers.";

export const NO_GUARANTEE_POINTS = [
  "We do not guarantee a specific job offer, salary, employer, or timeline.",
  "We do not submit applications to roles that are not aligned with the candidate's goals and qualifications.",
  "We do not make false claims to employers or recruiters.",
  "We do not replace the candidate's responsibility to attend interviews, communicate professionally, and perform well during the hiring process.",
  "We provide managed job-search support designed to improve the candidate's chances of success.",
] as const;

export const WHY_TRUST_POINTS = [
  "Free account creation",
  "7-day strategy preview before paid execution",
  "Clear service agreement before campaign activation",
  "Human account manager support",
  "Transparent success-fee structure",
  "Real client success stories",
  "No job-offer guarantees or misleading promises",
] as const;

export const SUCCESS_FEE_SUMMARY =
  "5% of first-year base salary only after the candidate receives and accepts an offer.";

export const PRICING_PLANS = [
  {
    name: "Essentials",
    badge: "Structured campaign support",
    setupFeeUsd: 300,
    description: "Consistent role-matched applications and guided outreach support.",
    features: [
      "Consistent role-matched applications",
      "Guided recruiter outreach support",
      "Dedicated account manager support",
      "Resume positioning guidance",
      "Portal with real-time visibility",
    ],
    exclusions: [
      "Priority outreach handling",
      "Advanced interview practice and voice drills",
    ],
  },
  {
    name: "Premium",
    badge: "Most comprehensive",
    setupFeeUsd: 600,
    description: "Higher-touch campaign execution with deeper interview and outreach support.",
    features: [
      "Higher-volume role-matched applications",
      "Priority recruiter outreach support",
      "Dedicated account manager support",
      "Resume positioning and interview preparation",
      "Portal with real-time visibility",
      "AI-assisted interview practice and voice drills",
    ],
    exclusions: [],
  },
] as const;

export const SUCCESS_STORIES = [
  {
    name: "Norvell Titus",
    role: "Project Coordinator",
    result: "Secured a Project Coordinator position",
    story: [
      "Norvell came to JobGenius as a student seeking support with career direction, positioning, and better-fit opportunities.",
      "We helped strengthen his job search strategy, improve how his background was presented, identify suitable roles, and support his application process.",
    ],
    resultLine: "Result: Secured a Project Coordinator position.",
    linkedInUrl: "",
    photoUrl: "",
    quote: "",
    initials: "NT",
    accentClass: "from-violet-600 to-violet-400",
    badgeClass: "bg-violet-100 text-violet-800",
  },
  {
    name: "Meheza A. AGBODJAN-PRINCE",
    role: "Oracle Database Administrator",
    result: "Secured an Oracle DBA position",
    story: [
      "Meheza had a strong background in Oracle database administration, including Oracle RAC, Data Guard, GoldenGate, performance tuning, high availability, security compliance, backup and recovery, automation, and cloud environments.",
      "JobGenius supported her with stronger positioning, role targeting, application strategy, and career-focused job search execution.",
    ],
    resultLine: "Result: Secured an Oracle DBA position.",
    linkedInUrl: "",
    photoUrl: "",
    quote: "",
    initials: "MP",
    accentClass: "from-orange-500 to-orange-300",
    badgeClass: "bg-orange-100 text-orange-800",
  },
] as const;

export const SUCCESS_STORIES_DISCLAIMER =
  "Individual results vary depending on experience, target roles, market conditions, location, interview performance, and employer hiring decisions. Testimonials reflect individual client experiences and do not guarantee similar outcomes.";

export const BUSINESS_CONTACT = {
  email: "hello@jobgenius.com",
  phoneLabel: "+1 (346) 866-3766",
  phoneHref: "tel:+13468663766",
  linkedInLabel: "LinkedIn Company Page",
  linkedInHref: "https://www.linkedin.com/company/jobgenius-platform/?viewAsMember=true",
  serviceAgreementHref: "/service-agreement",
  refundPolicyHref: "/refund-policy",
  privacyHref: "/privacy",
  termsHref: "/terms",
  consultationHref: "/signup",
} as const;
