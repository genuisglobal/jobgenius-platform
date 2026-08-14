import Link from "next/link";
import CapacityNotice, { type CapacityNoticeSummary } from "../CapacityNotice";
import ScrollReveal from "../ScrollReveal";
import {
  CAMPAIGN_FEE_LABEL,
  FREE_ACCOUNT_PRICING_MESSAGE,
  PRICING_PLANS,
  SUCCESS_FEE_SUMMARY,
} from "./marketingContent";

function PricingItem({
  included,
  text,
  light,
}: {
  included: boolean;
  text: string;
  light?: boolean;
}) {
  return (
    <li className="flex items-start gap-3">
      {included ? (
        <svg
          className={`mt-0.5 h-5 w-5 shrink-0 ${light ? "text-orange-300" : "text-violet-600"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg
          className="mt-0.5 h-5 w-5 shrink-0 text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      <span className={light ? "text-violet-100" : included ? "text-gray-700" : "text-gray-400"}>
        {text}
      </span>
    </li>
  );
}

function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function PricingSection({
  capacitySummary,
}: {
  capacitySummary?: CapacityNoticeSummary | null;
}) {
  const [essentials, premium] = PRICING_PLANS;

  return (
    <section id="pricing" className="py-20 sm:py-28">
      <ScrollReveal>
        <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <p className="mb-3 text-center text-sm font-semibold uppercase tracking-wider text-violet-600">
            Pricing
          </p>
          <h2 className="mb-4 text-center text-3xl font-bold text-gray-900 sm:text-4xl">
            Clear pricing for a managed job search campaign
          </h2>
          <p className="mx-auto mb-8 max-w-3xl text-center text-gray-500">
            Free account creation comes first. Paid campaign activation only starts when you decide
            to move forward after review and strategy planning.
          </p>

          {capacitySummary && (
            <CapacityNotice
              summary={capacitySummary}
              variant="outline"
              compact
              className="mx-auto mb-8 max-w-2xl"
            />
          )}

          <div className="mx-auto mb-8 max-w-4xl rounded-3xl border border-violet-200 bg-violet-50 px-6 py-5 text-center">
            <p className="text-sm font-semibold text-violet-900">{FREE_ACCOUNT_PRICING_MESSAGE}</p>
          </div>

          <div className="mx-auto mb-10 grid max-w-4xl gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Step 1
              </p>
              <h3 className="mt-2 text-lg font-semibold text-gray-900">Create your free account</h3>
              <p className="mt-2 text-sm leading-6 text-gray-700">
                Resume upload, qualification, and the 7-day strategy preview happen before any paid
                campaign activation.
              </p>
            </div>
            <div className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">
                Step 2
              </p>
              <h3 className="mt-2 text-lg font-semibold text-gray-900">Activate a managed campaign</h3>
              <p className="mt-2 text-sm leading-6 text-gray-700">
                Choose the level of campaign support you want and pay the success fee only after an
                accepted offer.
              </p>
            </div>
          </div>

          <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-2">
            <div className="relative flex flex-col rounded-2xl border-2 border-gray-200 bg-white p-8 transition-all hover:border-violet-200 hover:shadow-lg">
              <div className="absolute right-4 top-4 rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-800">
                {essentials.badge}
              </div>
              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-900">{essentials.name}</h3>
                <p className="mt-1 text-sm text-gray-500">{essentials.description}</p>
              </div>
              <div className="mb-6 rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                  {CAMPAIGN_FEE_LABEL}
                </p>
                <p className="mt-2 text-4xl font-extrabold text-gray-900">
                  {formatUsd(essentials.setupFeeUsd)}
                </p>
                <p className="mt-3 text-sm font-medium text-violet-700">
                  Success Fee: 5% of first-year base salary
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  Only due after the candidate receives and accepts an offer.
                </p>
              </div>
              <ul className="mb-8 flex-1 space-y-3">
                {essentials.features.map((feature) => (
                  <PricingItem key={feature} included text={feature} />
                ))}
                {essentials.exclusions.map((feature) => (
                  <PricingItem key={feature} included={false} text={feature} />
                ))}
              </ul>
              <Link
                href="/signup"
                className="block rounded-xl border-2 border-violet-600 bg-white px-6 py-3 text-center font-semibold text-violet-700 transition-colors hover:bg-violet-50"
              >
                Start with Essentials
              </Link>
            </div>

            <div className="relative flex flex-col overflow-hidden rounded-2xl bg-gradient-to-b from-violet-600 to-violet-700 p-8 text-white shadow-xl shadow-violet-200">
              <div className="absolute right-4 top-4 flex flex-wrap justify-end gap-2">
                <div className="rounded-full bg-orange-500 px-3 py-1 text-xs font-bold text-white">
                  MOST POPULAR
                </div>
                <div className="rounded-full border border-white/20 bg-white/15 px-3 py-1 text-xs font-bold text-orange-200">
                  {premium.badge}
                </div>
              </div>
              <div className="mb-6">
                <h3 className="text-lg font-bold">{premium.name}</h3>
                <p className="mt-1 text-sm text-violet-200">{premium.description}</p>
              </div>
              <div className="mb-6 rounded-2xl border border-white/20 bg-white/10 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-200">
                  {CAMPAIGN_FEE_LABEL}
                </p>
                <p className="mt-2 text-4xl font-extrabold">{formatUsd(premium.setupFeeUsd)}</p>
                <p className="mt-3 text-sm font-medium text-orange-200">
                  Success Fee: 5% of first-year base salary
                </p>
                <p className="mt-1 text-sm text-violet-100">
                  Only due after the candidate receives and accepts an offer.
                </p>
              </div>
              <ul className="mb-8 flex-1 space-y-3">
                {premium.features.map((feature) => (
                  <PricingItem key={feature} included light text={feature} />
                ))}
              </ul>
              <Link
                href="/signup"
                className="block rounded-xl bg-orange-500 px-6 py-3 text-center font-semibold text-white shadow-lg transition-colors hover:bg-orange-600"
              >
                Start with Premium
              </Link>
            </div>
          </div>

          <div className="mt-8 space-y-2 text-center text-sm text-gray-500">
            <p>
              <strong className="text-gray-900">Success fee for both plans:</strong>{" "}
              {SUCCESS_FEE_SUMMARY}
            </p>
            <p className="text-gray-400">
              No accepted offer, no success fee. Account creation and strategy review happen before
              any paid campaign activation.
            </p>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
