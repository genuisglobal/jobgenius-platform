import type { Metadata } from "next";
import MarketingShell from "../components/MarketingShell";
import PageHero from "../components/PageHero";
import { breadcrumbJsonLd } from "../components/breadcrumb";
import {
  HowItWorksSection,
  AiHumanSection,
  StatsSection,
  FinalCtaSection,
} from "../components/homepage";

const title = "How JobGenius Works: Human-Guided and AI-Assisted Job Search Support";
const description =
  "See how JobGenius supports your job search with structured planning, role-matched applications, recruiter outreach support, and interview preparation led by a human account manager with AI assistance.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/how-it-works" },
  openGraph: {
    title,
    description,
    url: "/how-it-works",
    type: "article",
  },
  twitter: { card: "summary_large_image", title, description },
};

const howToJsonLd = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How JobGenius supports your job search",
  description,
  step: [
    {
      "@type": "HowToStep",
      position: 1,
      name: "You tell us what you want",
      text: "Upload your resume, share your target roles, salary range, and preferences. Your account manager reviews everything and builds a personalized search strategy.",
    },
    {
      "@type": "HowToStep",
      position: 2,
      name: "We run the campaign with you",
      text: "Our AI keeps surfacing opportunities while your account manager manages applications, recruiter outreach, and pipeline follow-through using your approved search direction.",
    },
    {
      "@type": "HowToStep",
      position: 3,
      name: "You prepare for interviews",
      text: "When interviews begin, we support preparation with coaching, company-specific questions, and practice sessions so you can show up ready.",
    },
  ],
};

const breadcrumb = breadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "How It Works", path: "/how-it-works" },
]);

export default function HowItWorksPage() {
  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <PageHero
        eyebrow="How It Works"
        title="A managed campaign, not a job-offer promise"
        subtitle="JobGenius pairs always-on AI with a dedicated human account manager. You set the direction, we help run the search with more structure, consistency, and visibility."
        secondaryCta={{ href: "/pricing", label: "See Pricing" }}
      />
      <HowItWorksSection />
      <AiHumanSection />
      <StatsSection />
      <FinalCtaSection />
    </MarketingShell>
  );
}
