import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPublicCapacitySummary } from "@/lib/intake";
import MarketingShell from "./components/MarketingShell";
import { FAQS } from "./components/faqs";
import {
  HeroSection,
  CompaniesStrip,
  PainPointSection,
  HowItWorksSection,
  WhatWeDoSection,
  StatsSection,
  RolePathsSection,
  AiHumanSection,
  InterviewPrepSection,
  ReferralSection,
  NetworkSection,
  PrePaymentSection,
  PricingSection,
  GuaranteesSection,
  WhyTrustSection,
  TestimonialsSection,
  FaqSection,
  FinalCtaSection,
} from "./components/homepage";

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default async function HomePage() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("jg_access_token")?.value;
  const userType = cookieStore.get("jg_user_type")?.value;

  if (accessToken) {
    if (userType === "job_seeker") {
      redirect("/portal");
    }
    redirect("/dashboard");
  }

  const capacitySummary = await getPublicCapacitySummary();

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <HeroSection capacitySummary={capacitySummary} />
      <CompaniesStrip />
      <PainPointSection />
      <HowItWorksSection />
      <WhatWeDoSection />
      <StatsSection />
      <RolePathsSection />
      <AiHumanSection />
      <InterviewPrepSection />
      <ReferralSection />
      <NetworkSection />
      <PrePaymentSection />
      <PricingSection capacitySummary={capacitySummary} />
      <GuaranteesSection />
      <WhyTrustSection />
      <TestimonialsSection />
      <FaqSection />
      <FinalCtaSection capacitySummary={capacitySummary} />
    </MarketingShell>
  );
}
