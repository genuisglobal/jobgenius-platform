import Link from "next/link";
import Image from "next/image";
import { ROLES } from "../../for/roles";
import { BUSINESS_CONTACT } from "./marketingContent";

export default function Footer() {
  return (
    <footer className="bg-gray-950 text-gray-400 py-14">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
        <div className="mb-10 rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-300">
                Trust and Contact
              </p>
              <h3 className="mt-2 text-2xl font-bold text-white">Talk to a real team before you activate a campaign</h3>
              <p className="mt-3 text-sm leading-6 text-gray-300">
                Use the free account flow to start, then review the service agreement and campaign
                terms before any paid execution begins.
              </p>
            </div>
            <Link
              href={BUSINESS_CONTACT.consultationHref}
              className="inline-flex rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
            >
              Schedule a Consultation
            </Link>
          </div>
          <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="font-semibold text-white">Email</p>
              <a href={`mailto:${BUSINESS_CONTACT.email}`} className="mt-1 block hover:text-white transition-colors">
                {BUSINESS_CONTACT.email}
              </a>
            </div>
            <div>
              <p className="font-semibold text-white">Phone</p>
              {BUSINESS_CONTACT.phoneHref ? (
                <a href={BUSINESS_CONTACT.phoneHref} className="mt-1 block hover:text-white transition-colors">
                  {BUSINESS_CONTACT.phoneLabel}
                </a>
              ) : (
                <span className="mt-1 block text-gray-500">{BUSINESS_CONTACT.phoneLabel}</span>
              )}
            </div>
            <div>
              <p className="font-semibold text-white">LinkedIn</p>
              {BUSINESS_CONTACT.linkedInHref ? (
                <a
                  href={BUSINESS_CONTACT.linkedInHref}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block hover:text-white transition-colors"
                >
                  LinkedIn Company Page
                </a>
              ) : (
                <span className="mt-1 block text-gray-500">{BUSINESS_CONTACT.linkedInLabel}</span>
              )}
            </div>
            <div>
              <p className="font-semibold text-white">Policies</p>
              <div className="mt-1 space-y-1">
                <Link href={BUSINESS_CONTACT.privacyHref} className="block hover:text-white transition-colors">
                  Privacy Policy
                </Link>
                <Link href={BUSINESS_CONTACT.termsHref} className="block hover:text-white transition-colors">
                  Terms of Service
                </Link>
                <Link href={BUSINESS_CONTACT.serviceAgreementHref} className="block hover:text-white transition-colors">
                  Service Agreement
                </Link>
                <Link href={BUSINESS_CONTACT.refundPolicyHref} className="block hover:text-white transition-colors">
                  Refund or Cancellation Policy
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-4 gap-8 mb-10">
          <div className="sm:col-span-1">
            <div className="mb-4">
              <Image src="/logo.png" alt="JobGenius" width={120} height={36} className="h-8 w-auto brightness-200" />
            </div>
            <p className="text-sm leading-relaxed">
              Human-guided and AI-assisted job search execution with clearer service boundaries,
              campaign planning, and support before any paid activation begins.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              Platform
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/how-it-works" className="hover:text-white transition-colors">How It Works</Link></li>
              <li><Link href="/what-we-do" className="hover:text-white transition-colors">What We Do</Link></li>
              <li><Link href="/referral-network" className="hover:text-white transition-colors">Referral Network</Link></li>
              <li><Link href="/interview-prep" className="hover:text-white transition-colors">Interview Prep</Link></li>
              <li><Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link></li>
              <li><Link href="/blog" className="hover:text-white transition-colors">Blog</Link></li>
              <li><Link href="/faq" className="hover:text-white transition-colors">FAQ</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              Get Started
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/signup" className="hover:text-white transition-colors">Create Account</Link></li>
              <li><Link href="/login" className="hover:text-white transition-colors">Sign In</Link></li>
              <li><a href="mailto:partners@jobgenius.com" className="hover:text-white transition-colors">Recruiter Partnership</a></li>
              <li><Link href="/signup" className="hover:text-white transition-colors">Schedule a Consultation</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              Company
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li><a href={`mailto:${BUSINESS_CONTACT.email}`} className="hover:text-white transition-colors">Contact Us</a></li>
              <li><a href="mailto:partners@jobgenius.com" className="hover:text-white transition-colors">Partnerships</a></li>
              <li><Link href={BUSINESS_CONTACT.privacyHref} className="hover:text-white transition-colors">Privacy Policy</Link></li>
              <li><Link href={BUSINESS_CONTACT.termsHref} className="hover:text-white transition-colors">Terms of Service</Link></li>
              <li><Link href={BUSINESS_CONTACT.serviceAgreementHref} className="hover:text-white transition-colors">Service Agreement</Link></li>
              <li><Link href={BUSINESS_CONTACT.refundPolicyHref} className="hover:text-white transition-colors">Refund or Cancellation Policy</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-800 pt-8 pb-8 mb-2">
          <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
            By Role
          </h4>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {ROLES.map((r) => (
              <Link
                key={r.slug}
                href={`/for/${r.slug}`}
                className="hover:text-white transition-colors"
              >
                For {r.rolePlural}
              </Link>
            ))}
          </div>
        </div>
        <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row justify-between items-center gap-3 text-sm">
          <span>&copy; {new Date().getFullYear()} JobGenius. All rights reserved.</span>
          <span className="text-gray-600">Structured job-search support &middot; Human-led execution</span>
        </div>
      </div>
    </footer>
  );
}
