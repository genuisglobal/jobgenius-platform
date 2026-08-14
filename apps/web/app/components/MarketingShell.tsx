import Link from "next/link";
import Image from "next/image";
import MobileNav from "./MobileNav";
import StickyCta from "./StickyCta";
import { Footer } from "./homepage";

export const MARKETING_NAV = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/hire", label: "Hire" },
  { href: "/referral-network", label: "Referral Network" },
  { href: "/interview-prep", label: "Interview Prep" },
  { href: "/pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
  { href: "/faq", label: "FAQ" },
];

export default function MarketingShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      <StickyCta />

      <header className="fixed top-0 left-0 right-0 bg-white/90 backdrop-blur-md z-50 border-b border-gray-100">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/logo.png"
                alt="JobGenius"
                width={140}
                height={40}
                className="h-9 w-auto"
                priority
              />
            </Link>
            <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
              {MARKETING_NAV.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="hover:text-gray-900 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="hidden sm:block text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="bg-orange-500 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-orange-600 transition-colors shadow-sm"
              >
                Get Started
              </Link>
              <MobileNav />
            </div>
          </nav>
        </div>
      </header>

      {children}

      <Footer />
    </div>
  );
}
