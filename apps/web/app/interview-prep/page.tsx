import type { Metadata } from "next";
import MarketingShell from "../components/MarketingShell";
import PageHero from "../components/PageHero";
import { breadcrumbJsonLd } from "../components/breadcrumb";
import {
  InterviewPrepSection,
  AiHumanSection,
  TestimonialsSection,
  FinalCtaSection,
} from "../components/homepage";

const title = "AI Interview Prep: Voice Coaching, Company-Specific Questions";
const description =
  "JobGenius prepares you for every interview with AI voice practice, company-specific question banks, and personalized coaching from your account manager. Walk in confident and ready.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/interview-prep" },
  openGraph: { title, description, url: "/interview-prep", type: "article" },
  twitter: { card: "summary_large_image", title, description },
};

const serviceJsonLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  serviceType: "AI Interview Preparation Coaching",
  name: "JobGenius Interview Prep",
  description,
  provider: {
    "@type": "Organization",
    name: "JobGenius",
    url: "https://job-genius.com",
  },
  areaServed: "Worldwide",
};

const breadcrumb = breadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "Interview Prep", path: "/interview-prep" },
]);

export default function InterviewPrepPage() {
  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <PageHero
        eyebrow="Interview Prep"
        title="Show up to every interview already prepared"
        subtitle="AI voice practice, company-specific question banks, and live coaching from your account manager — so you go in confident and walk out with offers."
        secondaryCta={{ href: "/how-it-works", label: "How It Works" }}
      />
      <InterviewPrepSection />
      <AiHumanSection />
      <TestimonialsSection />
      <FinalCtaSection />
    </MarketingShell>
  );
}
