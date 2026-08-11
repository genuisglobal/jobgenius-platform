export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  updatedAt?: string;
  author: string;
  readMinutes: number;
  tags: string[];
};

export const POSTS: BlogPost[] = [
  {
    slug: "beat-the-ats-resume-guide-2026",
    title: "How to Beat the ATS: A Practical Resume Guide for 2026",
    description:
      "Applicant Tracking Systems screen out 70%+ of resumes before a human sees them. Here's exactly how ATS parsers work and what to change in your resume so yours actually lands in the recruiter's queue.",
    publishedAt: "2026-04-15",
    updatedAt: "2026-05-10",
    author: "JobGenius Team",
    readMinutes: 8,
    tags: ["resume", "ats", "job-search"],
  },
  {
    slug: "salary-negotiation-guide",
    title: "Salary Negotiation: How to Get 10-20% More on Your Next Offer",
    description:
      "Most candidates leave money on the table because they accept the first offer. Here's a step-by-step negotiation playbook with exact scripts for the moments that matter.",
    publishedAt: "2026-04-22",
    author: "JobGenius Team",
    readMinutes: 10,
    tags: ["salary", "negotiation", "offer"],
  },
  {
    slug: "cold-recruiter-outreach-templates",
    title: "Cold Outreach to Recruiters: Templates That Actually Get Replies",
    description:
      "Cold InMails and emails to recruiters have abysmal reply rates — usually because they're forgettable. Here are five templates that consistently land replies, with breakdowns of why each one works.",
    publishedAt: "2026-04-29",
    author: "JobGenius Team",
    readMinutes: 7,
    tags: ["outreach", "recruiters", "networking"],
  },
  {
    slug: "why-job-applications-get-ghosted",
    title: "Why Your Job Applications Aren't Getting Responses (And How to Fix It)",
    description:
      "Send 100 applications, hear back from 2. Sound familiar? Here are the five real reasons applications get ghosted and what to do about each one.",
    publishedAt: "2026-05-06",
    author: "JobGenius Team",
    readMinutes: 9,
    tags: ["job-search", "applications", "career"],
  },
  {
    slug: "linkedin-profile-optimization",
    title: "LinkedIn Profile Optimization: 12 Changes That Get You Found",
    description:
      "Recruiters spend 80% of their sourcing time on LinkedIn. Here are 12 specific changes — headline, About, keywords, photo, settings — that make your profile show up in the searches that matter.",
    publishedAt: "2026-05-08",
    author: "JobGenius Team",
    readMinutes: 8,
    tags: ["linkedin", "personal-brand", "job-search"],
  },
  {
    slug: "star-method-behavioral-interview-guide",
    title: "The Behavioral Interview Cheat Sheet (STAR Method Done Right)",
    description:
      "Every interview now includes 'Tell me about a time when...' — and most answers ramble. Here's how to use the STAR method to deliver answers that consistently land, with examples for each common prompt.",
    publishedAt: "2026-05-09",
    author: "JobGenius Team",
    readMinutes: 9,
    tags: ["interview", "behavioral", "star-method"],
  },
  {
    slug: "career-change-roadmap",
    title: "Career Change at 30, 40, or 50: A Realistic Roadmap",
    description:
      "Switching industries or functions is one of the hardest moves in a career. Here's a practical 6-month roadmap covering skill bridges, narrative-building, and the specific outreach moves that actually open doors.",
    publishedAt: "2026-05-10",
    author: "JobGenius Team",
    readMinutes: 10,
    tags: ["career-change", "career", "strategy"],
  },
  {
    slug: "job-search-while-employed",
    title: "Job Searching While Employed: How to Keep It Quiet",
    description:
      "Searching for a new job while you have a current one is a tightrope walk. Here's how to manage LinkedIn settings, interview scheduling, references, and the conversations that come up — without your current boss finding out.",
    publishedAt: "2026-05-11",
    author: "JobGenius Team",
    readMinutes: 7,
    tags: ["job-search", "career", "strategy"],
  },
  {
    slug: "phone-screen-survival-guide",
    title: "Phone Screen Survival Guide: What to Expect and How to Pass",
    description:
      "The 30-minute phone screen is where 60% of candidates get cut. Here's exactly what recruiters listen for, the questions they ask, and how to handle the salary conversation without giving up leverage.",
    publishedAt: "2026-05-12",
    author: "JobGenius Team",
    readMinutes: 7,
    tags: ["interview", "phone-screen", "recruiters"],
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}
