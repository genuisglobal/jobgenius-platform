import type { Metadata } from "next";
import BlogPostLayout from "../BlogPostLayout";
import { getPost } from "../posts";

const post = getPost("career-change-roadmap")!;

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
        Career change is one of the hardest moves anyone makes professionally. The economic stakes are
        high, the pattern-matching from hiring managers is brutal (&quot;you don&apos;t have direct
        experience&quot;), and most online advice is either &quot;follow your passion&quot; or
        &quot;just network more.&quot; Here&apos;s a realistic 6-month roadmap that actually works.
      </p>

      <h2>The honest framing: you&apos;re selling a transferable story</h2>
      <p>
        Hiring managers don&apos;t take chances on career-changers because they&apos;re skeptical, but
        because they don&apos;t see the bridge. Your entire job is to make the bridge obvious — so
        obvious that hiring them feels lower-risk than hiring a direct-match candidate.
      </p>
      <p>
        That bridge has three parts: <strong>narrative</strong> (why this change, why now),{" "}
        <strong>evidence</strong> (specific work that proves you can do the new thing), and{" "}
        <strong>vouchers</strong> (people in the new field who&apos;ll say &quot;yeah, they get it&quot;).
      </p>

      <h2>Month 1: Map and decide</h2>
      <ul>
        <li><strong>List 5-10 target roles you&apos;d genuinely want.</strong> Be specific: not &quot;marketing,&quot; but &quot;Senior Product Marketing Manager at a B2B SaaS company.&quot;</li>
        <li><strong>Read 20 JDs.</strong> Identify the skills, tools, and language that show up repeatedly. This is your reskilling shortlist.</li>
        <li><strong>Talk to 5 people doing it.</strong> Coffee chats, not pitches. Ask: &quot;What does your day actually look like?&quot; and &quot;What does it take to be hired into this role from outside?&quot;</li>
      </ul>
      <p>
        By the end of month 1, you should be able to write one sentence: &quot;I&apos;m moving from
        [current] to [target] because [reason], and the bridge is [transferable skills].&quot; If you
        can&apos;t, you&apos;re not ready to start applying yet.
      </p>

      <h2>Months 2-3: Build evidence</h2>
      <p>
        The single biggest difference between successful career-changers and the rest is{" "}
        <strong>specific, recent evidence of the new work</strong>. Without it, you&apos;re asking
        someone to take a leap. With it, you&apos;re showing them you&apos;ve already started.
      </p>
      <ul>
        <li><strong>Take on adjacent work at your current job.</strong> Easiest path. Volunteer for projects that touch the new function.</li>
        <li><strong>Build a side project.</strong> 1-2 things that show the new craft. For PM: a product spec for an app you use. For data: a public Kaggle analysis. For marketing: a landing page for a side product.</li>
        <li><strong>Get a credential, but only if it&apos;s respected.</strong> Some certifications matter (PMP for project managers, AWS for cloud, CFA for finance). Most don&apos;t. Ask the 5 people you talked to in month 1.</li>
      </ul>

      <h2>Month 4: Build the narrative and the deck</h2>
      <ul>
        <li><strong>Rewrite your resume for the new role.</strong> Lead each bullet with the transferable angle. Drop irrelevant detail.</li>
        <li><strong>Rewrite your LinkedIn About to start with the future.</strong> Sentence 1 says where you&apos;re going, then your past becomes context.</li>
        <li><strong>Write your story.</strong> 90 seconds. Why you&apos;re changing, what you&apos;ve done to prepare, what specifically you&apos;re looking for. Practice it. You&apos;ll say it in every interview and every networking call.</li>
      </ul>

      <h2>Months 5-6: Outreach and applications, in parallel</h2>
      <p>
        Career-changers cannot rely on cold applications. The pattern-matching against direct candidates
        is too strong. The mix that works:
      </p>
      <ul>
        <li><strong>~60% direct outreach.</strong> To people in the new field, hiring managers at target companies, and recruiters who specialize in the new function. Focus on warm intros where possible.</li>
        <li><strong>~30% targeted applications.</strong> Roles where your bridge story will land. Skip postings that explicitly require 5+ years of direct experience.</li>
        <li><strong>~10% creative angles.</strong> Pitching your own role, internal transfers at your current company, contract-to-hire arrangements.</li>
      </ul>

      <h2>Realistic timelines</h2>
      <p>
        Career changes typically take <strong>4-8 months from first outreach to accepted offer</strong>,
        compared to 6-12 weeks for a same-track move. They also often come with a temporary pay cut of
        10-25% — though most career-changers recover that within 2 years if they pick a growing function.
      </p>
      <p>
        The two predictors of success: <strong>evidence</strong> (do you have specific work that
        demonstrates the new craft?) and <strong>volume of conversations</strong> (have you talked to
        50+ people in the new field, not just 5?).
      </p>

      <h2>When to consider help</h2>
      <p>
        Career changers are exactly the group that benefits most from a managed search — the volume of
        outreach, the narrative-shaping, and the hours of warm intros are what win, and they&apos;re
        all hard to sustain solo while you still have a current job. At JobGenius, your account manager
        runs the search while you focus on building evidence and showing up well in interviews —{" "}
        <a href="/how-it-works">see how it works</a>.
      </p>
    </BlogPostLayout>
  );
}
