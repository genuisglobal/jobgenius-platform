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
import {
  LAUNCH_PRICING_END_LABEL,
  PRICING_PLANS,
  currentSetupFeeUsd,
  isLaunchPricingActive,
} from "../components/homepage/marketingContent";

// Prices come from PRICING_PLANS so the launch → list switch on Jan 1 needs no edit here.
function pricingCopy() {
  const [essentials, premium] = PRICING_PLANS;
  const e = currentSetupFeeUsd(essentials);
  const p = currentSetupFeeUsd(premium);
  const launch = isLaunchPricingActive();
  const title = `Pricing: Essentials $${e} / Premium $${p}${launch ? " Launch Pricing" : ""} + 5% Success Fee`;
  const description = `Transparent JobGenius pricing. Creating an account is free. Activate Essentials at $${e} or Premium at $${p}${
    launch ? ` (launch pricing through ${LAUNCH_PRICING_END_LABEL})` : ""
  }, with a 5% success fee only after you receive and accept an offer.`;
  return { title, description, launch };
}

export function generateMetadata(): Metadata {
  const { title, description } = pricingCopy();
  return {
    title,
    description,
    alternates: { canonical: "/pricing" },
    openGraph: { title, description, url: "/pricing", type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export const dynamic = "force-dynamic";

const OFFER_DESCRIPTIONS: Record<string, string> = {
  "Essentials": "Consistent role-matched applications, guided outreach support, dedicated account manager support, and campaign visibility.",
  "Premium": "Higher-touch campaign execution with priority outreach support, interview preparation, and dedicated account manager support."
};

function productJsonLd() {
  const { description, launch } = pricingCopy();
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "JobGenius Managed Job Search",
    description,
    brand: { "@type": "Brand", name: "JobGenius" },
    offers: PRICING_PLANS.map((plan) => ({
      "@type": "Offer",
      name: plan.name,
      description: OFFER_DESCRIPTIONS[plan.name],
      price: String(currentSetupFeeUsd(plan)),
      priceCurrency: "USD",
      ...(launch ? { priceValidUntil: "2026-12-31" } : {}),
      url: "https://job-genius.com/pricing",
      availability: "https://schema.org/InStock",
    })),
  };
}

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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <PageHero
        eyebrow="Pricing"
        title="Free account first. Paid campaign activation only when you decide to move forward."
        subtitle="Review your fit, strategy direction, and service boundaries before you activate a managed Job Search Campaign. The 5% success fee only applies after you accept an offer and is due within two months of your start date."
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
