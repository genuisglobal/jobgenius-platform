# Recruiter / Hiring Partner Acquisition Spec

## Objective

Build a low-friction recruiter acquisition flow that works for:

- in-house recruiters
- recruitment agencies
- staffing partners
- search firms
- hiring intermediaries

The product goal is not `get recruiters to sign up`.

The product goal is:

- get a recruiter or partner to submit real hiring demand fast
- capture enough data to follow up intelligently
- avoid forcing account creation before value is clear
- create an optional repeat-partner workflow only after intent is proven

## Core Product Position

The default motion must be `submit a role` or `request candidates`, not `create account`.

Why:

- recruiters optimize for speed and relevance
- agencies optimize for deal flow and candidate quality
- neither group wants software setup before seeing value

Therefore:

1. Main path: no-account intake
2. Secondary path: optional magic-link partner access
3. Internal path: AM/admin can add recruiter records manually

## What We Should Not Do

Do not lead with:

- password signup
- long multi-step onboarding
- mandatory dashboard creation
- demo-booking as the only CTA
- large forms just to “capture recruiter data”

Do not use `middle men` in any external copy.

Use:

- Recruitment agencies
- Staffing partners
- Talent partners
- Search firms
- Recruiting partners

## Personas

### 1. In-House Recruiter

Motivation:

- fill a role quickly
- review relevant candidates with low admin overhead

Primary CTA:

- `Submit a role`
- `Request candidates`

### 2. Agency / Staffing Partner

Motivation:

- fill client reqs faster
- get candidate supply without heavy setup

Primary CTA:

- `Hiring for clients`
- `Become a talent partner`

### 3. Internal Recruiter Contact Capture

Motivation:

- AM/admin adds recruiters from outreach, LinkedIn, referrals, events, or existing relationships

Primary CTA:

- internal only

## Product Recommendation

Use 3 acquisition lanes.

### Lane A: Public No-Account Hiring Intake

For recruiters hiring now.

Flow:

1. Land on recruiter/partner page
2. Choose persona:
   - `Hiring for my company`
   - `Hiring for clients`
3. Complete short form
4. Receive instant confirmation
5. Internal team reviews and follows up
6. Recruiter receives magic-link email only if needed

### Lane B: Optional Repeat-Partner Access

For recruiters/agencies that already engaged and want repeat usage.

Rules:

- no password
- magic link only
- only introduced after first successful interaction or clear intent

### Lane C: Internal CRM Capture

For AM/admin use.

Flow:

1. AM/admin manually creates recruiter/partner
2. System dedupes against existing contacts
3. Contact enters same lifecycle and can later receive magic-link access

## Public IA Recommendation

Create a dedicated public page, not a generic referral page.

Suggested route:

- `/hire`
- or `/partners`

Preferred:

- `/hire`

Reason:

- clearer intent
- better for both in-house and agency demand

### Hero Copy

Eyebrow:

`For Recruiters & Hiring Partners`

Headline:

`Send a role. We’ll send relevant candidates fast.`

Subtitle:

`Hiring for your company or for clients? Share a role or tell us what you need. No platform setup required. No password required.`

Primary CTA:

`Submit a role`

Secondary CTA:

`Hiring for clients`

Trust bar copy:

- `No long intake form`
- `No software setup required`
- `Optional partner portal later`

## Persona Split

The first decision should be explicit.

### Option 1: Hiring for my company

Use when:

- internal talent acquisition
- hiring manager delegates recruiting
- startup founder hiring directly

### Option 2: Hiring for clients

Use when:

- recruitment agencies
- staffing firms
- independent recruiters
- talent brokers / hiring partners

This split matters because agencies need different follow-up and qualification.

## Form Design

The first form must be very short.

### Shared Rules

- max 5 required fields
- 1 screen
- mobile-friendly
- no password
- no account creation
- support paste-a-job-link as the fastest path

### In-House Recruiter Form

Required:

- `Work email`
- `Company name`
- `Role title or job link`
- `Location`

Optional:

- `LinkedIn profile`
- `Hiring urgency`
- `Anything we should know?`

CTA:

`Request candidates`

### Agency / Hiring-for-Clients Form

Required:

- `Work email`
- `Agency name`
- `Role title or job link`
- `Hiring market or location`

Optional:

- `LinkedIn profile`
- `Client company name`
- `What kinds of roles do you usually fill?`
- `Do you have a live req now?`

CTA:

`Get matched candidates`

### Fastest Possible Variant

For some traffic sources, offer an even shorter form:

- `Work email`
- `Paste job link`

Everything else can be enriched later.

## Immediate Success State

After submit, show:

Headline:

`Got it. We’ll review this and reply quickly.`

Body:

`You do not need to create an account. If we need more information or have relevant candidates, we’ll email you directly.`

Optional follow-up promise:

`Typical response time: within 1 business day.`

This expectation is important. Low-friction acquisition fails if response time is slow.

## Email Follow-Up

Do not send a “complete your account” email.

Send one of these:

### Email 1: Submission Confirmation

Subject:

`We received your hiring request`

Body:

- confirms receipt
- repeats role/company details
- says no setup is required
- offers one-click response actions

One-click actions:

- `Send profiles`
- `Add more details`
- `Not hiring right now`
- `Wrong contact`
- `Refer teammate`

### Email 2: Magic-Link Access

Only send if:

- recruiter asks to manage multiple roles
- recruiter is a repeat partner
- agency submits multiple live reqs

Subject:

`Access your partner workspace`

Body:

- one-click magic link
- no password language

## Recommended Funnel Architecture

### Top-of-Funnel

Traffic sources:

- recruiter-specific landing page
- outreach by AM/admin
- agency partner outreach
- footer/site nav link
- seeker referrals to recruiters
- LinkedIn outreach

### Mid-Funnel

Convert public demand into:

- recruiter record
- role request
- owner assignment
- follow-up task

### Bottom-Funnel

After first response:

- send candidate profiles
- schedule follow-up
- optionally grant repeat-partner access

## Strong Product View

Do not treat `manual recruiter data entry` and `recruiter signup` as equal public flows.

Correct structure:

- public no-account intake
- internal CRM capture
- optional partner access later

That keeps the first interaction frictionless while still letting the business build a durable recruiter database.

## Data Model Recommendation

The current schema already has:

- `recruiters`
- `recruiter_threads`
- `outreach_messages`
- `outreach_plans`
- `recruiter_opt_outs`
- `network_contacts`

### Recommended System of Record

Use `recruiters` as the shared external hiring-side entity for this workflow.

Reason:

- global, not AM-scoped
- already tied to outreach and recruiter threading

Keep `network_contacts` for warm-network directory use cases:

- personal recruiter contacts
- referrals
- relationship mapping

Do not make `network_contacts` the primary inbound recruiter-demand table.

### Recommended Table Strategy

#### 1. Extend `recruiters`

Add:

- `phone text`
- `company_domain text`
- `company_website text`
- `partner_type text`
  - `in_house`
  - `agency`
  - `staffing_partner`
  - `search_firm`
  - `independent_recruiter`
- `intake_source text`
  - `public_form`
  - `manual_add`
  - `outbound`
  - `import`
  - `referral`
- `preferred_contact_method text`
  - `email`
  - `phone`
  - `linkedin`
- `do_not_contact boolean default false`
- `owner_account_manager_id uuid null`
- `notes text`

Keep existing `status`, but use it for relationship-level state:

- `NEW`
- `CONTACTED`
- `ENGAGED`
- `INTERVIEWING`
- `CLOSED`

#### 2. Add `recruiter_role_requests`

Purpose:

- store inbound hiring demand
- support multiple live reqs per recruiter/agency

Suggested columns:

- `id`
- `recruiter_id`
- `submitted_by_email`
- `persona_type`
  - `in_house`
  - `agency`
- `company_name`
- `client_company_name`
- `role_title`
- `job_url`
- `location`
- `employment_type`
- `seniority_level`
- `hiring_urgency`
- `details`
- `status`
  - `new`
  - `reviewing`
  - `qualified`
  - `awaiting_details`
  - `candidate_shortlist_sent`
  - `active`
  - `closed`
  - `rejected`
- `assigned_account_manager_id`
- `first_response_at`
- `last_outbound_at`
- `closed_reason`
- `created_at`
- `updated_at`

#### 3. Add `recruiter_magic_links`

Purpose:

- optional no-password partner access

Suggested columns:

- `id`
- `recruiter_id`
- `token_hash`
- `expires_at`
- `used_at`
- `created_at`
- `created_by`

#### 4. Optional: `recruiter_partner_activity`

Purpose:

- audit trail for inbound demand and one-click actions

Suggested columns:

- `id`
- `recruiter_id`
- `role_request_id`
- `activity_type`
- `details jsonb`
- `created_at`
- `created_by`

## Dedupe Rules

This is mandatory.

Primary dedupe key:

- normalized work email

Secondary dedupe signals:

- linkedin_url
- name + company
- company_domain + role title + recent submission

Rules:

- if recruiter exists, attach new role request
- if recruiter does not exist, create recruiter first
- if agency email already exists, create new role request, not a new recruiter row

## Internal Status Model

### Recruiter Relationship Status

Keep on `recruiters`:

- `NEW`
- `CONTACTED`
- `ENGAGED`
- `INTERVIEWING`
- `CLOSED`

### Role Request Status

Keep on `recruiter_role_requests`:

- `new`
- `reviewing`
- `qualified`
- `awaiting_details`
- `candidate_shortlist_sent`
- `active`
- `closed`
- `rejected`

This split avoids overloading one status column with two meanings.

## Admin / AM Workflow

### After Public Submit

System should:

1. create or find recruiter
2. create role request
3. assign owner
4. create internal task
5. send confirmation email

### Admin/AM Queue View

Needed filters:

- `new`
- `awaiting first response`
- `agency`
- `in-house`
- `high urgency`
- `no owner`
- `do not contact`

Needed actions:

- assign owner
- mark qualified
- request more details
- send candidate shortlist
- issue magic link
- mark closed
- opt out

## Recommended Public Copy

### Hero Variant A

Headline:

`Hiring now? We’ll send relevant candidates without making you set up software first.`

### Hero Variant B

Headline:

`Recruiting for clients? Send a live req and we’ll help you fill it faster.`

### Supporting Copy

- `No password required`
- `No long onboarding`
- `Optional partner access later if you want repeat usage`

## One-Click Email Actions

These are high leverage and lower friction than login.

Recommended actions:

- `Send profiles`
- `We’re hiring now`
- `Need more details`
- `Wrong contact`
- `Refer a teammate`
- `Not a fit`

Each action should write activity back into the CRM and update request status.

## Agency-Specific Notes

Agencies are valuable, but they create workflow risk.

### Risks

- duplicate submissions
- candidate ownership disputes
- unclear client-company visibility
- low-quality fishing behavior

### Guardrails

- store `client_company_name` when provided
- store whether the req is exclusive or broad
- require source logging for candidate submissions
- track whether the partner is repeat-high-value or low-signal

### Agency Qualification Questions

Do not ask all of these on first touch. Use them later if needed.

- What functions do you usually fill?
- What geographies do you cover?
- Are you working exclusive or shared reqs?
- How quickly are you hiring?

## Metrics

Track:

- page visit → submit rate
- start form → submit rate
- % with job link included
- first response SLA
- % of recruiters who reply
- % of role requests marked qualified
- % of agencies who submit 2+ live reqs
- % of recruiters who need portal access
- candidate shortlist sent rate
- opt-out rate

If portal-usage demand is low, do not overbuild the portal.

## Rollout Recommendation

### Phase 1

- public `/hire` page
- persona split
- short no-account form
- recruiter + role request creation
- internal queue
- confirmation email

### Phase 2

- one-click recruiter email actions
- AM/admin queue improvements
- dedupe + ownership rules

### Phase 3

- optional magic-link partner workspace
- repeat partner management
- multiple active req management

### Phase 4

- agency-specific reporting
- candidate pipeline collaboration
- deeper partner scoring

## Strong Recommendation Summary

Build for `time to first useful exchange`, not `account creation`.

The v1 should be:

- no-account public intake
- agency and in-house split
- internal CRM capture
- fast follow-up
- optional magic-link access only after intent is proven

This will convert better than a recruiter signup product and fits the current JobGenius recruiter/outreach architecture more naturally.
