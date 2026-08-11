import type { Metadata } from "next";
import { getPublicCapacitySummary } from "@/lib/intake";
import MarketingShell from "../components/MarketingShell";
import PageHero from "../components/PageHero";
import { breadcrumbJsonLd } from "../components/breadcrumb";
import {
  GuaranteesSection,
  PrePaymentSection,
  PricingSection,
  StatsSection,
  TestimonialsSection,
  WhyTrustSection,
  FinalCtaSection,
} from "../components/homepage";

const title = "Pricing: Essentials $300 / Premium $600 + 5% Success Fee";
const description =
  "Transparent JobGenius pricing. Creating an account is free. Activate Essentials at $300 or Premium at $600, with a 5% success fee only after you receive and accept an offer.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/pricing" },
  openGraph: { title, description, url: "/pricing", type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export const dynamic = "force-dynamic";

const productJsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "JobGenius Managed Job Search",
  description,
  brand: { "@type": "Brand", name: "JobGenius" },
  offers: [
    {
      "@type": "Offer",
      name: "Essentials",
      description:
        "Consistent role-matched applications, guided outreach support, dedicated account manager support, and campaign visibility.",
      price: "300",
      priceCurrency: "USD",
      url: "https://job-genius.com/pricing",
      availability: "https://schema.org/InStock",
    },
    {
      "@type": "Offer",
      name: "Premium",
      description:
        "Higher-touch campaign execution with priority outreach support, interview preparation, and dedicated account manager support.",
      price: "600",
      priceCurrency: "USD",
      url: "https://job-genius.com/pricing",
      availability: "https://schema.org/InStock",
    },
  ],
};

const breadcrumb = breadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "Pricing", path: "/pricing" },
]);

export default async function PricingPage() {
  const capacitySummary = await getPublicCapacitySummary();

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <PageHero
        eyebrow="Pricing"
        title="Free account first. Paid campaign activation only when you decide to move forward."
        subtitle="Review your fit, strategy direction, and service boundaries before you activate a managed Job Search Campaign. The 5% success fee is only due after an accepted offer."
        secondaryCta={{ href: "/how-it-works", label: "How It Works" }}
      />
      <PrePaymentSection />
      <PricingSection capacitySummary={capacitySummary} />
      <GuaranteesSection />
      <StatsSection />
      <WhyTrustSection />
      <TestimonialsSection />
      <FinalCtaSection capacitySummary={capacitySummary} />
    </MarketingShell>
  );
}
