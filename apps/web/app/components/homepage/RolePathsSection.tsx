import Link from "next/link";
import ScrollReveal from "../ScrollReveal";
import { ROLES } from "../../for/roles";

const FEATURED_ROLE_SLUGS = [
  "software-engineers",
  "product-managers",
  "data-scientists",
  "marketers",
  "finance-professionals",
  "designers",
];

const featuredRoles = FEATURED_ROLE_SLUGS.map((slug) =>
  ROLES.find((role) => role.slug === slug)
).filter((role): role is (typeof ROLES)[number] => Boolean(role));

export default function RolePathsSection() {
  return (
    <section id="by-role" className="py-20 sm:py-28 bg-gray-50">
      <ScrollReveal>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
          <p className="text-center text-violet-600 font-semibold text-sm uppercase tracking-wider mb-3">
            By Role
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center mb-4">
            Start with the version built for your market
          </h2>
          <p className="text-center text-gray-500 max-w-3xl mx-auto mb-14">
            Software, product, data, marketing, finance, and design all hire
            differently. These pages let the acquisition story match the role
            you actually want.
          </p>

          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {featuredRoles.map((role) => (
              <Link
                key={role.slug}
                href={`/for/${role.slug}`}
                className="group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-violet-200 hover:shadow-lg"
              >
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-500">
                      For {role.rolePlural}
                    </p>
                    <h3 className="mt-2 text-xl font-bold text-gray-900">
                      {role.heroTitle}
                    </h3>
                  </div>
                  <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                    Role page
                  </span>
                </div>

                <p className="text-sm leading-relaxed text-gray-600">
                  {role.whyJobGenius[0]?.desc ?? role.heroSubtitle}
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {role.targetTitles.slice(0, 3).map((title) => (
                    <span
                      key={title}
                      className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600"
                    >
                      {title}
                    </span>
                  ))}
                </div>

                <div className="mt-6 text-sm font-semibold text-violet-700 transition-colors group-hover:text-violet-800">
                  Explore this path -&gt;
                </div>
              </Link>
            ))}
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
