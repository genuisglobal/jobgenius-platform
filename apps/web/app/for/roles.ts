export type RolePage = {
  slug: string;
  role: string;
  rolePlural: string;
  metaTitle: string;
  metaDescription: string;
  heroTitle: string;
  heroSubtitle: string;
  painPoints: { title: string; desc: string }[];
  whyJobGenius: { title: string; desc: string }[];
  targetTitles: string[];
};

export const ROLES: RolePage[] = [
  {
    slug: "software-engineers",
    role: "software engineer",
    rolePlural: "software engineers",
    metaTitle: "Job Search Service for Software Engineers | JobGenius",
    metaDescription:
      "JobGenius runs your software engineering job search end-to-end — targeted applications, recruiter outreach at top tech companies, and AI-powered technical interview prep.",
    heroTitle: "A managed job search built for software engineers",
    heroSubtitle:
      "Targeted applications, warm intros to engineering recruiters, and AI-powered technical interview prep — so you can keep shipping code while we run your search.",
    painPoints: [
      {
        title: "100+ applications, 3 responses",
        desc: "Engineering postings at top companies get flooded in hours. Front-door applications alone are the worst channel for SWE roles.",
      },
      {
        title: "LeetCode burnout from solo prep",
        desc: "Studying without structure or feedback is exhausting and often misses the patterns each company actually asks.",
      },
      {
        title: "Recruiter spam, but no real conversations",
        desc: "Generic LinkedIn InMails for roles you'd never take, while the actually-interesting roles never reach your inbox.",
      },
    ],
    whyJobGenius: [
      {
        title: "Engineering-savvy account managers",
        desc: "Your AM understands the difference between a frontend role and a platform role, and tailors outreach for each target.",
      },
      {
        title: "Direct outreach to engineering leaders",
        desc: "Warm intros to engineering managers and tech recruiters — not just generic 'recruiter spray-and-pray.'",
      },
      {
        title: "Company-specific technical prep",
        desc: "AI-powered interview prep with question banks for the specific systems and patterns each target company asks about.",
      },
    ],
    targetTitles: [
      "Software Engineer",
      "Senior Software Engineer",
      "Staff Engineer",
      "Backend Engineer",
      "Frontend Engineer",
      "Full-Stack Engineer",
      "Platform Engineer",
      "Site Reliability Engineer",
      "Mobile Engineer",
    ],
  },
  {
    slug: "data-scientists",
    role: "data scientist",
    rolePlural: "data scientists",
    metaTitle: "Job Search Service for Data Scientists | JobGenius",
    metaDescription:
      "JobGenius helps data scientists land their next role — targeted applications, recruiter outreach to data teams, and prep for SQL, ML, and case-study interviews.",
    heroTitle: "A managed job search built for data scientists",
    heroSubtitle:
      "Targeted applications, warm intros to data team leads, and prep for the SQL screens, ML case studies, and product-sense interviews that actually move offers.",
    painPoints: [
      {
        title: "Every role wants 'unicorn' skills",
        desc: "JDs that mix statistics, ML, ML engineering, and product sense — but the team really only does one of those. Hard to tell from the outside.",
      },
      {
        title: "Take-home assessments are everywhere",
        desc: "Hours of unpaid work for a 30% chance of feedback. Spending that time on the wrong companies is the silent career killer.",
      },
      {
        title: "Stuck between 'analyst' and 'ML engineer'",
        desc: "Title inflation and deflation are both rampant in data roles. Recruiters often misread your level — costing you offers or compensation.",
      },
    ],
    whyJobGenius: [
      {
        title: "Data-savvy account managers",
        desc: "Your AM reads JDs the way you do — separating real ML work from rebranded analytics, so we apply you where you'll actually thrive.",
      },
      {
        title: "Direct intros to data team leads",
        desc: "Warm outreach to data managers and heads of analytics, not generic recruiters who can't evaluate the technical fit.",
      },
      {
        title: "Prep for SQL, ML, and case-study rounds",
        desc: "Targeted practice for the exact interview formats each company uses — SQL whiteboards, ML system design, product-sense cases.",
      },
    ],
    targetTitles: [
      "Data Scientist",
      "Senior Data Scientist",
      "Staff Data Scientist",
      "ML Engineer",
      "Applied Scientist",
      "Analytics Engineer",
      "Research Scientist",
      "Data Analyst",
    ],
  },
  {
    slug: "product-managers",
    role: "product manager",
    rolePlural: "product managers",
    metaTitle: "Job Search Service for Product Managers | JobGenius",
    metaDescription:
      "JobGenius runs PM job searches end-to-end — targeted applications, warm intros to product leaders, and prep for the case studies and product-sense interviews that decide offers.",
    heroTitle: "A managed job search built for product managers",
    heroSubtitle:
      "Targeted applications, warm intros to product leaders, and prep for the case-study and product-sense interviews — so your search runs while you keep shipping.",
    painPoints: [
      {
        title: "PM searches take 4-6 months on average",
        desc: "PM hiring is brutally competitive at top companies. Without focused outreach, you're competing with 500+ resumes per posting.",
      },
      {
        title: "Generic resumes get rejected fast",
        desc: "PM hiring managers want to see metrics, scope, and shipped work — not 'managed cross-functional team.' Most resumes don't pass the 10-second test.",
      },
      {
        title: "Case interview prep is a part-time job",
        desc: "Each company has its own case format. Self-prep is unfocused and exhausting; mock interviews with random partners often miss what each company actually asks.",
      },
    ],
    whyJobGenius: [
      {
        title: "PM-savvy account managers",
        desc: "Your AM understands B2B vs. consumer, growth vs. platform, IC vs. people-management tracks — and targets accordingly.",
      },
      {
        title: "Direct intros to product leaders",
        desc: "Warm outreach to heads of product and product leads — the people who actually make hiring decisions.",
      },
      {
        title: "Case interview prep, company by company",
        desc: "Tailored practice for each target's case format — product-sense, analytical, strategy, technical — with feedback that compounds.",
      },
    ],
    targetTitles: [
      "Product Manager",
      "Senior Product Manager",
      "Group Product Manager",
      "Director of Product",
      "Principal PM",
      "Technical PM",
      "Growth PM",
      "Platform PM",
    ],
  },
  {
    slug: "marketers",
    role: "marketer",
    rolePlural: "marketers",
    metaTitle: "Job Search Service for Marketers | JobGenius",
    metaDescription:
      "JobGenius runs your marketing job search — targeted applications, warm intros to marketing leaders, and prep for portfolio reviews and case-study interviews.",
    heroTitle: "A managed job search built for marketing professionals",
    heroSubtitle:
      "Targeted applications, warm intros to marketing leaders, and prep for portfolio reviews and growth case studies — across content, performance, brand, and product marketing roles.",
    painPoints: [
      {
        title: "'Marketing' is 20 different jobs",
        desc: "Performance marketing, brand, content, product marketing, growth — wildly different roles, but JDs often blur them. Easy to apply to the wrong ones.",
      },
      {
        title: "Portfolio reviews are time sinks",
        desc: "Tailoring case studies for every application takes hours. Most candidates send the same deck everywhere — and it shows.",
      },
      {
        title: "Hard to prove ROI from outside",
        desc: "The work you did is often locked inside company analytics tools. Without context, your impact looks smaller on paper than it really was.",
      },
    ],
    whyJobGenius: [
      {
        title: "Marketing-savvy account managers",
        desc: "Your AM knows performance marketing from product marketing and targets the right roles — not just whatever has 'marketing' in the title.",
      },
      {
        title: "Direct intros to marketing leaders",
        desc: "Warm outreach to heads of growth, brand directors, and CMOs — the people who actually decide who joins their team.",
      },
      {
        title: "Portfolio and case prep that lands",
        desc: "Help framing your work in terms hiring managers care about — impact, attribution, decisions you drove.",
      },
    ],
    targetTitles: [
      "Marketing Manager",
      "Growth Marketing Manager",
      "Performance Marketing Manager",
      "Product Marketing Manager",
      "Brand Marketing Manager",
      "Content Marketing Manager",
      "Demand Generation Manager",
      "Head of Growth",
      "Director of Marketing",
    ],
  },
  {
    slug: "finance-professionals",
    role: "finance professional",
    rolePlural: "finance professionals",
    metaTitle: "Job Search Service for Finance Professionals | JobGenius",
    metaDescription:
      "JobGenius runs your finance job search — targeted applications, warm intros to finance leaders, prep for technical and case interviews across FP&A, IB, PE, and corp finance.",
    heroTitle: "A managed job search built for finance professionals",
    heroSubtitle:
      "Targeted applications, warm intros to CFOs and finance leaders, and prep for the technical and case interviews — across corporate finance, FP&A, investment banking, and PE.",
    painPoints: [
      {
        title: "Finance hiring runs on networks",
        desc: "More than almost any function, finance roles are filled through referrals and direct outreach. Cold applications alone rarely move the needle.",
      },
      {
        title: "Technical screens vary wildly",
        desc: "DCF, LBO, three-statement modeling, accounting — each role weights these differently. Self-prep is often misaligned with the actual screen.",
      },
      {
        title: "Career transitions are scrutinized hard",
        desc: "Moving from banking to corp finance, or PE to operating roles — recruiters need a clear story, or they pass.",
      },
    ],
    whyJobGenius: [
      {
        title: "Finance-savvy account managers",
        desc: "Your AM understands the distinctions between banking, PE, hedge funds, corp finance, and FP&A — and targets accordingly.",
      },
      {
        title: "Direct intros into finance teams",
        desc: "Warm outreach to CFOs, VPs of finance, and PE partners — beating the network bias that filters out cold applicants.",
      },
      {
        title: "Technical and behavioral prep that compounds",
        desc: "Targeted practice for modeling tests, case interviews, and the behavioral rounds that decide between equally-qualified candidates.",
      },
    ],
    targetTitles: [
      "Financial Analyst",
      "Senior Financial Analyst",
      "FP&A Manager",
      "Director of Finance",
      "Investment Banking Analyst",
      "Investment Banking Associate",
      "Private Equity Associate",
      "Corporate Development",
      "CFO",
    ],
  },
  {
    slug: "operations-leaders",
    role: "operations leader",
    rolePlural: "operations leaders",
    metaTitle: "Job Search Service for Operations Leaders | JobGenius",
    metaDescription:
      "JobGenius runs your ops job search — targeted applications, warm intros to ops and chief-of-staff networks, and prep for case-study and behavioral interviews.",
    heroTitle: "A managed job search built for operations leaders",
    heroSubtitle:
      "Targeted applications, warm intros to operations leaders and chiefs of staff, and prep for the case interviews and behavioral rounds that decide ops offers.",
    painPoints: [
      {
        title: "Ops roles are hard to pattern-match",
        desc: "Business operations, revenue operations, biz-ops, chief of staff, strategy & ops — JDs blur, but the actual day-to-day differs a lot.",
      },
      {
        title: "Impact is hard to translate on a resume",
        desc: "Most of what ops people do isn't a launched product. It's process, decisions, and dollars saved — much harder to summarize in a bullet.",
      },
      {
        title: "Generalist roles attract generalist applicants",
        desc: "Operations postings get massive application volumes from career changers. Standing out requires either a clear narrative or a warm intro — usually both.",
      },
    ],
    whyJobGenius: [
      {
        title: "Ops-savvy account managers",
        desc: "Your AM understands the differences between strategy & ops, biz-ops, and rev-ops — and targets the roles that fit your trajectory.",
      },
      {
        title: "Direct intros to ops networks",
        desc: "Warm outreach to chiefs of staff and operations leaders — a tight, network-driven community that rarely hires from cold applications.",
      },
      {
        title: "Case prep tailored to ops interviews",
        desc: "Practice for the case studies, structured-thinking interviews, and behavioral rounds that decide between strong ops candidates.",
      },
    ],
    targetTitles: [
      "Business Operations Manager",
      "Strategy & Operations Manager",
      "Revenue Operations Manager",
      "Chief of Staff",
      "Director of Operations",
      "Head of Operations",
      "BizOps Lead",
    ],
  },
  {
    slug: "sales-professionals",
    role: "sales professional",
    rolePlural: "sales professionals",
    metaTitle: "Job Search Service for Sales Professionals | JobGenius",
    metaDescription:
      "JobGenius runs your sales job search — targeted applications, warm intros to sales leaders, and prep for the discovery, role-play, and pipeline interviews.",
    heroTitle: "A managed job search built for sales professionals",
    heroSubtitle:
      "Targeted applications, warm intros to sales leaders, and prep for the role-play, pipeline-review, and discovery interviews that decide sales offers.",
    painPoints: [
      {
        title: "Quota attainment matters more than titles",
        desc: "Recruiters scan for numbers — % to quota, deal size, ramp time. Resumes without specific quotas get filtered out fast.",
      },
      {
        title: "Sales hiring is brutally network-driven",
        desc: "VPs of sales hire from their networks. If you're not warm-introed, you're competing with their existing pipeline of known candidates.",
      },
      {
        title: "Role-play interviews catch unprepared candidates",
        desc: "Most sales interviews include a role-play. Showing up cold is the fastest way to lose an otherwise strong candidacy.",
      },
    ],
    whyJobGenius: [
      {
        title: "Sales-savvy account managers",
        desc: "Your AM understands SDR vs. AE vs. enterprise vs. mid-market — and targets the segment and motion that fits your track record.",
      },
      {
        title: "Direct intros to VPs and heads of sales",
        desc: "Warm outreach to sales leaders, where most hiring decisions actually get made. Skip the recruiter funnel.",
      },
      {
        title: "Role-play and pipeline interview prep",
        desc: "Targeted practice for discovery calls, role-plays, and pipeline reviews — with feedback that sharpens your delivery for each company.",
      },
    ],
    targetTitles: [
      "Account Executive",
      "Senior Account Executive",
      "Enterprise Account Executive",
      "SDR / BDR",
      "Sales Manager",
      "Sales Director",
      "VP of Sales",
      "Solutions Engineer",
    ],
  },
  {
    slug: "designers",
    role: "designer",
    rolePlural: "designers",
    metaTitle: "Job Search Service for Designers | JobGenius",
    metaDescription:
      "JobGenius runs your design job search end-to-end — targeted applications, warm intros to design leaders, and portfolio reviews for product, UX, and brand design roles.",
    heroTitle: "A managed job search built for designers",
    heroSubtitle:
      "Targeted applications, warm intros to design leaders, and portfolio feedback that lands — across product design, UX, UI, and brand design roles.",
    painPoints: [
      {
        title: "Portfolio reviews take days, not minutes",
        desc: "Tailoring case studies for every application is exhausting. Most designers send the same portfolio everywhere — and hiring managers can tell.",
      },
      {
        title: "Design titles are a mess",
        desc: "Product Designer, UX Designer, UI/UX, Interaction Designer — half the JDs blur these. Easy to apply to the wrong roles or get screened out for the wrong reasons.",
      },
      {
        title: "Design hiring runs on referrals",
        desc: "Top design teams hire from their networks. Cold applications barely move the needle without an intro from someone they trust.",
      },
    ],
    whyJobGenius: [
      {
        title: "Design-savvy account managers",
        desc: "Your AM understands the differences between product, UX, brand, and content design — and targets roles where your portfolio will resonate.",
      },
      {
        title: "Warm intros to design leaders",
        desc: "Direct outreach to design directors and managers, where the actual hiring decisions get made — not just generic recruiters.",
      },
      {
        title: "Portfolio framing and prep",
        desc: "Help framing case studies in the way each company expects — process, decisions, tradeoffs, impact — and prep for whiteboard and live design exercises.",
      },
    ],
    targetTitles: [
      "Product Designer",
      "Senior Product Designer",
      "Staff Product Designer",
      "UX Designer",
      "UX Researcher",
      "UI Designer",
      "Brand Designer",
      "Design Lead",
      "Design Director",
    ],
  },
  {
    slug: "engineering-managers",
    role: "engineering manager",
    rolePlural: "engineering managers",
    metaTitle: "Job Search Service for Engineering Managers | JobGenius",
    metaDescription:
      "JobGenius runs EM job searches end-to-end — targeted applications, warm intros to VPs and Directors of Engineering, and prep for behavioral, system design, and people-management interviews.",
    heroTitle: "A managed job search built for engineering managers",
    heroSubtitle:
      "Targeted applications, warm intros to VPs and Directors of Engineering, and prep for the behavioral, system-design, and people-management rounds that decide EM offers.",
    painPoints: [
      {
        title: "EM searches take 4-6 months on average",
        desc: "Engineering management is brutally competitive — fewer openings than IC roles, more candidates per opening, and slower interview loops.",
      },
      {
        title: "Resume needs to read both technical and managerial",
        desc: "Too IC-heavy and you read as a senior engineer, not an EM. Too people-heavy and you read as having lost the technical depth. The balance is hard.",
      },
      {
        title: "Behavioral rounds make or break offers",
        desc: "Most EM rounds are 60%+ behavioral. Generic answers about “leading through change” don’t differentiate strong candidates from average ones.",
      },
    ],
    whyJobGenius: [
      {
        title: "EM-savvy account managers",
        desc: "Your AM understands the differences between line management, group management, and director-level roles — and targets accordingly.",
      },
      {
        title: "Direct intros to engineering leaders",
        desc: "Warm outreach to VPs and Directors of Engineering, where EM hiring decisions actually get made.",
      },
      {
        title: "Behavioral and system-design prep that compounds",
        desc: "Targeted practice for the behavioral STAR rounds, technical system-design discussions, and people-management scenarios that decide EM offers.",
      },
    ],
    targetTitles: [
      "Engineering Manager",
      "Senior Engineering Manager",
      "Group Engineering Manager",
      "Director of Engineering",
      "Head of Engineering",
      "VP of Engineering",
      "Engineering Lead",
    ],
  },
  {
    slug: "customer-success",
    role: "customer success professional",
    rolePlural: "customer success professionals",
    metaTitle: "Job Search Service for Customer Success Professionals | JobGenius",
    metaDescription:
      "JobGenius runs your CS job search — targeted applications, warm intros to CS leaders, and prep for the renewal, retention, and case-study interviews that decide offers.",
    heroTitle: "A managed job search built for customer success",
    heroSubtitle:
      "Targeted applications, warm intros to CS leaders, and prep for the renewal, retention, and case-study interviews — across CSM, CS ops, and CS leadership roles.",
    painPoints: [
      {
        title: "CS roles span 10x in scope and pay",
        desc: "From SMB CSM to enterprise CS to CS leadership — the work and pay differ wildly. Applying broadly without a target is the slow path.",
      },
      {
        title: "NRR and renewal numbers carry the resume",
        desc: "Recruiters scan for specific metrics — gross retention, net retention, expansion rates. Without numbers, even strong candidates get filtered out.",
      },
      {
        title: "Process is opaque from outside",
        desc: "CS hiring often involves case studies and role-plays that vary widely by company. Self-prep against the wrong format burns time.",
      },
    ],
    whyJobGenius: [
      {
        title: "CS-savvy account managers",
        desc: "Your AM understands the differences between SMB, mid-market, and enterprise CS — and targets the right segment and motion.",
      },
      {
        title: "Direct intros to CS leaders",
        desc: "Warm outreach to heads of CS and VPs of customer experience, where most hiring decisions actually get made.",
      },
      {
        title: "Case study and role-play prep",
        desc: "Tailored practice for the renewal conversation role-plays, escalation case studies, and retention strategy interviews that decide CS offers.",
      },
    ],
    targetTitles: [
      "Customer Success Manager",
      "Senior CSM",
      "Enterprise CSM",
      "CS Operations Manager",
      "Director of Customer Success",
      "VP of Customer Success",
      "Customer Experience Manager",
      "Account Manager",
    ],
  },
  {
    slug: "consultants",
    role: "consultant",
    rolePlural: "consultants",
    metaTitle: "Job Search Service for Consultants | JobGenius",
    metaDescription:
      "JobGenius runs your consulting job search — targeted applications, warm intros to firm partners and exit-opportunity employers, and prep for case interviews and PEI rounds.",
    heroTitle: "A managed job search built for consultants",
    heroSubtitle:
      "Targeted applications, warm intros to firm partners and exit-opportunity employers, and prep for the case interviews and PEI rounds that decide consulting offers.",
    painPoints: [
      {
        title: "Case prep is a full-time job in itself",
        desc: "Cases take dozens of hours of practice to do well. Self-prep without feedback often misses the structuring and synthesis that decide offers.",
      },
      {
        title: "Exit opportunities require different positioning",
        desc: "Moving from consulting to industry — corporate strategy, PE, operating roles — needs a completely different resume and narrative than another consulting role.",
      },
      {
        title: "Networking is the real game",
        desc: "Top firms and prime exit opportunities run on referrals. Without warm intros, even strong candidates compete against everyone else in the cold-application queue.",
      },
    ],
    whyJobGenius: [
      {
        title: "Consulting-savvy account managers",
        desc: "Your AM understands MBB vs. tier-2 vs. boutique, and the typical exit paths — corp strategy, PE, ops, in-house consulting — to target appropriately.",
      },
      {
        title: "Direct intros to partners and exit employers",
        desc: "Warm outreach to firm partners and the hiring leaders at common exit destinations — where decisions actually get made.",
      },
      {
        title: "Case and PEI prep with structured feedback",
        desc: "Targeted practice for market sizing, profitability, M&A, and growth cases, plus the personal experience interview rounds that often decide between equally strong cases.",
      },
    ],
    targetTitles: [
      "Consultant",
      "Senior Consultant",
      "Engagement Manager",
      "Associate / Senior Associate",
      "Principal",
      "Partner",
      "Strategy Consultant",
      "Corporate Strategy",
      "In-House Consultant",
    ],
  },
  {
    slug: "program-managers",
    role: "program manager",
    rolePlural: "program managers",
    metaTitle: "Job Search Service for Program & Project Managers | JobGenius",
    metaDescription:
      "JobGenius runs your program management job search — targeted applications, warm intros to PMO and operations leaders, and prep for behavioral and case-style interviews.",
    heroTitle: "A managed job search built for program & project managers",
    heroSubtitle:
      "Targeted applications, warm intros to PMO and operations leaders, and prep for the behavioral and case-style interviews that decide PM offers — across TPM, PgM, and PMO roles.",
    painPoints: [
      {
        title: "Title overlap with product management is constant",
        desc: "Program Manager, Project Manager, Product Manager, TPM — recruiters often miscategorize. Easy to end up in the wrong queue without focused targeting.",
      },
      {
        title: "Impact is often invisible from outside",
        desc: "Program managers run the work behind the work. Translating coordination, risk management, and cross-functional delivery into resume bullets is hard.",
      },
      {
        title: "Behavioral rounds dominate the loop",
        desc: "Most PM interviews are 70%+ behavioral. Generic answers about “leading cross-functional teams” sound like every other candidate.",
      },
    ],
    whyJobGenius: [
      {
        title: "Program-savvy account managers",
        desc: "Your AM understands TPM vs. PgM vs. PMO vs. project management — and targets the roles where your specific track record will land.",
      },
      {
        title: "Direct intros to PMO and operations leaders",
        desc: "Warm outreach to heads of PMO, VPs of operations, and engineering directors — the people who make program management hiring decisions.",
      },
      {
        title: "Behavioral interview prep with strong stories",
        desc: "Help building STAR stories that show genuine ownership, judgment, and impact — not just “facilitated standups.”",
      },
    ],
    targetTitles: [
      "Program Manager",
      "Senior Program Manager",
      "Technical Program Manager",
      "Project Manager",
      "Senior Project Manager",
      "PMO Lead",
      "Director of Program Management",
      "Head of Operations",
    ],
  },
  {
    slug: "recent-graduates",
    role: "recent graduate",
    rolePlural: "recent graduates",
    metaTitle: "Job Search Service for Recent Graduates & Early Career | JobGenius",
    metaDescription:
      "JobGenius runs your early-career job search — targeted applications, warm intros to entry-level recruiters, and prep for the behavioral and technical interviews that decide first-job offers.",
    heroTitle: "A managed job search built for recent graduates",
    heroSubtitle:
      "Targeted applications, warm intros to entry-level recruiters, and prep for the behavioral and technical interviews — built for new grads and early-career candidates entering the workforce.",
    painPoints: [
      {
        title: "Entry-level postings get 500+ applications each",
        desc: "Without industry experience to differentiate, new grads compete on volume in the most flooded part of the market. Standing out requires more than just applying.",
      },
      {
        title: "Resumes read as “not enough”",
        desc: "Recruiters scan for experience that proves capability. With limited work history, the resume has to lean harder on projects, internships, and quantified school work.",
      },
      {
        title: "Networking feels impossible without a network",
        desc: "“Just network more” is useless advice when you’re 22 and don’t know anyone in industry. Cold outreach needs more structure to work for new grads.",
      },
    ],
    whyJobGenius: [
      {
        title: "Early-career-savvy account managers",
        desc: "Your AM understands what new-grad recruiters actually screen for — and helps position your projects, internships, and academic work to match.",
      },
      {
        title: "Warm intros and structured outreach",
        desc: "Direct outreach to entry-level recruiters and team leads who hire new grads, plus structured outreach campaigns that work even without an existing network.",
      },
      {
        title: "Behavioral and technical prep for first interviews",
        desc: "Targeted practice for the behavioral STAR rounds, case interviews, and technical screens that decide first-job offers — including the recruiter phone screens that filter most candidates out.",
      },
    ],
    targetTitles: [
      "New Graduate Engineer",
      "Associate Product Manager",
      "Business Analyst (Entry)",
      "Marketing Associate",
      "Operations Associate",
      "Investment Banking Analyst",
      "Consulting Analyst",
      "Rotational Program",
      "Entry-Level Data Analyst",
    ],
  },
];

export function getRole(slug: string): RolePage | undefined {
  return ROLES.find((r) => r.slug === slug);
}
