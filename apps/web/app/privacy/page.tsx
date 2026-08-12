import type { Metadata } from "next";
import MarketingShell from "../components/MarketingShell";
import PageHero from "../components/PageHero";

export const metadata: Metadata = {
  title: "Privacy Policy | JobGenius",
  description:
    "Overview placeholder for how JobGenius handles candidate, recruiter, and website data. Replace with reviewed privacy policy text.",
};

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="Privacy"
        title="Privacy Policy"
        subtitle="This page is a public placeholder for JobGenius privacy terms and should be replaced with reviewed legal language."
      />
      <section className="py-16 sm:py-20">
        <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-bold text-gray-900">Public placeholder</h2>
            <div className="mt-6 space-y-4 text-sm leading-7 text-gray-700">
              <p>
                JobGenius collects website, lead-intake, candidate, recruiter, and service-delivery
                information to support consultations, managed job-search campaigns, platform access,
                and internal operations.
              </p>
              <p>
                This page should be replaced with reviewed privacy language covering data collection,
                storage, retention, third-party providers, candidate consent, and data-subject rights.
              </p>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
