import type { Metadata } from "next";
import MarketingShell from "../components/MarketingShell";
import PageHero from "../components/PageHero";
import { breadcrumbJsonLd } from "../components/breadcrumb";
import HireIntakeForm from "./HireIntakeForm";

const title = "Hire With JobGenius: Send a Role, Get Relevant Candidates Fast";
const description =
  "Hiring for your company or for clients? Submit a role to JobGenius without creating an account. No password required. No software setup first.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/hire" },
  openGraph: { title, description, url: "/hire", type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

const breadcrumb = breadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "Hire", path: "/hire" },
]);

const serviceJsonLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "JobGenius Hiring Partner Intake",
  description,
  provider: {
    "@type": "Organization",
    name: "JobGenius",
    url: "https://job-genius.com",
  },
  audience: [
    { "@type": "Audience", audienceType: "In-house recruiters" },
    { "@type": "Audience", audienceType: "Recruitment agencies" },
    { "@type": "Audience", audienceType: "Staffing partners" },
  ],
};

export default function HirePage() {
  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }}
      />
      <PageHero
        eyebrow="For Recruiters & Hiring Partners"
        title="Send a role. We'll send relevant candidates fast."
        subtitle="Hiring for your company or for clients? Share a live role or tell us what you need. No platform setup required. No password required."
        primaryCta={{ href: "#hire-form", label: "Submit a Role" }}
        secondaryCta={{ href: "#how-it-works", label: "How It Works" }}
      />

      <section className="pb-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-4 rounded-[32px] border border-violet-100 bg-violet-50/70 p-6 sm:grid-cols-3 sm:p-8">
            {[
              {
                title: "No long onboarding",
                body: "Give us the role, the market, and the right contact email. That is enough to start.",
              },
              {
                title: "No software setup",
                body: "You do not need another recruiter portal before you see whether this is useful.",
              },
              {
                title: "Optional partner access later",
                body: "Repeat partners can get magic-link access later if they want a lighter repeat workflow.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-[24px] bg-white px-5 py-5 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-600">
                  {item.title}
                </p>
                <p className="mt-3 text-sm leading-6 text-gray-600">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <HireIntakeForm />
        </div>
      </section>

      <section id="how-it-works" className="pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl rounded-[40px] bg-gray-950 px-6 py-8 text-white sm:px-8 sm:py-10">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-orange-300">
                What Happens Next
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight">
                Fast first exchange, not a long setup flow.
              </h2>
              <p className="mt-4 text-base leading-7 text-gray-300">
                The goal is to get to a useful candidate conversation quickly. Everything in
                this flow is designed around that.
              </p>
            </div>

            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              {[
                {
                  step: "01",
                  title: "You submit a live role",
                  body: "Use the short form. No password, no account creation, no demo gate.",
                },
                {
                  step: "02",
                  title: "We review for fit and urgency",
                  body: "An internal owner reviews the request, qualifies it, and follows up if anything is missing.",
                },
                {
                  step: "03",
                  title: "We reply directly by email",
                  body: "If we have relevant candidates or need clarification, we respond directly without making you log in first.",
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="rounded-[28px] border border-white/10 bg-white/5 px-5 py-6"
                >
                  <p className="text-sm font-bold tracking-[0.24em] text-orange-300">
                    {item.step}
                  </p>
                  <h3 className="mt-4 text-xl font-semibold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-gray-300">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
