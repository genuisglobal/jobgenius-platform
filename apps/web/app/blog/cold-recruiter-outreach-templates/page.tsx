import type { Metadata } from "next";
import BlogPostLayout from "../BlogPostLayout";
import { getPost } from "../posts";

const post = getPost("cold-recruiter-outreach-templates")!;

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
        Cold outreach to recruiters has earned a bad reputation because most of it is bad. Generic
        &quot;hope you&apos;re doing well&quot; openers, copy-pasted templates, no specific reason to
        reply. Done well, recruiter outreach is one of the highest-ROI activities in a job search —
        skipping the application queue entirely and landing in a real conversation. Here are five
        templates that consistently work, with breakdowns of why.
      </p>

      <h2>The principles behind every good outreach</h2>
      <ul>
        <li><strong>Be specific.</strong> Reference a role, a company event, or something in their feed. Generic = ignored.</li>
        <li><strong>Lead with value, not need.</strong> What can <em>you</em> bring? Not what you want.</li>
        <li><strong>Make replying easy.</strong> One clear ask. Yes/no question if possible.</li>
        <li><strong>Keep it under 120 words.</strong> Recruiters read on phones, between meetings.</li>
        <li><strong>Follow up once after 5-7 days.</strong> No reply ≠ no interest. Half of replies come on the follow-up.</li>
      </ul>

      <h2>Template 1: The &quot;saw your posting&quot; angle</h2>
      <p>For when you&apos;ve found a specific open role at their company.</p>
      <blockquote>
        <em>
          Hi [Name] — I saw [Company] is hiring a [Role] and wanted to reach out directly. I&apos;ve spent
          the last [X years] doing exactly this at [Company A] and [Company B], where I [one specific
          quantified result — e.g., &quot;cut customer onboarding time by 40%&quot;]. Would it be useful to
          chat for 15 minutes to see if there&apos;s a fit before I go through the formal application?
          <br />
          Resume attached either way. Thanks!
        </em>
      </blockquote>
      <p>
        <strong>Why it works:</strong> shows you did research, leads with a relevant result, offers low
        commitment (15 minutes), gives them an out (the resume is attached so they can pass it along even
        if they don&apos;t chat).
      </p>

      <h2>Template 2: The mutual-connection angle</h2>
      <p>When you have any LinkedIn connection in common.</p>
      <blockquote>
        <em>
          Hi [Name] — we&apos;re both connected to [Mutual Name], who I worked with at [Company]. I&apos;m
          exploring [Role] opportunities and noticed your team is growing fast in that area. I&apos;ve been
          working on [relevant problem] for [X years] and would love to learn more about what [Company]
          is building. Would you have 15 minutes in the next week or two?
        </em>
      </blockquote>
      <p>
        <strong>Why it works:</strong> mutual connection is the strongest cold-outreach signal there is.
        Mention them by name and the response rate jumps 3-5x.
      </p>

      <h2>Template 3: The &quot;your content&quot; angle</h2>
      <p>For recruiters or hiring managers who post on LinkedIn.</p>
      <blockquote>
        <em>
          Hi [Name] — your post last week on [specific topic from their feed] really resonated. The point
          about [specific detail they made] matches what I saw at [Company] when we were [related project].
          I&apos;m starting to explore my next move and [Company] is high on my list — would you be open to
          a quick chat?
        </em>
      </blockquote>
      <p>
        <strong>Why it works:</strong> proves you actually read their content (which 95% of cold outreach
        doesn&apos;t), and gives them a quick dopamine hit from being acknowledged.
      </p>

      <h2>Template 4: The &quot;career change&quot; angle</h2>
      <p>When you&apos;re transitioning industries or functions.</p>
      <blockquote>
        <em>
          Hi [Name] — I&apos;ve spent the last [X years] in [Industry/Function A] and I&apos;m moving into
          [Industry/Function B], where [Company] caught my attention because [specific reason]. The skills
          that overlap most: [specific transferable skill 1] and [specific transferable skill 2] — I&apos;ve
          used them to [specific result]. Would it be worth a 15-min call to see whether there&apos;s a path
          in?
        </em>
      </blockquote>
      <p>
        <strong>Why it works:</strong> addresses the recruiter&apos;s biggest concern (&quot;why are they
        switching?&quot;) head-on, makes transferable skills concrete with specific examples.
      </p>

      <h2>Template 5: The follow-up</h2>
      <p>Send 5-7 days after the original message if no reply.</p>
      <blockquote>
        <em>
          Hi [Name] — wanted to bump my note from last week. Totally understand if timing isn&apos;t right.
          If it&apos;d be more useful to point me to a colleague who handles [Role/Area], I&apos;d
          appreciate it.
          <br />
          Either way — thanks for your time.
        </em>
      </blockquote>
      <p>
        <strong>Why it works:</strong> gives them an easy out (forward to a colleague), removes pressure,
        and signals you&apos;re reasonable. About 40-50% of all replies come on this follow-up, not the
        original.
      </p>

      <h2>What to avoid</h2>
      <ul>
        <li>Don&apos;t open with &quot;I hope this finds you well&quot; — instant skim signal.</li>
        <li>Don&apos;t attach a generic resume — tailor the file name (e.g., <code>jane-doe-product-manager.pdf</code>) and the resume itself.</li>
        <li>Don&apos;t send the same message to 20 recruiters at one company — they talk.</li>
        <li>Don&apos;t follow up more than twice.</li>
        <li>Don&apos;t bcc anyone, ever.</li>
      </ul>

      <h2>How many of these should you send?</h2>
      <p>
        Expect a 10-20% reply rate from well-crafted cold outreach, and a 1-3% rate from generic templates.
        To get into 10 real conversations, plan to send 50-100 personalized messages. That&apos;s where most
        candidates stop — the personalization at volume is what kills them.
      </p>
      <p>
        This is also where a service like JobGenius pays for itself: your account manager runs the outreach
        at the volume needed while keeping each message personalized.{" "}
        <a href="/referral-network">See how the referral network works.</a>
      </p>
    </BlogPostLayout>
  );
}
