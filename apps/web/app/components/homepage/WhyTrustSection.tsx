import ScrollReveal from "../ScrollReveal";
import { WHY_TRUST_POINTS } from "./marketingContent";

export default function WhyTrustSection() {
  return (
    <section className="py-20 sm:py-24">
      <ScrollReveal>
        <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-violet-100 bg-violet-50/70 p-8 sm:p-10">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-700">
                Why Candidates Trust JobGenius
              </p>
              <h2 className="mt-3 text-3xl font-bold text-gray-900 sm:text-4xl">
                A clearer service model, before any paid campaign starts
              </h2>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {WHY_TRUST_POINTS.map((point) => (
                <div
                  key={point}
                  className="flex items-start gap-3 rounded-2xl border border-white bg-white/90 px-5 py-4 text-sm text-gray-700 shadow-sm"
                >
                  <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
                    ✓
                  </span>
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
