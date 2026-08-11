"use client";

import { useState } from "react";
import Link from "next/link";

const NAV_LINKS = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/hire", label: "Hire" },
  { href: "/what-we-do", label: "What We Do" },
  { href: "/referral-network", label: "Referral Network" },
  { href: "/interview-prep", label: "Interview Prep" },
  { href: "/pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
  { href: "/faq", label: "FAQ" },
];

export default function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="md:hidden p-2 -mr-1 text-gray-600 hover:text-gray-900 transition-colors"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-0 right-0 bottom-0 w-72 bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <span className="font-semibold text-gray-900">Menu</span>
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-gray-500 hover:text-gray-900 transition-colors"
                aria-label="Close menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-4 space-y-0.5">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block px-4 py-3 text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg font-medium transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="p-4 space-y-2.5 border-t border-gray-100">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="block text-center px-6 py-3 rounded-xl font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                onClick={() => setOpen(false)}
                className="block text-center px-6 py-3 rounded-xl font-semibold bg-orange-500 text-white hover:bg-orange-600 transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
