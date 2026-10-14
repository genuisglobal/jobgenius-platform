import ScrollReveal from "../ScrollReveal";
import { UserIcon, SearchIcon, TrophyIcon } from "../icons";

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-20 sm:py-28">
      <ScrollReveal>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <p className="text-center text-violet-600 font-semibold text-sm uppercase tracking-wider mb-3">
            How It Works
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center mb-4">
            Three steps to a structured job-search campaign
          </h2>
          <p className="text-center text-gray-500 max-w-2xl mx-auto mb-16">
            We pair AI speed with human judgment. Your dedicated account manager
            runs your campaign while our AI keeps surfacing role-matched opportunities.
          </p>

          <div className="relative grid md:grid-cols-3 gap-10">
            {/* Connecting line (desktop) */}
            <div className="absolute top-7 left-[calc(16.67%+1.75rem)] right-[calc(16.67%+1.75rem)] h-0.5 bg-gradient-to-r from-violet-200 via-violet-300 to-violet-200 hidden md:block" />

            {[
              {
                n: "1",
                title: "You tell us what you want",
                desc: "Upload your resume, share your target roles, salary range, and preferences. Your account manager reviews everything and builds a personalized search strategy.",
                icon: <UserIcon />,
              },
              {
                n: "2",
                title: "We run the campaign with you",
                desc: "Our AI finds and matches opportunities 24/7. Your account manager manages applications, recruiter outreach, and pipeline follow-through with your approved search direction.",
                icon: <SearchIcon />,
              },
              {
                n: "3",
                title: "You focus on interviews",
                desc: "When an interview lands, we prepare you with AI-powered coaching, company-specific questions, and practice sessions so you walk in confident and ready.",
                icon: <TrophyIcon />,
              },
            ].map((step) => (
              <div key={step.n} className="relative flex flex-col items-start md:items-center text-left md:text-center">
                <div className="relative z-10 w-14 h-14 bg-violet-600 text-white rounded-2xl flex items-center justify-center text-xl font-bold mb-5 shadow-lg shadow-violet-200 flex-shrink-0">
                  {step.n}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{step.title}</h3>
                <p className="text-gray-600 leading-relaxed text-sm">{step.desc}</p>
              </div>
            ))}
          </div>

          {/* Timeline callout */}
          <div className="mt-14 bg-gradient-to-r from-violet-50 to-orange-50 rounded-2xl p-6 sm:p-8 border border-violet-100">
            <p className="text-center text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6">
              Example campaign rhythm
            </p>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-2 max-w-3xl mx-auto">
              {[
                { day: "Day 1", label: "Profile reviewed & strategy set" },
                { day: "Days 2-5", label: "Applications + outreach begin" },
                { day: "Week 2+", label: "Interview traction may begin" },
                { day: "Later", label: "Offer timing depends on market conditions and fit" },
              ].map((item, i) => (
                <div key={i} className="flex sm:flex-col items-center gap-3 sm:gap-2 sm:flex-1 text-left sm:text-center">
                  <div className="w-10 h-10 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 sm:mx-auto shadow-md shadow-violet-200">
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-violet-700">{item.day}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{item.label}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-6 text-center text-xs leading-5 text-gray-500">
              Timelines vary by market conditions, seniority, target roles, location, and interview
              performance.
            </p>
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
