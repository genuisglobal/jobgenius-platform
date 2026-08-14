import type { Metadata } from "next";
import BlogPostLayout from "../BlogPostLayout";
import { getPost } from "../posts";

const post = getPost("beat-the-ats-resume-guide-2026")!;

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
    modifiedTime: post.updatedAt ?? post.publishedAt,
    authors: [post.author],
    tags: post.tags,
  },
  twitter: { card: "summary_large_image", title: post.title, description: post.description },
};

export default function Post() {
  return (
    <BlogPostLayout post={post}>
      <p>
        If you&apos;ve been submitting applications and hearing nothing back, you&apos;re probably not being
        rejected by humans — you&apos;re being rejected by software. Applicant Tracking Systems (ATS) screen
        an estimated 70-75% of resumes out before a recruiter ever sees them. This guide walks through
        how ATS parsers actually work in 2026 and the specific resume changes that get past them.
      </p>

      <h2>What an ATS actually does</h2>
      <p>
        An ATS is two things stitched together: a database of every resume submitted to a company, and a
        parser that extracts structured fields from those resumes (name, email, work history, skills,
        education). When a recruiter searches the database — &quot;Python AND SQL AND 5+ years&quot; —
        the ATS returns resumes where the parser confidently extracted those signals.
      </p>
      <p>
        If your resume parses badly, you don&apos;t show up in those searches. It doesn&apos;t matter how
        qualified you are. The recruiter never sees you.
      </p>

      <h2>The five resume changes that matter most</h2>

      <h3>1. Use a single-column layout</h3>
      <p>
        Two-column resumes — the ones with a sidebar listing skills and contact info — are gorgeous, and
        they confuse most parsers. The parser reads top-to-bottom, left-to-right, and a sidebar interleaves
        with your work history in ways that scramble dates, employers, and titles. Stick to a single column.
      </p>

      <h3>2. Match keywords from the job description, verbatim</h3>
      <p>
        Recruiters search the ATS using terms pulled directly from the job description. If the JD says
        &quot;TypeScript&quot; and your resume says &quot;TS,&quot; you don&apos;t match. If the JD says
        &quot;stakeholder management&quot; and yours says &quot;working with leaders,&quot; you don&apos;t
        match. Read the JD, identify the 8-12 most repeated terms, and make sure each one appears in your
        resume (in a way that&apos;s actually true).
      </p>

      <h3>3. Skip headers, footers, and text boxes</h3>
      <p>
        Many parsers ignore content inside Word headers/footers entirely. If your name and contact info live
        in the header, your resume becomes anonymous. Same with text boxes — they often get dropped. Put
        contact info as regular text at the top of the page.
      </p>

      <h3>4. Use standard section names</h3>
      <p>
        &quot;Career Highlights&quot; might sound more interesting than &quot;Work Experience,&quot; but
        the parser is looking for specific section headers it recognizes. Use the boring ones:{" "}
        <strong>Work Experience, Education, Skills, Certifications.</strong> Save the creativity for the
        bullets underneath.
      </p>

      <h3>5. Submit as a .docx or text-based PDF</h3>
      <p>
        A PDF exported from Word or Google Docs parses well. A PDF made by scanning a printed resume is an
        image and parses as nothing. If you&apos;re not sure, copy text from your PDF — if it copies cleanly,
        the ATS can read it.
      </p>

      <h2>What doesn&apos;t matter as much as people think</h2>
      <ul>
        <li>
          <strong>Fancy fonts</strong> — as long as it&apos;s a real text font (Calibri, Arial, Garamond,
          Helvetica), the parser doesn&apos;t care.
        </li>
        <li>
          <strong>Color</strong> — recruiters can see it; the parser ignores it.
        </li>
        <li>
          <strong>Length</strong> — one page vs. two doesn&apos;t affect ATS parsing. It affects how long a
          recruiter spends on it, but that&apos;s a different battle.
        </li>
        <li>
          <strong>&quot;ATS-optimized&quot; templates</strong> — most of these are fine, but they&apos;re
          not magic. The content matters more than the template.
        </li>
      </ul>

      <h2>How to test your resume against an ATS</h2>
      <p>
        The fastest test: paste your resume into a plain text file. If the result is readable and the
        sections are in the right order, an ATS will probably parse it fine. If the result is a jumble of
        misaligned text and missing fields, the parser will see the same jumble.
      </p>
      <p>
        Better test: services like{" "}
        <a href="https://www.jobscan.co" target="_blank" rel="noopener">Jobscan</a> compare your resume to a
        specific job description and surface keyword gaps. They&apos;re paid, but useful before a big
        application.
      </p>

      <h2>The honest truth about ATS-optimized resumes</h2>
      <p>
        Even a perfectly parsed resume only gets you into the search results. Once a recruiter sees the
        match, they still spend an average of 6-8 seconds skimming before deciding. So getting past the ATS
        is necessary, not sufficient — your bullets still need to make the case in those few seconds.
      </p>
      <p>
        At JobGenius, this is one of the first things your account manager does: rewrite your resume to
        match the specific roles you&apos;re targeting, then run applications at the volume needed to land
        interviews. If you&apos;d rather not figure this out alone,{" "}
        <a href="/how-it-works">see how it works</a>.
      </p>
    </BlogPostLayout>
  );
}
