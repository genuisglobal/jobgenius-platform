import type { Metadata } from "next";
import MarketingShell from "../components/MarketingShell";
import PageHero from "../components/PageHero";

export const metadata: Metadata = {
  title: "Refund and Cancellation Policy | JobGenius",
  description:
    "Overview placeholder for JobGenius refund and cancellation terms. Replace with reviewed policy language.",
};

export default function RefundPolicyPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="Policy"
        title="Refund and Cancellation Policy"
        subtitle="This page is a public placeholder for JobGenius refund and cancellation terms and should be replaced with reviewed legal language."
      />
      <section className="py-16 sm:py-20">
        <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-bold text-gray-900">Public placeholder</h2>
            <div className="mt-6 space-y-4 text-sm leading-7 text-gray-700">
              <p>
                This policy should explain when campaign work is considered active, whether any
                portion of the Campaign Setup & Execution Fee is refundable, how cancellation
                requests are handled, and what happens to the success fee after an accepted offer.
              </p>
              <p>
                Replace this summary with reviewed policy language before using it as the final public
                policy page.
              </p>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
