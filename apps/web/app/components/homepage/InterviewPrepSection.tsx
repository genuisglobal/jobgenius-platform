import ScrollReveal from "../ScrollReveal";

export default function InterviewPrepSection() {
  return (
    <section id="interview-prep" className="py-20 sm:py-28 bg-gradient-to-b from-violet-600 to-violet-800 text-white relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none opacity-10">
        <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-orange-400 rounded-full translate-x-1/2 translate-y-1/2" />
      </div>
      <ScrollReveal>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl relative">
          <p className="text-center text-violet-200 font-semibold text-sm uppercase tracking-wider mb-3">
            Interview Preparation
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
            Walk into every interview ready to win
          </h2>
          <p className="text-center text-violet-200 max-w-2xl mx-auto mb-4 text-lg">
            The interview is the one part only you can do. We make sure you&apos;re
            the most prepared candidate in the room.
          </p>
          <div className="flex justify-center mb-14">
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-5 py-2 text-sm font-medium text-white">
              <span className="text-orange-300 font-bold text-base">85%</span>
              of JobGenius candidates pass their first interview round
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {[
              {
                title: "Company-Specific Research",
                desc: "AI generates study notes tailored to the specific company \u2014 their products, culture, recent news, and what the hiring manager likely cares about.",
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                ),
              },
              {
                title: "Role-Specific Questions",
                desc: 'Not generic "tell me about yourself" lists. AI reads the actual job description and generates the questions this interviewer is likely to ask.',
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                ),
              },
              {
                title: "Voice Practice with AI Scoring",
                desc: "Practice answering out loud. Our AI transcribes your answer, scores it on STAR structure, relevance, and specificity, and gives you coaching to improve.",
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                ),
              },
              {
                title: "Progress Tracking & Streaks",
                desc: "Track your readiness score, practice streaks, and score trends. See your confidence improve session by session with personalized feedback.",
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                ),
              },
            ].map((item) => (
              <div key={item.title} className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/15 hover:bg-white/15 transition-colors">
                <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-orange-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {item.icon}
                  </svg>
                </div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-violet-200 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
