import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "../components/MarketingShell";
import PageHero from "../components/PageHero";
import { breadcrumbJsonLd } from "../components/breadcrumb";
import { FinalCtaSection } from "../components/homepage";
import { POSTS } from "./posts";

const SITE_URL = "https://job-genius.com";
const title = "JobGenius Blog: Job Search, Interview, and Career Guides";
const description =
  "Practical guides on beating the ATS, salary negotiation, recruiter outreach, and interview prep — written for job seekers who want results, not generic career advice.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/blog" },
  openGraph: { title, description, url: "/blog", type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

const blogJsonLd = {
  "@context": "https://schema.org",
  "@type": "Blog",
  name: "JobGenius Blog",
  url: `${SITE_URL}/blog`,
  description,
  publisher: {
    "@type": "Organization",
    name: "JobGenius",
    url: SITE_URL,
  },
  blogPost: POSTS.map((p) => ({
    "@type": "BlogPosting",
    headline: p.title,
    description: p.description,
    datePublished: p.publishedAt,
    url: `${SITE_URL}/blog/${p.slug}`,
    author: { "@type": "Organization", name: p.author },
  })),
};

const breadcrumb = breadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "Blog", path: "/blog" },
]);

export default function BlogIndexPage() {
  const posts = [...POSTS].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt)
  );

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <PageHero
        eyebrow="Blog"
        title="Practical guides for a better job search"
        subtitle="ATS-proof resumes, salary negotiation scripts, recruiter outreach templates, and interview prep — written for job seekers who want results."
        primaryCta={{ href: "/signup", label: "Get Started" }}
        secondaryCta={{ href: "/how-it-works", label: "How It Works" }}
      />

      <section className="py-16 sm:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
          <div className="space-y-6">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="block bg-white rounded-2xl border border-gray-100 p-6 sm:p-8 hover:border-violet-200 hover:shadow-lg transition-all"
              >
                <div className="flex flex-wrap gap-2 mb-3">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs font-semibold text-violet-700 bg-violet-50 px-2.5 py-1 rounded-full uppercase tracking-wider"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 leading-tight">
                  {post.title}
                </h2>
                <p className="text-gray-600 leading-relaxed mb-4">
                  {post.description}
                </p>
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <span className="font-medium text-gray-700">{post.author}</span>
                  <span>·</span>
                  <time dateTime={post.publishedAt}>
                    {new Date(post.publishedAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                  <span>·</span>
                  <span>{post.readMinutes} min read</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <FinalCtaSection />
    </MarketingShell>
  );
}
