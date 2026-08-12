import type { Metadata } from "next";
import MarketingShell from "../components/MarketingShell";
import PageHero from "../components/PageHero";

export const metadata: Metadata = {
  title: "Terms of Service | JobGenius",
  description:
    "Overview placeholder for JobGenius website and service terms. Replace with reviewed legal terms.",
};

export default function TermsPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="Terms"
        title="Terms of Service"
        subtitle="This page is a public placeholder for JobGenius service terms and should be replaced with reviewed legal language."
      />
      <section className="py-16 sm:py-20">
        <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-bold text-gray-900">Public placeholder</h2>
            <div className="mt-6 space-y-4 text-sm leading-7 text-gray-700">
              <p>
                JobGenius provides managed job-search support, platform tools, recruiter coordination,
                and career services subject to service boundaries, candidate responsibilities, and
                payment terms.
              </p>
              <p>
                This page should be replaced with reviewed terms covering acceptable use, payment
                obligations, success-fee triggers, account use, service limitations, dispute handling,
                and governing law.
              </p>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
