import type { Metadata } from "next";
import MarketingShell from "../components/MarketingShell";
import PageHero from "../components/PageHero";
import { breadcrumbJsonLd } from "../components/breadcrumb";
import {
  WhatWeDoSection,
  HowItWorksSection,
  AiHumanSection,
  PainPointSection,
  FinalCtaSection,
} from "../components/homepage";

const title = "What JobGenius Does: Applications, Outreach, and Interview Prep";
const description =
  "Everything JobGenius runs for you — job applications, recruiter outreach, referral introductions, interview coaching, offer negotiation. Real people doing the work, AI doing the search.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/what-we-do" },
  openGraph: { title, description, url: "/what-we-do", type: "article" },
  twitter: { card: "summary_large_image", title, description },
};

const breadcrumb = breadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "What We Do", path: "/what-we-do" },
]);

export default function WhatWeDoPage() {
  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <PageHero
        eyebrow="What We Do"
        title="The full job search — handled"
        subtitle="From the first matched listing to the signed offer, JobGenius runs every step. You stay in the loop through a real-time portal and only step in when an interview is on the table."
        secondaryCta={{ href: "/how-it-works", label: "How It Works" }}
      />
      <WhatWeDoSection />
      <PainPointSection />
      <HowItWorksSection />
      <AiHumanSection />
      <FinalCtaSection />
    </MarketingShell>
  );
}
