import Link from "next/link";

export default function PageHero({
  eyebrow,
  title,
  subtitle,
  primaryCta = { href: "/signup", label: "Get Started" },
  secondaryCta,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  primaryCta?: { href: string; label: string };
  secondaryCta?: { href: string; label: string };
}) {
  return (
    <section className="pt-32 pb-16 sm:pt-40 sm:pb-20 bg-gradient-to-b from-violet-50/50 to-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl text-center">
        <p className="text-violet-600 font-semibold text-sm uppercase tracking-wider mb-4">
          {eyebrow}
        </p>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 tracking-tight mb-6">
          {title}
        </h1>
        <p className="text-lg sm:text-xl text-gray-600 leading-relaxed max-w-2xl mx-auto mb-8">
          {subtitle}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={primaryCta.href}
            className="bg-orange-500 text-white px-7 py-3.5 rounded-xl text-base font-semibold hover:bg-orange-600 transition-colors shadow-lg shadow-orange-200"
          >
            {primaryCta.label}
          </Link>
          {secondaryCta && (
            <Link
              href={secondaryCta.href}
              className="bg-white text-gray-900 px-7 py-3.5 rounded-xl text-base font-semibold border-2 border-gray-200 hover:border-gray-300 transition-colors"
            >
              {secondaryCta.label}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
