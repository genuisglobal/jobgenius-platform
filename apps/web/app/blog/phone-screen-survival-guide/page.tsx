import type { Metadata } from "next";
import BlogPostLayout from "../BlogPostLayout";
import { getPost } from "../posts";

const post = getPost("phone-screen-survival-guide")!;

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
        The 30-minute recruiter phone screen is where roughly 60% of candidates get cut. It feels casual,
        so people prep for it less than the technical rounds — and then get filtered for reasons they
        never get told. Here&apos;s exactly what recruiters are listening for and how to pass cleanly.
      </p>

      <h2>What the recruiter is actually evaluating</h2>
      <p>
        The recruiter is not deciding if you can do the job. They&apos;re deciding if you&apos;re worth
        the hiring manager&apos;s 45 minutes. Specifically, they&apos;re checking five things:
      </p>
      <ol>
        <li><strong>Basic competence in your stated experience.</strong> Can you talk about your last role coherently?</li>
        <li><strong>Comp alignment.</strong> Are your expectations in the band, or will this fall apart later?</li>
        <li><strong>Motivation.</strong> Why this role, why this company, why now?</li>
        <li><strong>Logistics.</strong> Start date, location, work authorization, remote/hybrid fit.</li>
        <li><strong>Communication.</strong> Do you sound like someone the hiring manager will want to talk to?</li>
      </ol>
      <p>
        Cover those five clearly and you&apos;ll pass almost every phone screen.
      </p>

      <h2>The opening 5 minutes</h2>
      <p>
        Recruiter: <em>&quot;Walk me through your background.&quot;</em>
      </p>
      <p>
        This is not an invitation to tell your life story. 90 seconds, structured:
      </p>
      <ol>
        <li>One sentence on what you do now.</li>
        <li>One sentence on the arc that got you here.</li>
        <li>2-3 sentences on what you&apos;re looking for next and why this role caught your attention.</li>
      </ol>
      <p>
        Recruiters who&apos;ve done 500 of these can tell within 90 seconds whether to keep going or
        wrap up early. Don&apos;t spend 8 minutes recapping your resume.
      </p>

      <h2>The compensation question</h2>
      <p>
        This is where most candidates lose money. The recruiter will ask some version of:
      </p>
      <blockquote>
        <em>&quot;What kind of compensation are you looking for?&quot;</em>
      </blockquote>
      <p>
        Wrong answer: give a number. Right answer:
      </p>
      <blockquote>
        <em>&quot;I&apos;m focused on finding the right role first — once I understand the scope and
        level, I&apos;m happy to discuss compensation. What range has the team budgeted?&quot;</em>
      </blockquote>
      <p>
        If they push, give a range based on actual market data (Levels.fyi, Glassdoor) — and put the
        bottom of your range at what would actually make you say yes. The number you say first becomes
        the anchor for the rest of the process.
      </p>
      <p>
        More on this: <a href="/blog/salary-negotiation-guide">Salary Negotiation Guide</a>.
      </p>

      <h2>The &quot;why are you leaving?&quot; question</h2>
      <p>
        Trap. Never speak badly about your current employer. Even if it&apos;s true. Recruiters listen
        for negativity as a signal that you&apos;ll be a difficult hire.
      </p>
      <p>
        Frame the move forward, not the escape:
      </p>
      <blockquote>
        <em>&quot;I&apos;ve learned a lot at [Company] — especially [specific thing]. At this point I&apos;m
        looking for [specific thing the new role offers] that I don&apos;t see a path to in my current
        role.&quot;</em>
      </blockquote>

      <h2>The logistics check</h2>
      <p>
        These questions seem boring. They&apos;re actually disqualifiers. Be ready with crisp answers:
      </p>
      <ul>
        <li><strong>When could you start?</strong> &quot;Standard 2-3 weeks notice, with flexibility if needed.&quot;</li>
        <li><strong>Are you authorized to work in [country]?</strong> Direct yes/no. If you need visa sponsorship, say so now — finding out at offer stage burns the relationship.</li>
        <li><strong>Are you OK with [office/hybrid/remote]?</strong> If the answer is no, end the conversation here and save everyone time.</li>
        <li><strong>Where are you in your search?</strong> &quot;Active but selective — about 3-4 conversations in progress.&quot; Signals demand without sounding desperate.</li>
      </ul>

      <h2>Your questions at the end</h2>
      <p>
        Always have 2-3 questions ready. Skipping this is the #1 reason recruiters mark candidates as
        &quot;low interest.&quot; Good ones for a phone screen:
      </p>
      <ul>
        <li>What does the team look like? Who would I report to?</li>
        <li>What does success look like in the first 6 months?</li>
        <li>What does the rest of the interview process look like, and what&apos;s your timeline?</li>
        <li>What&apos;s the team&apos;s biggest challenge right now?</li>
      </ul>
      <p>
        Skip questions that you could&apos;ve answered yourself by reading the careers page. They make
        you look unprepared.
      </p>

      <h2>The last 60 seconds</h2>
      <p>
        Close clearly. Don&apos;t hint, don&apos;t hedge:
      </p>
      <blockquote>
        <em>&quot;Thanks — this was helpful. Based on what we discussed, I&apos;m really interested in
        moving forward. What are the next steps?&quot;</em>
      </blockquote>
      <p>
        Explicit interest at the end of a phone screen demonstrably increases your odds of advancing.
        Recruiters write &quot;candidate is excited&quot; or &quot;candidate seemed lukewarm&quot; in
        their notes — and that note influences whether you advance.
      </p>

      <h2>Common mistakes that cost the round</h2>
      <ul>
        <li>Taking the call from a noisy cafe or a moving car. Find a quiet spot.</li>
        <li>Not researching the company. Even 15 minutes of reading the careers page and a recent press release shows.</li>
        <li>Forgetting the role title and team. Open the JD in a tab during the call.</li>
        <li>Bad-mouthing your current employer.</li>
        <li>Asking about compensation before they bring it up.</li>
      </ul>

      <p>
        At JobGenius, your account manager preps you for each company-specific phone screen, including
        the comp conversation and likely recruiter questions —{" "}
        <a href="/interview-prep">see how interview prep works</a>.
      </p>
    </BlogPostLayout>
  );
}
