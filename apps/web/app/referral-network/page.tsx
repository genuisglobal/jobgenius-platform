import type { Metadata } from "next";
import MarketingShell from "../components/MarketingShell";
import PageHero from "../components/PageHero";
import { breadcrumbJsonLd } from "../components/breadcrumb";
import {
  ReferralSection,
  NetworkSection,
  StatsSection,
  FinalCtaSection,
} from "../components/homepage";

const title = "Referral Network: Get Jobs Before They Hit Job Boards";
const description =
  "JobGenius taps a curated referral network to surface opportunities before they're publicly posted. Warm intros from real people beat cold applications every time.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/referral-network" },
  openGraph: { title, description, url: "/referral-network", type: "article" },
  twitter: { card: "summary_large_image", title, description },
};

const breadcrumb = breadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "Referral Network", path: "/referral-network" },
]);

export default function ReferralNetworkPage() {
  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <PageHero
        eyebrow="Referral Network"
        title="The best jobs never make it to job boards"
        subtitle="JobGenius surfaces opportunities through a curated referral network and warm recruiter outreach — so you skip the cold-application queue and land in the right pile."
        secondaryCta={{ href: "/pricing", label: "See Pricing" }}
      />
      <ReferralSection />
      <NetworkSection />
      <StatsSection />
      <FinalCtaSection />
    </MarketingShell>
  );
}
