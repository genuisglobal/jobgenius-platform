import ScrollReveal from "../ScrollReveal";

export default function PainPointSection() {
  return (
    <section className="py-16 bg-gray-900 text-white">
      <ScrollReveal>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <p className="text-center text-orange-400 font-semibold text-sm uppercase tracking-wider mb-3">
            Sound familiar?
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">
            Job searching is a full-time job. It shouldn&apos;t be.
          </h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                emoji: "\u{1F629}",
                text: (
                  <>
                    Spending <strong className="text-white">4+ hours a day</strong> applying,
                    customizing cover letters, and hearing nothing back.
                  </>
                ),
              },
              {
                emoji: "\u{1F4ED}",
                text: (
                  <>
                    Sending <strong className="text-white">hundreds of applications</strong> into
                    the void with no strategy and no feedback.
                  </>
                ),
              },
              {
                emoji: "\u{1F630}",
                text: (
                  <>
                    Finally landing an interview but feeling{" "}
                    <strong className="text-white">unprepared</strong> and unsure what to expect.
                  </>
                ),
              },
            ].map((item, i) => (
              <div key={i} className="bg-gray-800/70 rounded-xl p-6 border border-gray-700/60 hover:border-gray-600 transition-colors">
                <div className="text-3xl mb-3">{item.emoji}</div>
                <p className="text-gray-300 leading-relaxed text-sm">{item.text}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-lg text-gray-400 mt-10">
            What if you had a team handling all of that &mdash; and you only
            showed up for interviews?
          </p>
        </div>
      </ScrollReveal>
    </section>
  );
}
