import Link from "next/link";
import MarketingShell from "../components/MarketingShell";
import { breadcrumbJsonLd } from "../components/breadcrumb";
import { FinalCtaSection } from "../components/homepage";
import type { BlogPost } from "./posts";

const SITE_URL = "https://job-genius.com";

export function articleJsonLd(post: BlogPost) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    author: { "@type": "Organization", name: post.author },
    publisher: {
      "@type": "Organization",
      name: "JobGenius",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.png` },
    },
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${SITE_URL}/blog/${post.slug}`,
    },
    image: `${SITE_URL}/og-image.png`,
  };
}

export default function BlogPostLayout({
  post,
  children,
}: {
  post: BlogPost;
  children: React.ReactNode;
}) {
  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
    { name: post.title, path: `/blog/${post.slug}` },
  ]);

  const formattedDate = new Date(post.publishedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd(post)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />

      <article className="pt-28 pb-16 sm:pt-32 sm:pb-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
          <nav className="text-sm text-gray-500 mb-6">
            <Link href="/" className="hover:text-gray-900">Home</Link>
            <span className="mx-2">/</span>
            <Link href="/blog" className="hover:text-gray-900">Blog</Link>
          </nav>

          <header className="mb-10 pb-8 border-b border-gray-100">
            <div className="flex flex-wrap gap-2 mb-4">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs font-semibold text-violet-700 bg-violet-50 px-2.5 py-1 rounded-full uppercase tracking-wider"
                >
                  {tag}
                </span>
              ))}
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 tracking-tight mb-5">
              {post.title}
            </h1>
            <p className="text-lg text-gray-600 leading-relaxed mb-6">
              {post.description}
            </p>
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span className="font-medium text-gray-900">{post.author}</span>
              <span>·</span>
              <time dateTime={post.publishedAt}>{formattedDate}</time>
              <span>·</span>
              <span>{post.readMinutes} min read</span>
            </div>
          </header>

          <div className="blog-prose">{children}</div>

          <div className="mt-16 pt-10 border-t border-gray-100">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-violet-700 font-semibold hover:text-violet-900 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to all posts
            </Link>
          </div>
        </div>
      </article>

      <FinalCtaSection />
    </MarketingShell>
  );
}
