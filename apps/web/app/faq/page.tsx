import type { Metadata } from "next";
import MarketingShell from "../components/MarketingShell";
import PageHero from "../components/PageHero";
import { breadcrumbJsonLd } from "../components/breadcrumb";
import { FAQS } from "../components/faqs";
import { FaqSection, FinalCtaSection } from "../components/homepage";

const title = "JobGenius FAQ: Pricing, Process, and Service Boundaries";
const description =
  "Answers to the questions job seekers ask most about JobGenius: pricing, success fees, process, timing, service boundaries, and how managed search support works.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/faq" },
  openGraph: { title, description, url: "/faq", type: "article" },
  twitter: { card: "summary_large_image", title, description },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

const breadcrumb = breadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "FAQ", path: "/faq" },
]);

export default function FaqPage() {
  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <PageHero
        eyebrow="FAQ"
        title="Common questions, answered plainly"
        subtitle="Pricing, timing, service boundaries, and exactly what your account manager handles - straight answers to what people ask before signing up."
        secondaryCta={{ href: "/pricing", label: "See Pricing" }}
      />
      <FaqSection />
      <FinalCtaSection />
    </MarketingShell>
  );
}
