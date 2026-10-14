import ScrollReveal from "../ScrollReveal";
import { PRE_PAYMENT_STEPS, PRE_PAYMENT_TRUST_STATEMENT } from "./marketingContent";

export default function PrePaymentSection() {
  return (
    <section className="py-20 sm:py-28 bg-white">
      <ScrollReveal>
        <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-orange-50/60 p-8 shadow-sm sm:p-10">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-600">
              Before Paid Activation
            </p>
            <h2 className="mt-3 text-3xl font-bold text-gray-900 sm:text-4xl">
              What Happens Before You Pay?
            </h2>
            <div className="mt-8 grid gap-4">
              {PRE_PAYMENT_STEPS.map((step, index) => (
                <div
                  key={step}
                  className="flex items-start gap-4 rounded-2xl border border-white/80 bg-white/90 px-5 py-4 shadow-sm"
                >
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-sm font-bold text-white shadow-lg shadow-violet-200">
                    {index + 1}
                  </span>
                  <p className="pt-1 text-sm leading-6 text-gray-700 sm:text-base">{step}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 text-sm leading-6 text-orange-950">
              {PRE_PAYMENT_TRUST_STATEMENT}
            </div>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
