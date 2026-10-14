import type { Metadata } from "next";
import BlogPostLayout from "../BlogPostLayout";
import { getPost } from "../posts";

const post = getPost("job-search-while-employed")!;

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
        Searching for a job while you have one is the right move — your leverage is much higher than
        an unemployed candidate&apos;s, you don&apos;t take the first offer out of desperation, and
        companies value &quot;currently employed&quot; more than they admit. The only catch: getting
        caught can cost you the current job. Here&apos;s how to run a quiet search.
      </p>

      <h2>LinkedIn settings: do these first</h2>
      <ul>
        <li>
          <strong>Open to Work → Recruiters only.</strong> Never &quot;All LinkedIn members.&quot; The
          public green banner is the fastest way to get caught — your coworkers will see it within
          24 hours.
        </li>
        <li>
          <strong>Turn off notification of profile updates.</strong> Settings → Visibility → &quot;Share
          profile updates with your network&quot; → <strong>No</strong>. Otherwise every change pings your
          whole company.
        </li>
        <li>
          <strong>Hide activity broadcasts.</strong> Same settings panel. Stops &quot;Jane is now
          connected with [recruiter from competitor]&quot; from showing up in feeds.
        </li>
        <li>
          <strong>Set profile viewing to private when you&apos;re looking.</strong> If you research
          hiring managers, they won&apos;t see your name show up in their &quot;who viewed your
          profile.&quot;
        </li>
      </ul>

      <h2>Interview scheduling: the practical playbook</h2>
      <ul>
        <li>
          <strong>Cluster interviews on the same day off.</strong> Burn one PTO day for 3-4 interviews
          rather than 3-4 half-days that look suspicious.
        </li>
        <li>
          <strong>Mornings before work, lunch hours, and evenings.</strong> Most recruiters will
          accommodate — they know the drill.
        </li>
        <li>
          <strong>Take video calls from your car or home.</strong> Never from the office. Even if you
          have a private room, audio carries and Zoom names are visible on calendars.
        </li>
        <li>
          <strong>Don&apos;t put company names on your work calendar.</strong> Block time as &quot;personal
          appointment.&quot; Most coworkers won&apos;t click in.
        </li>
        <li>
          <strong>Don&apos;t wear a suit on interview days if your office is casual.</strong> Change in
          a coffee shop bathroom if needed.
        </li>
      </ul>

      <h2>References: the trap most people walk into</h2>
      <p>
        When a final-stage company asks for references, the wrong move is to give your current manager.
        Even framed as &quot;please wait until I&apos;ve accepted,&quot; you&apos;ve put the secret in
        their hands. Use:
      </p>
      <ul>
        <li>Former managers (always safe).</li>
        <li>Peers and skip-level colleagues you trust.</li>
        <li>Clients or partners who&apos;ve seen your work.</li>
      </ul>
      <p>
        If the new company insists on your current manager: politely ask for the reference to happen
        only after a signed offer. Most reasonable companies accept this.
      </p>

      <h2>When colleagues ask &quot;what&apos;s going on?&quot;</h2>
      <p>
        At some point someone will notice — you took a Tuesday off, your LinkedIn photo is suddenly
        better, you skipped a non-essential meeting. The right answer is bland and unmemorable.
      </p>
      <blockquote>
        <em>&quot;Personal stuff, nothing exciting.&quot;</em>
        <br/>
        <em>&quot;Just trying to use up vacation before it caps.&quot;</em>
        <br/>
        <em>&quot;Updating my profile, figured I should keep it current.&quot;</em>
      </blockquote>
      <p>
        Don&apos;t lie aggressively (that&apos;s memorable). Don&apos;t overshare. Move the conversation
        on.
      </p>

      <h2>The one moment where caution slips</h2>
      <p>
        Once you&apos;re excited about an offer, the urge to tell a trusted coworker becomes powerful.
        Don&apos;t. Almost every leak we see in this space starts with &quot;I told one person, just
        my work-friend.&quot; Tell people after you&apos;ve signed and given notice. The 2-4 weeks of
        anticipation will pass.
      </p>

      <h2>If you do get caught</h2>
      <p>
        It happens. Don&apos;t panic. The boring honest answer almost always works:
      </p>
      <blockquote>
        <em>&quot;Yes — I&apos;ve been having some early conversations to understand the market. I&apos;m
        still committed here and I&apos;ll let you know if anything serious comes up before it does. I
        wanted to give you a heads-up rather than have you find out indirectly.&quot;</em>
      </blockquote>
      <p>
        Most managers respect this more than denial. A few will react badly — and if they do, you have
        even more reason to get out cleanly.
      </p>

      <h2>The case for using help</h2>
      <p>
        The hardest part of an employed search isn&apos;t the secrecy — it&apos;s the volume of
        applications and outreach you can&apos;t physically do during work hours. This is exactly the
        gap a service like JobGenius fills: your account manager runs the search while you keep your
        current job intact, and you only step in for interviews —{" "}
        <a href="/how-it-works">see how it works</a>.
      </p>
    </BlogPostLayout>
  );
}
