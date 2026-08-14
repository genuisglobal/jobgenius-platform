# JobGenius Marketing Scheme

## Positioning

JobGenius should position itself as a managed job search execution service, not as a generic AI career tool.

Working headline:

- `A managed job search for people done applying alone.`

Supporting message pillars:

- `Execution`: a dedicated account manager runs applications, outreach, follow-up, and pipeline management.
- `Leverage`: always-on AI keeps matching and queueing roles while the human operator applies judgment.
- `Outcomes`: clients spend less time coordinating the search and more time preparing for interviews.

## Ideal Customers

Primary ICP:

- Mid-career white-collar professionals in competitive markets who are actively searching now.
- Strongest role clusters already supported in the product: software, product, data, marketing, finance, and design.
- Candidates with enough experience to benefit from better positioning, structured outreach, and interview prep.

Secondary ICP:

- Managers and senior ICs who do not have time to run a disciplined search themselves.
- Recent graduates who need structured outreach and interview prep, but should likely have separate pricing and proof.

Poor-fit segments:

- People looking only for a DIY resume tool.
- Candidates expecting guaranteed placement in days.
- Very broad or low-intent searchers who cannot define role, level, or geography.

## Core Funnel

1. Role-specific landing page
2. Homepage or pricing page validation
3. Signup and onboarding
4. Managed search starts
5. Interview prep and referral/outreach support

Best entry pages already exist in `apps/web/app/for/[role]/page.tsx`. Those pages should be treated as acquisition pages, not side pages hidden in the footer.

## Channel Mix

### 1. SEO

Highest-leverage SEO program:

- Build out role pages already present under `/for/*`.
- Publish comparison pages such as `JobGenius vs applying alone`, `JobGenius vs recruiters`, and `JobGenius vs career coaches`.
- Publish problem-led pages: recruiter outreach, interview prep, offer timelines, job search after layoffs, job search while employed.
- Keep blog posts mapped to bottom-funnel queries, not broad career inspiration.

SEO priority order:

1. Role pages
2. Pricing and FAQ
3. Comparison pages
4. Bottom-funnel blog content

### 2. LinkedIn Content

LinkedIn should focus on operational proof, not brand fluff.

Content themes:

- Before/after examples of candidate positioning
- Outreach teardowns
- Interview-prep clips or transcript snippets
- "What our AM changed this week" posts
- Role-specific hiring insights from active searches

Rule:

- Every LinkedIn post should point to one landing page or one signup path.

### 3. Partnerships

Best partner types:

- Resume writers
- Bootcamps
- Alumni groups
- Layoff communities
- Niche role communities for PM, data, SWE, and marketers

Offer structure:

- Referral fee or revenue share
- Co-branded landing pages
- Unique referral codes already supported by signup

### 4. Paid Acquisition

Do not start with broad paid social.

Start with:

- High-intent search terms around managed job search, recruiter outreach service, interview prep service, and role-specific job search help.
- Retargeting visitors who hit pricing, FAQ, or role pages but do not sign up.

Avoid:

- Broad awareness campaigns before landing-page conversion is stronger.

## Messaging Architecture

### Top-of-page promise

- `We run the search. You show up ready for interviews.`

### Proof points

- Dedicated account manager
- Shared portal with visible activity
- Role-specific pages by market
- Transparent pricing with upfront fee and post-offer success fee

### Objections to address everywhere

`Is this just another AI tool?`

- Answer with the human operator model and portal visibility.

`Why pay for this instead of doing it myself?`

- Answer with execution time saved, recruiter outreach, and interview-prep leverage.

`What happens if I do not get hired?`

- Answer with transparent registration fee coverage and no success fee without an accepted offer.

## Product-Led Marketing Changes

Changes already worth implementing in the web app:

- Put role pages on the homepage, not only in the footer.
- Make pricing language consistent between hero, pricing, FAQ, and signup.
- Replace weak vanity stats with concrete service-model clarity.
- Treat signup as onboarding, not as a plain auth form.

Next product-marketing moves:

- Add a fit-check lead form for high-intent visitors using the existing `/api/marketing/lead` backend.
- Add social-proof blocks based on real placements, industries, and timelines once verified data is available.
- Add comparison landing pages for each primary alternative to JobGenius.

## Metrics

Primary metrics:

- Visitor to signup conversion by landing page
- Pricing-page to signup conversion
- Role-page to signup conversion
- Signup to completed onboarding conversion
- Completed onboarding to first interview booked

Secondary metrics:

- Blog to role-page click-through
- Referral-code usage
- Return visits to pricing and FAQ

## 90-Day Execution Plan

### Days 1-30

- Surface role pages on the homepage and in campaign links.
- Tighten pricing and trust messaging.
- Standardize one CTA path: signup and onboarding.

### Days 31-60

- Publish 6 to 10 role-specific and comparison pages.
- Launch LinkedIn content tied to those pages.
- Start partnership outreach to communities and resume writers.

### Days 61-90

- Test a fit-call funnel using the existing marketing lead API.
- Retarget pricing and role-page visitors.
- Double down on the best-converting roles and channels.
