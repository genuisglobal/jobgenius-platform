import type { Metadata } from "next";
import BlogPostLayout from "../BlogPostLayout";
import { getPost } from "../posts";

const post = getPost("why-job-applications-get-ghosted")!;

export const metadata: Metadata = {
  title: post.title,
  description: post.description,
  alternates: { canonical: `/blog/${post.slug}` },
  openGraph: {
    title: post.title,
    description: post.description,
    url: `/blog/${post.slug}`,
    type: "article",
    publishedTime: post.publishedAt,
    authors: [post.author],
    tags: post.tags,
  },
  twitter: { card: "summary_large_image", title: post.title, description: post.description },
};

export default function Post() {
  return (
    <BlogPostLayout post={post}>
      <p>
        Send 100 applications. Hear back from two. If that sounds like your job search, you&apos;re not
        alone — and you&apos;re probably not doing anything &quot;wrong&quot; in the obvious sense. The
        modern application funnel is broken in five specific ways, and once you know which one is killing
        you, the fix is usually fast.
      </p>

      <h2>Reason 1: Your resume isn&apos;t parsing</h2>
      <p>
        Roughly 75% of resumes are screened out by an Applicant Tracking System (ATS) before a human looks
        at them. The most common reasons: two-column layouts that confuse the parser, text inside headers or
        text boxes that gets dropped, missing keywords from the job description, and scanned PDFs that
        contain images instead of text.
      </p>
      <p>
        <strong>Fix:</strong> simplify to a single column, use standard section names (&quot;Work
        Experience,&quot; not &quot;My Journey&quot;), and mirror the language of the job description.
        We&apos;ve got a full guide in{" "}
        <a href="/blog/beat-the-ats-resume-guide-2026">How to Beat the ATS</a>.
      </p>

      <h2>Reason 2: You&apos;re applying too late</h2>
      <p>
        Most job postings get the majority of their applications in the first 72 hours. By the time a
        recruiter has 100+ resumes in the queue, they triage by recency and obvious qualification fit.
        Applying on day 10 means competing with everyone who applied on day 1, and you started behind.
      </p>
      <p>
        <strong>Fix:</strong> set up job alerts for your target companies and roles, and treat applications
        as time-sensitive. Apply within 24-48 hours of posting whenever possible. If a role has been open
        for more than 30 days, it&apos;s usually either stale or impossible to fill — both bad signs.
      </p>

      <h2>Reason 3: You&apos;re too &quot;senior&quot; or too &quot;junior&quot; on paper</h2>
      <p>
        Recruiters filter aggressively by title and years of experience. If your last title was
        &quot;Senior&quot; and you&apos;re applying for a &quot;Manager&quot; role, the recruiter may skip
        you assuming you&apos;ll bounce as soon as a senior IC role opens. Same in reverse: a Manager
        applying to Senior IC roles reads as a step backward.
      </p>
      <p>
        <strong>Fix:</strong> address it explicitly. A two-line note at the top of the resume (or in the
        cover letter) explaining the deliberate choice — &quot;Looking to return to hands-on engineering
        after 3 years of management&quot; — solves this. Without it, recruiters assume the worst.
      </p>

      <h2>Reason 4: Your resume reads as duties, not impact</h2>
      <p>
        &quot;Responsible for managing a team of 5 engineers&quot; says nothing. &quot;Led a 5-engineer team
        that shipped [thing], reducing [metric] by 30%&quot; says a lot. Recruiters scan resumes for{" "}
        <em>verbs that imply ownership and numbers that imply impact</em>. If yours has neither, it
        disappears into the pile.
      </p>
      <p>
        <strong>Fix:</strong> rewrite every bullet using the structure{" "}
        <code>verb + what + result</code>. If you can&apos;t find a result, the bullet is probably not worth
        including.
      </p>

      <h2>Reason 5: You&apos;re only applying through the front door</h2>
      <p>
        This is the biggest one. Public job boards are the most competitive channel by far — a single
        LinkedIn posting at a top company can get 1,000+ applications in 48 hours. Recruiters spend most of
        their time on inbound from their network, referrals from current employees, and proactive outreach
        to candidates they&apos;ve sourced. If you&apos;re only in the front-door queue, you&apos;re competing
        against the worst odds the job market offers.
      </p>
      <p>
        <strong>Fix:</strong> spend at least 30% of your job search time on direct outreach — to recruiters,
        hiring managers, and existing employees at target companies. We&apos;ve got templates that work in{" "}
        <a href="/blog/cold-recruiter-outreach-templates">Cold Outreach to Recruiters</a>.
      </p>

      <h2>The honest truth about &quot;applying more&quot;</h2>
      <p>
        Most job-seeker advice says: keep applying, it&apos;s a numbers game. That&apos;s only half true.
        Volume matters, but volume in the most competitive channel produces diminishing returns fast.
        The candidates who land good roles in 4-8 weeks are running a mix:{" "}
        <strong>~50% direct outreach and referrals, ~30% targeted applications, ~20% recruiter inbound</strong>.
        Almost nobody does this on their own, because it takes 4-6 hours a day.
      </p>
      <p>
        That&apos;s the gap JobGenius fills. Your account manager runs the volume and the outreach in
        parallel, so you&apos;re in the right pile and the right inbox at the right time —{" "}
        <a href="/how-it-works">see how it works</a>.
      </p>
    </BlogPostLayout>
  );
}
