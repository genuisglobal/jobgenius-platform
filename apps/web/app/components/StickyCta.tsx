"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function StickyCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handle = () => setVisible(window.scrollY > 680);
    window.addEventListener("scroll", handle, { passive: true });
    handle();
    return () => window.removeEventListener("scroll", handle);
  }, []);

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 transition-all duration-300 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"
      }`}
    >
      <div className="flex items-center gap-3 bg-gray-900/95 backdrop-blur-sm text-white px-5 py-3 rounded-2xl shadow-2xl border border-white/10 whitespace-nowrap">
        <span className="text-sm font-medium text-gray-300 hidden sm:block">
          Free account first. Review the strategy before paid activation.
        </span>
        <Link
          href="/signup"
          className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
        >
          Create free account &rarr;
        </Link>
      </div>
    </div>
  );
}
