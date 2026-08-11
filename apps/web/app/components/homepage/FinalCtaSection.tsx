import Link from "next/link";
import CapacityNotice, { type CapacityNoticeSummary } from "../CapacityNotice";
import ScrollReveal from "../ScrollReveal";

export default function FinalCtaSection({
  capacitySummary,
}: {
  capacitySummary?: CapacityNoticeSummary | null;
}) {
  return (
    <section className="py-20 sm:py-28 bg-gray-900 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-5">
        <div className="absolute top-0 right-0 w-96 h-96 bg-violet-400 rounded-full translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-orange-400 rounded-full -translate-x-1/2 translate-y-1/2" />
      </div>
      <ScrollReveal>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl text-center relative">
          {capacitySummary && (
            <CapacityNotice
              summary={capacitySummary}
              variant="dark"
              compact
              className="mb-6 text-left"
            />
          )}
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Ready to start with a clearer job-search plan?
          </h2>
          <p className="text-lg text-gray-400 mb-8 max-w-xl mx-auto">
            Upload your resume, tell us your targets, and let a dedicated
            search owner take it from there. Creating an account is free, and
            paid campaign activation starts at $300 with the success fee only
            due after an accepted offer.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-6">
            <Link
              href="/signup"
              className="inline-block bg-orange-500 text-white px-10 py-4 rounded-xl font-semibold text-lg hover:bg-orange-600 transition-all shadow-lg shadow-orange-900/30 hover:shadow-xl"
            >
              Start Your Setup
            </Link>
            <Link
              href="/referral-network"
              className="inline-block bg-white/10 text-white px-10 py-4 rounded-xl font-semibold text-lg hover:bg-white/20 transition-all border border-white/20"
            >
              See Referral Network
            </Link>
          </div>
          <p className="text-sm text-gray-500">
            Clear service agreement before activation. Success fee only on accepted offers.
          </p>
        </div>
      </ScrollReveal>
    </section>
  );
}
