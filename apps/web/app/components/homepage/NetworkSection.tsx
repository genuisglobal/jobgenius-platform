import Link from "next/link";
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

export default function NetworkSection() {
  return (
    <section className="py-20 sm:py-28 bg-gray-50">
      <ScrollReveal>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <p className="text-center text-violet-600 font-semibold text-sm uppercase tracking-wider mb-3">
            Join the Network
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center mb-4">
            Not just for job seekers
          </h2>
          <p className="text-center text-gray-500 max-w-2xl mx-auto mb-16">
            Peers and recruiters are a core part of how JobGenius works &mdash;
            and there&apos;s something in it for you too.
          </p>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white rounded-2xl p-8 border border-gray-200 flex flex-col hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-violet-50 rounded-xl flex items-center justify-center text-violet-600 mb-5">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">For Peers</h3>
              <p className="text-gray-600 mb-6 leading-relaxed">
                Know someone who&apos;s job searching? Refer them to JobGenius and earn a
                reward when they land an offer. Help your network access more structured
                search support with expert help behind them.
              </p>
              <ul className="space-y-3 mb-8 flex-1">
                <BulletPoint text="Easy referral link to share with your network" />
                <BulletPoint text="Earn a reward for every successful placement" />
                <BulletPoint text="Your referral gets a dedicated account manager, not a bot" />
              </ul>
              <Link
                href="/signup"
                className="inline-block text-center bg-white text-violet-700 px-6 py-3 rounded-xl font-semibold border-2 border-violet-600 hover:bg-violet-50 transition-colors"
              >
                Refer a Friend
              </Link>
            </div>

            <div className="bg-white rounded-2xl p-8 border border-gray-200 flex flex-col hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600 mb-5">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">For Recruiters</h3>
              <p className="text-gray-600 mb-6 leading-relaxed">
                Partner with us to access a pipeline of pre-screened, interview-prepared
                candidates matched to your open roles. Our account managers know
                every candidate personally.
              </p>
              <ul className="space-y-3 mb-8 flex-1">
                <BulletPoint text="AI-matched candidates specific to your open roles" />
                <BulletPoint text="Every candidate is interview-prepped and application-ready" />
                <BulletPoint text="Work with an account manager who knows the candidate's strengths" />
              </ul>
              <a
                href="mailto:partners@jobgenius.com"
                className="inline-block text-center bg-orange-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-orange-600 transition-colors"
              >
                Become a Partner
              </a>
            </div>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
