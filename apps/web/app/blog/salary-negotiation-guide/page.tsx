import type { Metadata } from "next";
import BlogPostLayout from "../BlogPostLayout";
import { getPost } from "../posts";

const post = getPost("salary-negotiation-guide")!;

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
        The single highest-leverage hour of your career is the one between receiving a job offer and
        accepting it. A 10-20% bump on a $100K offer is $10-20K — for one conversation. Yet most candidates
        accept the first number they hear. This guide walks through the negotiation playbook that consistently
        moves offers up.
      </p>

      <h2>Before the offer: set yourself up</h2>

      <h3>1. Never give a number first</h3>
      <p>
        Recruiters ask for your expected salary on the application or in the first call. The answer is some
        version of: <em>&quot;I&apos;m focused on finding the right role first — once I understand the
        scope, I&apos;m happy to discuss compensation. What range has the team budgeted?&quot;</em>
      </p>
      <p>
        If they push: <em>&quot;Based on the market for this role and my experience, I&apos;d expect
        something in the upper end of your range. Can you share what that range is?&quot;</em>
      </p>

      <h3>2. Get a competing offer (or look like you might)</h3>
      <p>
        Leverage in negotiation comes from optionality. If you have one offer, you have a number. If you
        have two offers, you have leverage. Apply broadly, schedule interviews concurrently, and try to land
        decisions in the same week.
      </p>

      <h3>3. Research the actual band</h3>
      <p>
        <a href="https://www.levels.fyi" target="_blank" rel="noopener">Levels.fyi</a> for tech,{" "}
        <a href="https://www.salary.com" target="_blank" rel="noopener">Salary.com</a> and{" "}
        <a href="https://www.glassdoor.com" target="_blank" rel="noopener">Glassdoor</a> for everything
        else. Know the 50th, 75th, and 90th percentile for the title and city before any conversation. Walk
        in calibrated.
      </p>

      <h2>The offer call: what to say</h2>
      <p>
        When the recruiter delivers the offer, your only job is to thank them, ask for the full details in
        writing, and ask for time.
      </p>
      <blockquote>
        &quot;Thank you so much, I&apos;m really excited about the opportunity. Could you send everything in
        writing — base, bonus, equity, benefits — so I can review with my family? I&apos;ll get back to you
        within a few days.&quot;
      </blockquote>
      <p>
        Do not accept on the call. Do not say &quot;yes.&quot; Do not say &quot;the number sounds great.&quot;
        Even if it does. Especially if it does.
      </p>

      <h2>The counter: the script that works</h2>
      <p>
        Once you have the offer in writing, send the counter via email (calmer, less reactive than phone).
        Here&apos;s the structure:
      </p>
      <ol>
        <li>Reaffirm enthusiasm for the role.</li>
        <li>Anchor on a specific, justified number.</li>
        <li>Mention competing options without naming them, if you have them.</li>
        <li>Close with a clear ask.</li>
      </ol>
      <p>Example:</p>
      <blockquote>
        <em>
          Hi [Recruiter],
          <br />
          Thank you again for the offer — I&apos;m genuinely excited about joining the team and the
          opportunity to work on [specific project].
          <br />
          <br />
          After reviewing the package and comparing it with other conversations I&apos;m having, I&apos;d
          like to ask if you can bring the base to $X. Based on market data for this role and the impact
          I&apos;ve had in similar work — [brief specific example] — this would help me say yes
          confidently.
          <br />
          <br />
          Let me know what you can do. I&apos;m looking forward to making this work.
          <br />
          <br />
          Best,
          <br />
          [You]
        </em>
      </blockquote>

      <h2>What to ask for besides base salary</h2>
      <p>
        If the base is fixed, there are usually other levers:
      </p>
      <ul>
        <li><strong>Signing bonus</strong> — often easier to approve than higher base, since it doesn&apos;t affect long-term cost structure.</li>
        <li><strong>Equity</strong> — at startups, equity is often the most negotiable lever.</li>
        <li><strong>Start date</strong> — useful if you want time off between jobs.</li>
        <li><strong>Title</strong> — a senior-vs.-staff title can affect your trajectory more than $5K.</li>
        <li><strong>Vacation, remote work flexibility, learning budget</strong> — these all add real value.</li>
      </ul>

      <h2>The lines that lose you money</h2>
      <ul>
        <li>&quot;I was hoping for...&quot; (hope isn&apos;t a justification — bring data)</li>
        <li>&quot;I need at least...&quot; (sounds desperate — frame it around value)</li>
        <li>&quot;I&apos;ll accept if you can do $X&quot; (only say this if you mean it; otherwise you&apos;ve locked yourself in)</li>
        <li>&quot;Whatever you think is fair&quot; (you&apos;ve just handed over all your leverage)</li>
      </ul>

      <h2>How much can you actually move an offer?</h2>
      <p>
        In practice: 5-15% on base salary is normal. 20%+ happens when there&apos;s a competing offer, when
        the role is hard to fill, or when the initial offer was deliberately conservative. Equity and signing
        bonuses often move 30-50% from initial to final. Total compensation movement of 10-20% is a realistic
        target for most negotiations.
      </p>

      <p>
        At JobGenius, your account manager negotiates on your behalf when offers come in — which removes
        the most emotionally tough part of the process and consistently produces better outcomes than candidates
        negotiating alone. <a href="/how-it-works">See how it works.</a>
      </p>
    </BlogPostLayout>
  );
}
