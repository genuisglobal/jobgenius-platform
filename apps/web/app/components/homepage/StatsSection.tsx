import ScrollReveal from "../ScrollReveal";

export default function StatsSection() {
  return (
    <section className="py-20 bg-violet-700 text-white">
      <ScrollReveal>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <p className="text-center text-violet-300 font-semibold text-sm uppercase tracking-wider mb-3">
            Know What You&apos;re Buying
          </p>
          <h2 className="text-center text-3xl sm:text-4xl font-bold text-white mb-4">
            Managed execution with clear boundaries
          </h2>
          <p className="text-center text-violet-100/90 max-w-3xl mx-auto mb-12">
            JobGenius is a service layer for people who want the search run for
            them, not another dashboard that still leaves all the work on their
            plate.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
            {[
              {
                value: "1",
                label: "Dedicated Account Manager",
                sub: "One person owns strategy, messaging, and next steps.",
              },
              {
                value: "24/7",
                label: "Search Coverage",
                sub: "AI keeps scanning, matching, and queueing opportunities.",
              },
              {
                value: "1",
                label: "Shared Portal",
                sub: "Applications, outreach, and interviews live in one place.",
              },
              {
                value: "5%",
                label: "Success Fee Timing",
                sub: "Only due after you accept an offer.",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="group rounded-2xl border border-white/10 bg-white/10 p-5 backdrop-blur-sm"
              >
                <div className="text-4xl sm:text-5xl font-extrabold text-white mb-2">
                  {stat.value}
                </div>
                <div className="text-sm font-semibold text-violet-50">{stat.label}</div>
                <div className="text-xs text-violet-200 mt-2 leading-relaxed">{stat.sub}</div>
              </div>
            ))}
          </div>

          <div className="mt-8 grid lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-white/10 bg-gray-950/20 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Good fit if you want</h3>
              <ul className="space-y-3 text-sm text-violet-100/90">
                {[
                  "Someone else to run the repetitive parts of the search every week.",
                  "Targeted applications and recruiter outreach instead of random volume.",
                  "A clear owner for interview prep, follow-ups, and pipeline visibility.",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1 h-2 w-2 rounded-full bg-orange-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-white/10 bg-gray-950/20 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Not a fit if you want</h3>
              <ul className="space-y-3 text-sm text-violet-100/90">
                {[
                  "A pure DIY software tool with no human operator in the loop.",
                  "An instant guarantee instead of a managed service that compounds over weeks.",
                  "A front-door application blast with no attention to role fit or narrative.",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1 h-2 w-2 rounded-full bg-violet-300" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
