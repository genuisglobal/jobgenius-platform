# Outcome Attribution Phase 1 Spec

## Goal

Build the first trustworthy attribution and conversion layer for JobGenius.

This phase should let the company answer, from product data instead of spreadsheets:

- which lead sources turn into consultations,
- which consultations turn into payments,
- which paid clients get to first application fastest,
- which account managers create interviews and offers,
- and which sources, AMs, and workflows produce verified placements.

The point is not another dashboard with guessed counts.
The point is a durable event ledger with **immutable ownership snapshots**.

## Why This Comes Next

The repo already has:

- lead intake through `apps/web/app/api/marketing/lead/route.ts`
- imported leads through `apps/web/app/api/admin/leads/import/route.ts`
- lead lifecycle and voice qualification through `apps/web/app/api/voice/webhook/retell/route.ts`
- payment confirmation through `apps/web/app/api/admin/billing/acknowledge-payment/route.ts`
- application completion through `apps/web/app/api/apply/complete/route.ts`
- interview outcomes through `apps/web/app/api/am/seekers/[id]/interviews/[interviewId]/outcome/route.ts`
- accepted offer verification through `apps/web/app/api/finance/offers/route.ts`
- delivery visibility through the new Command Center

What the repo does **not** have is a single normalized event stream tying those systems together.

Right now:

- lead state lives in `lead_intake_submissions`
- payment state lives in billing and screenshot tables
- applications live in `application_runs`
- interviews live in `interviews`
- offers live in both job-seeker and people/finance flows
- ownership can drift when a seeker is reassigned later

That makes AM performance, source ROI, and funnel analytics too soft.

## Product Principle

This layer must be:

- **append-only**
- **ownership-aware**
- **source-aware**
- **non-destructive**

That means:

- record what happened at the time it happened
- snapshot who owned it at that moment
- snapshot what source or system created it
- never recompute history only from current assignment state

If attribution is derived purely from current `job_seeker_assignments`, reporting will drift every time ownership changes.

## Phase 1 Scope

### In Scope

- a normalized `outcome_events` table
- a `consultation_records` table
- immutable owner/source snapshot fields
- event write service layer
- shadow writes from the highest-value routes
- first admin outcome/funnel analytics support

### Out of Scope

Not in this phase:

- full recruiter shortlist collaboration
- revenue recognition/accounting redesign
- new lead-qualification UX
- candidate-facing analytics
- automatic compensation/commission logic changes
- replacing existing operational tables

This phase is the attribution substrate, not a replacement for those systems.

## Existing Systems To Integrate

Primary current write points:

- `apps/web/app/api/marketing/lead/route.ts`
- `apps/web/app/api/admin/leads/import/route.ts`
- `apps/web/app/api/voice/webhook/retell/route.ts`
- `apps/web/app/api/admin/billing/acknowledge-payment/route.ts`
- `apps/web/app/api/apply/complete/route.ts`
- `apps/web/app/api/am/seekers/[id]/interviews/[interviewId]/outcome/route.ts`
- `apps/web/app/api/finance/offers/route.ts`

Primary current read surfaces to build after the ledger exists:

- `apps/web/app/dashboard/admin/analytics/page.tsx`
- `apps/web/app/dashboard/admin/page.tsx`
- `apps/web/app/dashboard/delivery/page.tsx`

Expected new files:

- `apps/web/lib/outcomes.ts`
- `apps/web/lib/outcomes-server.ts`
- `apps/web/app/api/admin/consultations/route.ts`
- `apps/web/app/dashboard/admin/outcomes/page.tsx`

## Locked Business Decisions

### 1. Outcome history is event-based

We should not build funnel analytics by reading the latest state from each table.

Instead:

- when something meaningful happens, write an event
- analytics read from `outcome_events`

### 2. Ownership is snapshotted

Every event should capture:

- `owner_account_manager_id_snapshot`
- optional `actor_account_manager_id`

These are not the same thing.

Examples:

- a billing admin can confirm payment for a seeker owned by an AM
- the AM still owns the client
- the billing admin is the actor

### 3. Source is snapshotted

Every event should capture:

- `source_channel`
- `source_record_type`
- `source_record_id`

Examples:

- `marketing_form`
- `excel_import`
- `signup_intake`
- `manual_admin`
- `application_run`
- `voice_call`
- `accepted_offer_record`

### 4. Consultations become first-class records

Right now consultation is implied in copy and follow-up, but not strongly modeled.

For funnel analytics, consultation must become explicit.

This phase should add `consultation_records` even if the first version is lightweight.

### 5. Phase 1 starts with shadow writes

Do not rewrite every existing workflow before rollout.

Recommended rollout:

- add the new tables
- write events in parallel from current routes
- build analytics from the new ledger
- only later tighten all event coverage

## Event Taxonomy

Create one enum: `outcome_event_type`

Recommended initial values:

- `lead_captured`
- `lead_imported`
- `qualification_call_queued`
- `qualification_call_completed`
- `lead_qualified`
- `lead_nurture`
- `lead_disqualified`
- `consultation_booked`
- `consultation_completed`
- `consultation_no_show`
- `consultation_cancelled`
- `payment_confirmed`
- `client_activated`
- `application_submitted`
- `interview_scheduled`
- `interview_outcome_recorded`
- `offer_reported`
- `offer_verified`
- `placement_confirmed`

Notes:

- `client_activated` should be triggered when the first confirmed payment moves a seeker into active service
- `placement_confirmed` should not be inferred from `offer_verified` alone; use actual placed/hired confirmation

## Source Taxonomy

Use a second enum: `outcome_source_channel`

Recommended values:

- `marketing_form`
- `signup_intake`
- `excel_import`
- `manual_admin`
- `voice_automation`
- `billing`
- `application_runner`
- `am_portal`
- `finance`
- `system`

This keeps analytics predictable instead of free-text.

## Data Model

Create migration `099_outcome_attribution.sql`.

### 1. Enum: `outcome_event_type`

As listed above.

### 2. Enum: `outcome_source_channel`

As listed above.

### 3. `consultation_records`

Purpose:

- represent consultation explicitly
- allow booked/completed/no-show/cancelled tracking
- attach notes and decision state

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `lead_submission_id uuid references lead_intake_submissions(id) on delete cascade`
- `job_seeker_id uuid references job_seekers(id) on delete set null`
- `owner_account_manager_id uuid references account_managers(id) on delete set null`
- `scheduled_for timestamptz null`
- `status text not null default 'booked'`
- `outcome text null`
- `decision text null`
- `meeting_link text null`
- `notes text null`
- `booked_by_account_manager_id uuid references account_managers(id) on delete set null`
- `completed_by_account_manager_id uuid references account_managers(id) on delete set null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Suggested allowed statuses:

- `booked`
- `completed`
- `no_show`
- `cancelled`

Suggested decisions:

- `qualified`
- `nurture`
- `disqualified`
- `defer`

### 4. `outcome_events`

Purpose:

- immutable event ledger for company analytics
- store ownership and source snapshot at the time of the event

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `event_type outcome_event_type not null`
- `occurred_at timestamptz not null`
- `lead_submission_id uuid references lead_intake_submissions(id) on delete set null`
- `job_seeker_id uuid references job_seekers(id) on delete set null`
- `consultation_record_id uuid references consultation_records(id) on delete set null`
- `application_run_id uuid references application_runs(id) on delete set null`
- `interview_id uuid references interviews(id) on delete set null`
- `accepted_offer_record_id uuid references accepted_offer_records(id) on delete set null`
- `payment_screenshot_id uuid references payment_screenshots(id) on delete set null`
- `registration_payment_id uuid references registration_payments(id) on delete set null`
- `voice_call_id uuid references voice_calls(id) on delete set null`
- `actor_user_id uuid null`
- `actor_account_manager_id uuid references account_managers(id) on delete set null`
- `owner_account_manager_id_snapshot uuid references account_managers(id) on delete set null`
- `source_channel outcome_source_channel not null`
- `source_record_type text null`
- `source_record_id uuid null`
- `event_value numeric null`
- `currency_code text null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

Indexes:

- `(event_type, occurred_at desc)`
- `(job_seeker_id, occurred_at desc)`
- `(lead_submission_id, occurred_at desc)`
- `(owner_account_manager_id_snapshot, occurred_at desc)`
- `(source_channel, occurred_at desc)`
- `(consultation_record_id)`
- `(application_run_id)`
- `(interview_id)`
- `(accepted_offer_record_id)`

### 5. Idempotency protection

Add a unique index to avoid double-writing where we have a natural event identity.

Recommended partial unique index:

- on `(event_type, source_record_type, source_record_id)`
- only where `source_record_type is not null and source_record_id is not null`

This is enough for route-level replay protection in Phase 1.

### 6. Optional analytics view

Create `v_outcome_funnel_base` if useful for admin dashboards.

This view should not replace raw events.
It is only a convenience projection.

## Consultation Model Details

Consultation is the missing bridge between lead qualification and payment.

### Minimum workflow in Phase 1

1. AM/admin books a consultation
2. consultation status becomes `booked`
3. if the meeting happens, mark `completed`
4. if the lead is fit, set decision to `qualified`
5. if not ready, set decision to `nurture`
6. if not a fit, set decision to `disqualified`

Each of those state changes should also write an `outcome_event`.

### New route required

Build:

- `apps/web/app/api/admin/consultations/route.ts`

Recommended actions:

- `POST` create consultation
- `PATCH` update status/decision/notes

No dedicated UI build is required in this spec, but the route and server helper should exist.

## Ownership Snapshot Rules

Define a single helper in the service layer:

- find latest active AM assignment for a seeker
- if absent, fall back to explicit AM provided by the caller

Snapshot fields per event:

- `owner_account_manager_id_snapshot`: the AM who owns the client/lead at the moment
- `actor_account_manager_id`: the AM who performed the action, if the actor is an AM
- `actor_user_id`: the authenticated user id who triggered the route

Examples:

- payment acknowledged by admin:
  - actor user = admin id
  - actor AM = null unless the actor is an AM-auth role
  - owner snapshot = assigned AM for the seeker

- application completed through runner:
  - actor user = current AM auth user hitting the route, if present
  - owner snapshot = assigned AM for the seeker

- interview outcome recorded by AM:
  - actor AM = current AM id
  - owner snapshot = same AM in most cases

## Event Metadata Rules

Do not over-normalize Phase 1.
Use `metadata` for fields that are useful but not worth top-level columns yet.

Examples:

- lead intake:
  - `source_route`
  - `intake_variant`
  - `offer_code`

- consultation:
  - `decision`
  - `notes_present`

- payment:
  - `amount_paid`
  - `is_first_payment`
  - `billing_note_present`

- application:
  - `job_post_id`
  - `queue_id`
  - `ats_type`

- interview:
  - `outcome`
  - `offer_amount`
  - `rejection_reason_present`

- offer:
  - `company_name`
  - `offer_title`
  - `payment_month`

## Service Layer

Create:

- `apps/web/lib/outcomes.ts`
- `apps/web/lib/outcomes-server.ts`

### `outcomes.ts`

Purpose:

- define event enums and shared payload contracts

Recommended exports:

- `OUTCOME_EVENT_TYPES`
- `OUTCOME_SOURCE_CHANNELS`
- `type OutcomeEventType`
- `type OutcomeSourceChannel`
- `type OutcomeEventWriteInput`

### `outcomes-server.ts`

Purpose:

- centralize event insertion and ownership snapshot logic
- keep route handlers small

Recommended functions:

- `resolveOutcomeOwnerSnapshot(params)`
- `writeOutcomeEvent(input)`
- `writeOutcomeEvents(batch)`
- `createConsultationRecord(input)`
- `updateConsultationRecord(input)`
- `listOutcomeFunnelSummary(filters)`
- `listOutcomeEvents(filters)`

### `writeOutcomeEvent` input

Suggested shape:

- `eventType`
- `occurredAt`
- `sourceChannel`
- `sourceRecordType`
- `sourceRecordId`
- `leadSubmissionId`
- `jobSeekerId`
- `consultationRecordId`
- `applicationRunId`
- `interviewId`
- `acceptedOfferRecordId`
- `paymentScreenshotId`
- `registrationPaymentId`
- `voiceCallId`
- `actorUserId`
- `actorAccountManagerId`
- `ownerAccountManagerId`
- `eventValue`
- `currencyCode`
- `metadata`

Implementation rules:

- if `ownerAccountManagerId` is not supplied but `jobSeekerId` exists, resolve it from current assignment
- if no owner exists, keep snapshot null; do not fail the business flow
- if `(event_type, source_record_type, source_record_id)` already exists, treat as idempotent success

## Exact Route Integration Points

Phase 1 should add event writes here.

### 1. `POST /api/marketing/lead`

File:

- `apps/web/app/api/marketing/lead/route.ts`

After successful lead insert/update:

- write `lead_captured`

If a voice call is queued:

- write `qualification_call_queued`

Event source:

- `source_channel = signup_intake` when `metadata.intake_variant === "jobseeker_light_signup"`
- else `marketing_form`

Recommended source record:

- `source_record_type = "lead_intake_submission"`
- `source_record_id = lead_id`

### 2. `POST /api/admin/leads/import`

File:

- `apps/web/app/api/admin/leads/import/route.ts`

For each successfully inserted lead:

- write `lead_imported`

Event source:

- `excel_import`

### 3. `POST /api/voice/webhook/retell`

File:

- `apps/web/app/api/voice/webhook/retell/route.ts`

For terminal `lead_qualification` calls:

- write `qualification_call_completed`

If the webhook or downstream logic later marks a lead as qualified/nurture/disqualified:

- also write one of:
  - `lead_qualified`
  - `lead_nurture`
  - `lead_disqualified`

Important note:

The current webhook only updates `last_call_at`.
Phase 1 should **not** invent qualification decisions inside the webhook.
Instead:

- use the webhook for `qualification_call_completed`
- use a later admin/consultation action for actual lead decision events

### 4. `POST /api/admin/consultations`

New file:

- `apps/web/app/api/admin/consultations/route.ts`

Writes:

- `consultation_booked`
- `consultation_completed`
- `consultation_no_show`
- `consultation_cancelled`
- and if decision is set:
  - `lead_qualified`
  - `lead_nurture`
  - `lead_disqualified`

### 5. `POST /api/admin/billing/acknowledge-payment`

File:

- `apps/web/app/api/admin/billing/acknowledge-payment/route.ts`

After successful acknowledgement:

- write `payment_confirmed`

If this is the first confirmed payment that activates delivery:

- write `client_activated`

Suggested metadata:

- `amount_paid`
- `is_first_payment`
- `installment_id`

### 6. `POST /api/apply/complete`

File:

- `apps/web/app/api/apply/complete/route.ts`

After successful completion:

- write `application_submitted`

Suggested source:

- `application_runner`

Suggested source record:

- `source_record_type = "application_run"`
- `source_record_id = run.id`

### 7. Interview scheduling / outcome

Existing clear write point in Phase 1:

- `apps/web/app/api/am/seekers/[id]/interviews/[interviewId]/outcome/route.ts`

When outcome is recorded:

- write `interview_outcome_recorded`

Suggested metadata:

- `outcome`
- `offer_amount`
- `hire_date`

If the outcome implies placement:

- when `outcome === "hired"`, also write `placement_confirmed`

Optional but recommended follow-up in a later patch:

- add `interview_scheduled` writes where interviews are first created

### 8. `POST /api/finance/offers`

File:

- `apps/web/app/api/finance/offers/route.ts`

On create/update:

- write `offer_reported` when an accepted-offer record is first created
- write `offer_verified` when verification status becomes `verified`

If verified state plus actual placed/hired confirmation exists:

- that later system can also write `placement_confirmed`

Do not automatically use `offer_verified` as a guaranteed placement event.

## Analytics Read Layer

Phase 1 does not need a huge analytics UI, but it should define the read contracts.

Create:

- `listFunnelSummary(filters)`
- `listOutcomeBySource(filters)`
- `listOutcomeByOwner(filters)`
- `listRecentOutcomeEvents(filters)`

### Minimum filters

- `date_from`
- `date_to`
- `owner_account_manager_id`
- `source_channel`

### Minimum admin metrics

- leads captured
- consultations booked
- consultations completed
- qualified leads
- payments confirmed
- clients activated
- applications submitted
- interviews recorded
- offers reported
- offers verified
- placements confirmed

## Recommended Phase 1 Admin Page

Add:

- `apps/web/app/dashboard/admin/outcomes/page.tsx`

It should show:

- funnel summary cards
- source breakdown
- AM breakdown
- recent event feed

Keep this page read-only in Phase 1.

## Rollout Order

### Phase 1A: Schema and service layer

- migration `099_outcome_attribution.sql`
- `lib/outcomes.ts`
- `lib/outcomes-server.ts`

### Phase 1B: Shadow writes

Add event writes to:

- marketing lead
- lead import
- payment acknowledgement
- application complete
- interview outcome
- finance offers

### Phase 1C: Consultation route

- add `api/admin/consultations`
- start explicit consultation events

### Phase 1D: Admin outcomes page

- basic funnel and source/AM views

## Idempotency and Safety Rules

- event writes must never break the underlying business mutation
- if the event insert fails, log and continue unless the route is specifically dedicated to consultation/event creation
- duplicate route retries should not create duplicate events when `source_record_type + source_record_id` matches
- missing owner snapshot should not block write

## Testing Plan

Add unit coverage for:

- owner snapshot resolution
- source channel resolution
- idempotent event writes
- consultation event mapping

Add integration-style tests where practical for:

- lead captured event
- payment confirmed + client activated
- application submitted
- interview outcome recorded
- offer verified

## Success Criteria

Phase 1 succeeds if JobGenius can answer:

- how many leads entered by source in a date range
- how many became qualified
- how many reached consultation
- how many converted into payment
- which AM owned those clients at the time
- how many applications/interviews/offers/placements resulted

without rebuilding history manually from multiple mutable tables.

## What To Avoid

- do not overwrite existing operational tables with funnel-only fields
- do not infer all outcomes from current state snapshots
- do not rely on current assignment for historical AM credit
- do not tie analytics correctness to UI-only workflows
- do not make event writes a fragile point of failure for core user actions

## Recommended Next Phase After This

Once Phase 1 attribution is stable:

1. build `/dashboard/admin/outcomes`
2. extend Client Delivery Command Center with SLA analytics powered by this ledger
3. feed recruiter-shortlist and discovery outcomes back into the same event system

That sequence makes the rest of the company reporting model consistent instead of fragmented.
