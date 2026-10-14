import type { Metadata } from "next";
import BlogPostLayout from "../BlogPostLayout";
import { getPost } from "../posts";

const post = getPost("linkedin-profile-optimization")!;

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
        LinkedIn is where 80% of recruiter sourcing happens, but most profiles are essentially invisible.
        Recruiters use Boolean search to find candidates, and if your profile doesn&apos;t match what they
        type, you don&apos;t exist. Here are the 12 specific changes that move your profile from
        &quot;invisible&quot; to &quot;they keep messaging me&quot; — in order of impact.
      </p>

      <h2>1. Rewrite your headline</h2>
      <p>
        Default headline = your current job title. That&apos;s a waste — your headline is what shows up
        in every search result. Use the 220 characters to include role keywords recruiters search for.
      </p>
      <p>
        <strong>Bad:</strong> Senior Software Engineer at Acme<br/>
        <strong>Good:</strong> Senior Software Engineer @ Acme | Backend, distributed systems, Go, Postgres | Open to staff/principal IC roles
      </p>

      <h2>2. Set &quot;Open to Work&quot; (privately)</h2>
      <p>
        Turn on the &quot;Open to Work&quot; setting and choose <em>&quot;Recruiters only&quot;</em>{" "}
        (not the public green banner). This adds you to a private pool that LinkedIn surfaces to
        recruiters in their searches. Massive boost in InMail volume, zero risk of your current
        employer seeing it.
      </p>

      <h2>3. Use a real, recent photo</h2>
      <p>
        Profiles with photos get 14x more views. Skip the wedding crop or your sunglasses photo. A clean
        head-and-shoulders shot in decent lighting is fine — phones are good enough now.
      </p>

      <h2>4. Add a banner image</h2>
      <p>
        The banner is free real estate. A simple gradient or a clean visual related to your work signals
        intent and effort. Recruiters notice the difference between a polished profile and a default one.
      </p>

      <h2>5. Rewrite your About section as a pitch</h2>
      <p>
        Most About sections are autobiographies. They should be sales pitches. 3-4 short paragraphs:
        what you do, what you&apos;ve shipped/owned, what you&apos;re looking for. Keep it skimmable —
        line breaks help.
      </p>

      <h2>6. Front-load each role with impact</h2>
      <p>
        First line of every role description should be your headline impact. Recruiters skim. If your
        first line is &quot;Joined as the third engineer on the team,&quot; they move on. If it&apos;s
        &quot;Led the rebuild of the checkout flow, cutting cart abandonment by 22%,&quot; they stop.
      </p>

      <h2>7. List 50 skills (the cap)</h2>
      <p>
        LinkedIn lets you list up to 50 skills. Use all 50. Skills feed directly into recruiter
        searches — &quot;Python AND SQL AND ETL&quot; only returns profiles with those skills listed.
        Include hard skills, software, frameworks, and a few soft skills.
      </p>

      <h2>8. Get 3-5 recent recommendations</h2>
      <p>
        Recommendations are social proof. One paragraph from a manager, peer, and direct report is
        plenty. Ask people who you&apos;ve already done good work for — they&apos;re usually happy to
        write one. Recent (within 12 months) is way better than old.
      </p>

      <h2>9. Customize your URL</h2>
      <p>
        Default URL = <code>linkedin.com/in/jane-doe-3a8f72b1</code>. Change it to
        <code>linkedin.com/in/janedoe</code>. Looks more professional, easier to share, and Google often
        surfaces it as the first result when someone searches your name.
      </p>

      <h2>10. Turn on &quot;Career Interests&quot; targeting</h2>
      <p>
        In settings, specify the exact titles, locations, company sizes, and start dates you&apos;re
        targeting. LinkedIn uses this to match you to recruiter searches that specify those filters.
        Most people leave this default and miss matches.
      </p>

      <h2>11. Post or comment once a week</h2>
      <p>
        You don&apos;t need to be an &quot;influencer.&quot; Just don&apos;t be dormant. A profile with
        recent activity signals to recruiters that you&apos;re alive and engaged. Even thoughtful
        comments on others&apos; posts move the needle.
      </p>

      <h2>12. Match the language of your target roles</h2>
      <p>
        If you want to be a &quot;Product Manager&quot; and your profile says &quot;Program Lead,&quot;
        recruiters searching for PMs won&apos;t find you. Read 10 JDs for your target role, list the
        terms that show up repeatedly, and make sure your profile uses those exact terms.
      </p>

      <h2>How long does it take?</h2>
      <p>
        Done in one sitting: about 2-3 hours. Worth every minute. Most candidates see a noticeable
        jump in profile views and recruiter InMails within 2 weeks of completing this list.
      </p>
      <p>
        At JobGenius, your account manager reviews your LinkedIn as part of onboarding and flags the
        specific changes that will move the needle for your target roles —{" "}
        <a href="/how-it-works">see how it works</a>.
      </p>
    </BlogPostLayout>
  );
}
