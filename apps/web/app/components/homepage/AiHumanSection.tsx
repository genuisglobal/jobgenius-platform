import ScrollReveal from "../ScrollReveal";

function BulletPoint({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-3">
      <svg
        className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      <span className="text-gray-600">{text}</span>
    </li>
  );
}

function ComparisonRow({
  label,
  ai,
  human,
}: {
  label: string;
  ai: string;
  human: string;
}) {
  return (
    <div className="border-t border-violet-100/60 pt-4 first:border-0 first:pt-0">
      <div className="text-xs font-semibold text-violet-500 uppercase tracking-wider mb-2">
        {label}
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-start gap-2">
          <span className="text-violet-400 mt-0.5 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </span>
          <span className="text-gray-700 text-xs">{ai}</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-orange-400 mt-0.5 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </span>
          <span className="text-gray-700 text-xs">{human}</span>
        </div>
      </div>
    </div>
  );
}

export default function AiHumanSection() {
  return (
    <section className="py-20 sm:py-28">
      <ScrollReveal>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-violet-600 font-semibold text-sm uppercase tracking-wider mb-3">
                The Best of Both Worlds
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
                AI speed.
                <br />
                Human strategy.
              </h2>
              <p className="text-lg text-gray-600 mb-6 leading-relaxed">
                Other platforms give you a chatbot. We give you a dedicated
                account manager backed by AI that never sleeps.
              </p>
              <ul className="space-y-4">
                <BulletPoint text="Your account manager builds a strategy tailored to your goals, industry, and timeline" />
                <BulletPoint text="AI scans thousands of listings daily and scores each one against your profile" />
                <BulletPoint text="Your manager applies, handles recruiter outreach, and taps our referral network" />
                <BulletPoint text="You get updates in your portal, never wondering what's happening behind the scenes" />
              </ul>
            </div>
            <div className="bg-gradient-to-br from-violet-50 to-orange-50 rounded-2xl p-6 sm:p-8 border border-violet-100">
              {/* Column headers */}
              <div className="grid grid-cols-2 gap-3 mb-5 text-xs font-bold uppercase tracking-wider">
                <div className="flex items-center gap-2 text-violet-600">
                  <div className="w-6 h-6 bg-violet-100 rounded-md flex items-center justify-center">
                    <span className="text-xs">AI</span>
                  </div>
                  AI Does
                </div>
                <div className="flex items-center gap-2 text-orange-600">
                  <div className="w-6 h-6 bg-orange-100 rounded-md flex items-center justify-center">
                    <span className="text-xs">AM</span>
                  </div>
                  Human Adds
                </div>
              </div>
              <div className="space-y-5">
                <ComparisonRow label="Job Matching" ai="Scans 10,000+ listings/day" human="Validates fit & culture alignment" />
                <ComparisonRow label="Applications" ai="Auto-fills & optimizes materials" human="Reviews, customizes cover letters" />
                <ComparisonRow label="Recruiter Outreach" ai="Identifies contacts & drafts messages" human="Sends personalized, strategic messages" />
                <ComparisonRow label="Referral Network" ai="Matches your profile to network contacts" human="Makes warm introductions at target companies" />
                <ComparisonRow label="Interview Prep" ai="Generates questions & scores answers" human="Provides coaching & strategy advice" />
              </div>
            </div>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
