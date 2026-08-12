import type { Metadata } from "next";
import MarketingShell from "../components/MarketingShell";
import PageHero from "../components/PageHero";

export const metadata: Metadata = {
  title: "Service Agreement | JobGenius",
  description:
    "Overview placeholder for the JobGenius candidate service agreement. Replace with reviewed agreement language.",
};

export default function ServiceAgreementPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="Agreement"
        title="Service Agreement / Candidate Agreement"
        subtitle="This page is a public placeholder for the candidate-facing JobGenius service agreement and should be replaced with reviewed legal language."
      />
      <section className="py-16 sm:py-20">
        <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-bold text-gray-900">Public placeholder</h2>
            <div className="mt-6 space-y-4 text-sm leading-7 text-gray-700">
              <p>
                The candidate service agreement should explain campaign scope, the Campaign Setup &
                Execution Fee, the accepted-offer success fee trigger, candidate responsibilities,
                pause or cancellation handling, and service boundaries.
              </p>
              <p>
                This placeholder exists so public trust links resolve cleanly until the reviewed
                agreement text is finalized.
              </p>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
