import Link from "next/link";
import CapacityNotice, { type CapacityNoticeSummary } from "../CapacityNotice";
import { StarIcon, LightningIcon, PeopleIcon, MicIcon } from "../icons";
import DashboardMockup from "./DashboardMockup";

function FeaturePill({
  color,
  icon,
  label,
}: {
  color: "violet" | "orange";
  icon: React.ReactNode;
  label: string;
}) {
  const cls =
    color === "violet"
      ? "bg-violet-50 border-violet-100 text-violet-700"
      : "bg-orange-50 border-orange-100 text-orange-700";
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-full text-sm font-medium ${cls}`}>
      {icon}
      {label}
    </span>
  );
}

export default function HeroSection({
  capacitySummary,
}: {
  capacitySummary: CapacityNoticeSummary;
}) {
  return (
    <section className="relative pt-24 sm:pt-28 pb-0 overflow-hidden bg-gradient-to-br from-violet-50 via-white to-orange-50/30">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-violet-100/50 rounded-full blur-3xl" />
        <div className="absolute top-40 right-1/4 w-64 h-64 bg-orange-100/40 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center min-h-[calc(100vh-5rem)] pb-16 lg:pb-24">
          <div className="max-w-xl">
            <div className="flex flex-wrap gap-2 mb-8">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-violet-50 border border-violet-100 rounded-full text-sm font-medium text-violet-700">
                <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                Free account setup and resume upload
              </div>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-orange-50 border border-orange-100 rounded-full text-sm font-medium text-orange-700">
                7-day strategy preview before paid activation
              </div>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight tracking-tight">
              A managed
              <br />
              <span className="text-violet-600">job search</span>
              <br />
              that runs without you.
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-gray-600 leading-relaxed">
              JobGenius pairs a dedicated account manager with always-on AI to
              support role targeting, consistent applications, recruiter outreach,
              and interview preparation. Start with a free account, get a 7-day
              strategy preview, then decide whether to activate a managed job
              search campaign.
            </p>

            <div className="mt-7 flex flex-wrap gap-2.5">
              <FeaturePill color="violet" icon={<LightningIcon />} label="Managed Application Support" />
              <FeaturePill color="orange" icon={<PeopleIcon />} label="Recruiter Outreach Support" />
              <FeaturePill color="violet" icon={<MicIcon />} label="Interview Preparation" />
            </div>

            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <Link
                href="/signup"
                className="bg-orange-500 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-orange-600 transition-all shadow-lg shadow-orange-200 hover:shadow-xl hover:shadow-orange-200 text-center"
              >
                Create Free Account
              </Link>
              <a
                href="#pricing"
                className="bg-white text-gray-700 px-8 py-4 rounded-xl font-semibold text-lg hover:bg-gray-50 transition-colors border border-gray-200 text-center"
              >
                See Pricing
              </a>
            </div>

            <CapacityNotice summary={capacitySummary} className="mt-6 max-w-xl" />

            <div className="mt-6 flex flex-wrap items-center gap-2.5 text-sm text-gray-500">
              <div className="flex items-center gap-0.5 text-orange-400">
                {[...Array(5)].map((_, i) => (
                  <StarIcon key={i} className="w-4 h-4 fill-current" />
                ))}
              </div>
              <span>Built for software, product, data, marketing, finance, and design roles</span>
              <span className="text-gray-300 hidden sm:inline">|</span>
              <a href="#by-role" className="font-medium text-violet-700 hover:text-violet-800">
                Browse role-specific pages
              </a>
            </div>
          </div>

          <div className="hidden lg:block relative">
            <DashboardMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
