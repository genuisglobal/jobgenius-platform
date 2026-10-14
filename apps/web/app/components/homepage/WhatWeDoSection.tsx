import ScrollReveal from "../ScrollReveal";
import { LightningIcon, ChatIcon, PeopleIcon, ClipboardIcon, BookIcon, BrainIcon } from "../icons";

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-100 hover:border-violet-100 hover:shadow-md transition-all group">
      <div className="w-12 h-12 bg-violet-50 group-hover:bg-violet-100 rounded-xl flex items-center justify-center text-violet-600 mb-4 transition-colors">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

export default function WhatWeDoSection() {
  return (
    <section id="what-we-do" className="py-20 sm:py-28 bg-gray-50">
      <ScrollReveal>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
          <p className="text-center text-violet-600 font-semibold text-sm uppercase tracking-wider mb-3">
            What We Do
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center mb-4">
            Structured support for a more consistent job search
          </h2>
          <p className="text-center text-gray-500 max-w-2xl mx-auto mb-16">
            Think of us as your career team &mdash; part recruiter, part coach,
            part AI assistant &mdash; all working to improve the quality and consistency of your search.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<LightningIcon />}
              title="Targeted Applications"
              description="We don't spray and pray. AI matches you to roles where you're a strong fit, and your manager applies with tailored materials."
            />
            <FeatureCard
              icon={<ChatIcon />}
              title="Recruiter Outreach"
              description="We contact recruiters and hiring managers directly on your behalf. Personalized messages, strategic follow-ups, real conversations."
            />
            <FeatureCard
              icon={<PeopleIcon />}
              title="Referral Network"
              description="Get introduced to hidden roles through our peer and recruiter network — often before positions are publicly posted."
            />
            <FeatureCard
              icon={<ClipboardIcon />}
              title="Pipeline Management"
              description="Track every opportunity from first touch to offer. Your manager keeps everything organized so nothing falls through the cracks."
            />
            <FeatureCard
              icon={<BookIcon />}
              title="Interview Preparation"
              description="Company-specific study notes, AI-generated practice questions, live voice practice, and real-time scoring to get you interview-ready."
            />
            <FeatureCard
              icon={<BrainIcon />}
              title="AI + Human Intelligence"
              description="AI works 24/7 finding and scoring opportunities. Your human account manager adds strategy, judgment, and the personal touch AI can't replace."
            />
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
