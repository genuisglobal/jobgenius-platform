import ScrollReveal from "../ScrollReveal";
import { StarIcon } from "../icons";

export default function ReferralSection() {
  return (
    <section id="referral-network" className="py-20 sm:py-28">
      <ScrollReveal>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <p className="text-center text-orange-500 font-semibold text-sm uppercase tracking-wider mb-3">
            Referral Network
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center mb-4">
            A second path to relevant opportunities
          </h2>
          <p className="text-center text-gray-500 max-w-2xl mx-auto mb-16 text-lg">
            Most job seekers compete on job boards against thousands of applicants.
            Our referral network gives you a different path entirely &mdash; often
            before a role is even posted publicly.
          </p>

          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {[
              {
                title: "Company Partnerships",
                desc: "We work directly with companies looking to hire. When a role matches your profile, we get you in front of them before it hits the job boards.",
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                ),
              },
              {
                title: "Recruiter Network",
                desc: "Our growing network of recruiters and staffing partners means more doors open for you. When they have an opening, they come to us first.",
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                ),
              },
              {
                title: "Opportunity Alerts",
                desc: "When a network opportunity surfaces that matches your profile, we move fast. You get notified and prepped before anyone else.",
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                ),
              },
            ].map((item) => (
              <div key={item.title} className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm hover:shadow-md hover:border-violet-100 transition-all">
                <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {item.icon}
                  </svg>
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">{item.title}</h4>
                <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          {/* Referral success story */}
          <div className="bg-gradient-to-br from-orange-50 to-violet-50 rounded-2xl p-8 border border-orange-100 text-center max-w-2xl mx-auto">
            <div className="flex justify-center gap-0.5 mb-4 text-orange-400">
              {[...Array(5)].map((_, i) => (
                <StarIcon key={i} className="w-5 h-5 fill-current" />
              ))}
            </div>
            <p className="text-gray-700 text-lg italic mb-4">
              &ldquo;I got introduced to a company through their recruiter network that I never
              would have found on LinkedIn. That&apos;s where I ended up getting my offer.&rdquo;
            </p>
            <p className="text-sm font-semibold text-gray-900">Priya R. &mdash; Data Analyst</p>
            <p className="text-xs text-violet-600 font-medium mt-1">Referral-led offer outcome</p>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
