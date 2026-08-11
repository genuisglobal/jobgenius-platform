import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import MarketingShell from "../../components/MarketingShell";
import PageHero from "../../components/PageHero";
import { breadcrumbJsonLd } from "../../components/breadcrumb";
import {
  HowItWorksSection,
  PricingSection,
  AiHumanSection,
  TestimonialsSection,
  FinalCtaSection,
} from "../../components/homepage";
import { ROLES, getRole } from "../roles";

const SITE_URL = "https://job-genius.com";

export function generateStaticParams() {
  return ROLES.map((r) => ({ role: r.slug }));
}

export function generateMetadata({
  params,
}: {
  params: { role: string };
}): Metadata {
  const role = getRole(params.role);
  if (!role) return {};
  return {
    title: role.metaTitle,
    description: role.metaDescription,
    alternates: { canonical: `/for/${role.slug}` },
    openGraph: {
      title: role.metaTitle,
      description: role.metaDescription,
      url: `/for/${role.slug}`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: role.metaTitle,
      description: role.metaDescription,
    },
  };
}

export default function RolePage({ params }: { params: { role: string } }) {
  const role = getRole(params.role);
  if (!role) notFound();

  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: `For ${role.rolePlural}`, path: `/for/${role.slug}` },
  ]);

  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType: `Managed Job Search for ${role.rolePlural}`,
    name: `JobGenius for ${role.rolePlural}`,
    description: role.metaDescription,
    provider: { "@type": "Organization", name: "JobGenius", url: SITE_URL },
    areaServed: "Worldwide",
    audience: {
      "@type": "Audience",
      audienceType: role.rolePlural,
    },
  };

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />

      <PageHero
        eyebrow={`For ${role.rolePlural}`}
        title={role.heroTitle}
        subtitle={role.heroSubtitle}
        secondaryCta={{ href: "/how-it-works", label: "How It Works" }}
      />

      {/* Pain points */}
      <section className="py-16 sm:py-20 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <p className="text-center text-violet-600 font-semibold text-sm uppercase tracking-wider mb-3">
            Why {role.rolePlural} struggle
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center mb-12">
            The hard parts of searching for a {role.role} role
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {role.painPoints.map((p) => (
              <div
                key={p.title}
                className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm"
              >
                <h3 className="text-lg font-bold text-gray-900 mb-3">{p.title}</h3>
                <p className="text-gray-600 leading-relaxed text-sm">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why JobGenius */}
      <section className="py-16 sm:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <p className="text-center text-violet-600 font-semibold text-sm uppercase tracking-wider mb-3">
            Why JobGenius works for {role.rolePlural}
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center mb-12">
            Built for the way {role.rolePlural} actually get hired
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {role.whyJobGenius.map((w) => (
              <div
                key={w.title}
                className="bg-gradient-to-b from-violet-50 to-white rounded-2xl border border-violet-100 p-6"
              >
                <h3 className="text-lg font-bold text-gray-900 mb-3">{w.title}</h3>
                <p className="text-gray-600 leading-relaxed text-sm">{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Target titles */}
      <section className="py-12 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl text-center">
          <p className="text-violet-600 font-semibold text-sm uppercase tracking-wider mb-3">
            Roles we run
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">
            Titles JobGenius targets for {role.rolePlural}
          </h2>
          <div className="flex flex-wrap justify-center gap-2 max-w-3xl mx-auto">
            {role.targetTitles.map((t) => (
              <span
                key={t}
                className="bg-white text-gray-700 border border-gray-200 px-4 py-2 rounded-full text-sm font-medium"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      <HowItWorksSection />
      <AiHumanSection />
      <TestimonialsSection />
      <PricingSection />

      {/* Other audiences */}
      <section className="py-12 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl text-center">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Looking for a different role?
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {ROLES.filter((r) => r.slug !== role.slug).map((r) => (
              <Link
                key={r.slug}
                href={`/for/${r.slug}`}
                className="bg-violet-50 text-violet-700 border border-violet-100 px-4 py-2 rounded-full text-sm font-medium hover:bg-violet-100 transition-colors"
              >
                For {r.rolePlural}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <FinalCtaSection />
    </MarketingShell>
  );
}
