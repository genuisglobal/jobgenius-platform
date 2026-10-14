import type { Metadata } from "next";
import BlogPostLayout from "../BlogPostLayout";
import { getPost } from "../posts";

const post = getPost("star-method-behavioral-interview-guide")!;

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
        Every interview now includes some version of &quot;Tell me about a time when...&quot; — and
        the way you answer can decide the offer. Strong candidates use the STAR method on autopilot.
        Weak candidates ramble through stories that have no point. Here&apos;s how to use STAR so
        every answer lands.
      </p>

      <h2>What STAR actually means</h2>
      <p>
        <strong>S — Situation.</strong> One sentence of context. Where, when, what was at stake.<br/>
        <strong>T — Task.</strong> What specifically you were responsible for.<br/>
        <strong>A — Action.</strong> What <em>you</em> did. Not &quot;we&quot; — you.<br/>
        <strong>R — Result.</strong> The measurable outcome, plus what you learned.
      </p>
      <p>
        That&apos;s it. The trap is treating the four parts as equal. They&apos;re not. Most candidates
        spend 80% of the answer on Situation and Task, then run out of time before Action and Result.
        Flip it: 20% setup, 60% Action, 20% Result.
      </p>

      <h2>The structure that works every time</h2>
      <ol>
        <li>
          <strong>Setup (15 seconds).</strong> &quot;At [Company], I was [role]. Our team was responsible
          for [thing]. We hit [specific problem].&quot;
        </li>
        <li>
          <strong>Action (60-90 seconds).</strong> &quot;I did three things. First, [action 1]. Second,
          [action 2]. Third, [action 3].&quot;
        </li>
        <li>
          <strong>Result (15-20 seconds).</strong> &quot;The outcome was [quantified result]. What I
          took from it: [insight].&quot;
        </li>
      </ol>
      <p>
        Total: ~2 minutes. If you go longer, the interviewer is mentally checking out by the end.
      </p>

      <h2>Worked example: &quot;Tell me about a time you led through conflict&quot;</h2>
      <blockquote>
        <strong>Setup:</strong> &quot;At Acme, I was the tech lead on a 6-person team rebuilding the
        billing service. About 6 weeks in, two of my senior engineers strongly disagreed on whether
        to use SQS or Kafka, and they&apos;d stopped collaborating on the design doc.&quot;
        <br /><br />
        <strong>Action:</strong> &quot;I did three things. First, I sat down with each of them
        separately to understand the actual concern — turned out one was worried about ops complexity,
        the other about throughput limits at scale. Second, I set up a 30-minute working session,
        framed as a decision matrix rather than a debate — we listed each option&apos;s tradeoffs
        against three criteria we agreed mattered. Third, I made the call and committed publicly,
        so the disagreement couldn&apos;t restart.&quot;
        <br /><br />
        <strong>Result:</strong> &quot;We shipped on schedule. More importantly, both engineers
        told me later they appreciated the structured process. I&apos;ve used that decision-matrix
        approach on every contentious technical call since.&quot;
      </blockquote>

      <h2>The five behavioral prompts that show up in 80% of interviews</h2>
      <ol>
        <li>Tell me about a time you led a project / team / change.</li>
        <li>Tell me about a time you disagreed with a manager or stakeholder.</li>
        <li>Tell me about a time you failed (or made a mistake).</li>
        <li>Tell me about a time you handled a tight deadline / competing priorities.</li>
        <li>Tell me about your proudest accomplishment / biggest impact.</li>
      </ol>
      <p>
        Prep two strong STAR stories for each — different stories that show different facets. That&apos;s
        10 stories total, and they&apos;ll cover 80% of any behavioral interview you ever do.
      </p>

      <h2>Common mistakes that lose offers</h2>
      <ul>
        <li><strong>Saying &quot;we&quot; instead of &quot;I.&quot;</strong> Interviewers want to know what <em>you</em> did. Use &quot;we&quot; for context, &quot;I&quot; for actions.</li>
        <li><strong>No numbers.</strong> &quot;Improved performance&quot; is forgettable. &quot;Cut p95 latency from 800ms to 120ms&quot; is memorable.</li>
        <li><strong>Picking too small a story.</strong> A tactical fix from last week doesn&apos;t show seniority. Pick stories with real stakes.</li>
        <li><strong>Picking too big a story.</strong> A two-year project takes too long to set up. Pick a moment, not a saga.</li>
        <li><strong>No learning at the end.</strong> Strong candidates always close with what they took from it. Shows growth and self-awareness.</li>
      </ul>

      <h2>How to prep efficiently</h2>
      <p>
        Don&apos;t write 50 stories. Write your 10, practice them out loud (not in your head — out loud,
        with a timer), and trust that you can adapt them to most prompts. The goal is to be fluent,
        not scripted. If you sound like you&apos;re reading, you went too far.
      </p>
      <p>
        At JobGenius, your account manager runs mock behavioral interviews with feedback on each story,
        including which ones to swap and where the pacing is off —{" "}
        <a href="/interview-prep">see how interview prep works</a>.
      </p>
    </BlogPostLayout>
  );
}
