# Client Delivery Command Center Spec

## Goal

Build the first real operating system for post-sale client delivery at JobGenius.

The Command Center should give account managers, ops, and admins one place to see:

- which active seekers need attention now,
- what the next required action is,
- what is blocked,
- how long a seeker has been idle,
- where interviews, offers, billing, or onboarding are stalling,
- and which cases are slipping against delivery expectations.

This phase is about **execution control**, not marketing, not lead capture, and not another passive analytics page.

## Why This Comes Next

The repo already has:

- lead intake and qualification flows,
- recruiter intake and partner flows,
- People Ops and work reports,
- job discovery, matching, and application execution,
- billing, contracts, and offers,
- a `Today` task queue at `apps/web/app/dashboard/today`,
- and a seeker `Client OS Timeline` at `apps/web/app/dashboard/seekers/[id]/timeline`.

What it does **not** have is a unified delivery control plane for active seekers.

Right now, an AM must infer delivery status by jumping across:

- seeker detail,
- queue,
- outreach,
- interviews,
- billing,
- portal onboarding,
- and timeline events.

That is where missed follow-ups, stale seekers, unclear ownership, and poor placement throughput come from.

## Product Principle

The Command Center should be:

- **system-derived by default**
- **exception-driven**
- **manual only where human judgment is required**

That means:

- the system should infer stage, recent activity, and operational health from existing data,
- AMs should not manually retype counts or update status every day,
- AMs should only maintain:
  - next action,
  - blockers,
  - risk,
  - and exceptional stage overrides.

If we make this a pure manual tracker, adoption will collapse.

## Phase 1 Scope

Phase 1 covers only the delivery operating layer for seekers who are already inside managed service.

### In Scope

- unified delivery snapshot per seeker
- AM delivery board
- seeker-level command panel
- next action tracking
- blocker tracking
- risk flagging
- stale-case and overdue-action visibility
- integration into `Today`
- ops/admin visibility across all assigned seekers

### Out of Scope

Not in this phase:

- lead qualification pipeline redesign
- recruiter shortlist collaboration
- outcome analytics attribution model
- new billing logic
- new work-report metrics
- new job scraping improvements
- automated case reassignment rules

Those come after the Command Center is stable.

## Existing Surfaces To Extend

This phase should extend existing navigation and seeker operations instead of inventing a separate universe.

Primary files to build around:

- `apps/web/app/dashboard/today/page.tsx`
- `apps/web/app/dashboard/today/TodayClient.tsx`
- `apps/web/app/dashboard/seekers/[id]/page.tsx`
- `apps/web/app/dashboard/seekers/[id]/SeekerDetailClient.tsx`
- `apps/web/app/dashboard/seekers/[id]/timeline/page.tsx`
- `apps/web/app/dashboard/seekers/[id]/timeline/TimelineClient.tsx`
- `apps/web/app/dashboard/dashboard-shell.tsx`

New files expected:

- `apps/web/app/dashboard/delivery/page.tsx`
- `apps/web/app/dashboard/delivery/DeliveryClient.tsx`
- `apps/web/lib/client-delivery.ts`
- `apps/web/lib/client-delivery-server.ts`
- `apps/web/app/api/am/delivery/...`

## Phase 1 Business Decisions

These should be treated as locked for implementation unless changed later.

### 1. One delivery case per seeker

There should be exactly one open delivery case record per active job seeker in managed service.

This case is the command surface for that seeker.

### 2. Command Center starts post-sale

Phase 1 should focus on seekers who are already inside delivery, not raw leads.

That means seekers who are:

- approved and active,
- or in paid activation/onboarding,
- or already in active search/interview/offer flow.

Lead queue remains a separate pre-sale system.

### 3. Existing product events remain source of truth

Do **not** create duplicate tables for:

- applications,
- outreach,
- interviews,
- offers,
- contracts,
- payments,
- onboarding progress.

Instead:

- derive delivery state from those existing systems,
- and store only the delivery-specific overlay.

### 4. Manual fields are limited

Manual AM/ops input in Phase 1 should be limited to:

- next action title/type/due date
- active blockers
- case risk level
- optional stage override
- manager notes

### 5. Delivery health must be visible

Each active case should expose:

- last touch date
- last application date
- follow-up due date
- next interview date
- active blocker count
- overdue next action flag
- risk level

## Stage Model

Use a small primary stage model.

Do not create 20 stages.

Recommended enum: `client_delivery_stage`

- `onboarding`
- `ready_to_launch`
- `active_search`
- `interviewing`
- `offer`
- `placed`
- `paused`

Interpretation:

- `onboarding`: client is inside delivery but required setup/profile/billing activation still blocks full execution
- `ready_to_launch`: active client has no blocker but execution has not properly started yet
- `active_search`: applications and/or recruiter outreach are the main motion
- `interviewing`: interview coordination and prep are the main motion
- `offer`: offer handling, decision support, negotiation, or background check is the main motion
- `placed`: verified placement / start reached
- `paused`: temporarily paused by client or management

### Important Rule

Primary stage should be **system-derived first**, with optional manual override.

Suggested derivation priority:

1. `placed` if verified placement / start confirmed
2. `offer` if current offer flow is open
3. `interviewing` if there is an upcoming interview or interview prep due
4. `active_search` if applications or outreach are active
5. `ready_to_launch` if client is active but not executing yet
6. `onboarding` if delivery setup is incomplete
7. `paused` only when explicitly set

## Risk Model

Add `client_delivery_risk_level`:

- `low`
- `medium`
- `high`
- `critical`

Risk should start manual in Phase 1, but the UI should surface suggested risk signals:

- no application activity in X days
- overdue next action
- active billing hold
- seeker unresponsive
- repeated interview no-show or low readiness
- unresolved recruiter or offer dispute

## Blocker Model

Blockers are where AMs and ops actually need control.

Use:

- `client_delivery_blocker_type`
- `client_delivery_blocker_status`

Recommended blocker types:

- `seeker_unresponsive`
- `billing_hold`
- `document_gap`
- `resume_gap`
- `availability_conflict`
- `interview_prep_gap`
- `recruiter_reply_pending`
- `background_check`
- `offer_decision`
- `internal_ops`
- `technical_issue`

Statuses:

- `active`
- `resolved`
- `escalated`

Each blocker should include:

- title
- description
- owner AM
- due date
- created by
- resolved at
- escalation flag

## Next Action Model

Each case gets one current next action.

This is the main AM control field.

Recommended types:

- `application_push`
- `outreach_follow_up`
- `interview_prep`
- `client_check_in`
- `billing_follow_up`
- `document_request`
- `offer_support`
- `manager_escalation`

Each next action should store:

- type
- title
- notes
- due_at
- completed_at
- completed_by

The system should allow future AI suggestion to write into this field, but Phase 1 should still support manual entry and editing.

## Data Model

Create a new migration, e.g. `097_client_delivery_command_center.sql`.

### 1. Enums

- `client_delivery_stage`
- `client_delivery_risk_level`
- `client_delivery_blocker_type`
- `client_delivery_blocker_status`
- `client_delivery_action_type`

### 2. `client_delivery_cases`

One row per seeker.

Suggested columns:

- `id uuid primary key`
- `job_seeker_id uuid not null unique references job_seekers(id) on delete cascade`
- `account_manager_id uuid references account_managers(id) on delete set null`
- `stage_override client_delivery_stage null`
- `risk_level client_delivery_risk_level not null default 'low'`
- `paused boolean not null default false`
- `next_action_type client_delivery_action_type null`
- `next_action_title text`
- `next_action_notes text`
- `next_action_due_at timestamptz`
- `next_action_completed_at timestamptz`
- `next_action_completed_by uuid references account_managers(id) on delete set null`
- `manager_notes text`
- `last_manual_review_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Purpose:

- store the delivery overlay only
- do not duplicate applications, interviews, or offers here

### 3. `client_delivery_blockers`

Suggested columns:

- `id uuid primary key`
- `case_id uuid not null references client_delivery_cases(id) on delete cascade`
- `blocker_type client_delivery_blocker_type not null`
- `status client_delivery_blocker_status not null default 'active'`
- `title text not null`
- `description text`
- `owner_account_manager_id uuid references account_managers(id) on delete set null`
- `due_at timestamptz`
- `escalated boolean not null default false`
- `resolved_at timestamptz`
- `resolved_by uuid references account_managers(id) on delete set null`
- `created_by uuid references account_managers(id) on delete set null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### 4. `v_client_delivery_snapshot`

Phase 1 should use a view for most derived delivery state.

This view should join:

- `job_seekers`
- `job_seeker_assignments`
- `client_delivery_cases`
- `application_runs`
- `application_queue`
- `recruiter_threads`
- `interviews`
- `job_offers`
- `registration_payments`
- `job_seeker_contracts`
- `termination_escalations`
- `client_delivery_blockers`

Suggested derived columns:

- `job_seeker_id`
- `account_manager_id`
- `system_stage`
- `effective_stage`
- `risk_level`
- `last_application_at`
- `applications_7d`
- `last_outreach_at`
- `next_follow_up_at`
- `next_interview_at`
- `last_interview_at`
- `has_open_offer`
- `has_payment_hold`
- `active_blocker_count`
- `active_blocker_titles`
- `next_action_due_at`
- `next_action_title`
- `overdue_next_action boolean`
- `days_since_last_touch`
- `last_touch_at`
- `needs_attention boolean`

This view should power the board.

## What Counts As “Last Touch”

Use the most recent meaningful operational event among:

- application update
- outreach update
- recruiter reply
- interview creation/update
- offer update
- next action completion
- blocker creation/resolution

Do not count passive reads.

## UI Plan

### 1. New Board: `/dashboard/delivery`

Primary AM/ops board.

Audience:

- AMs: own seekers only
- admins / ops: all seekers with filters

Layout:

- top metrics:
  - active seekers
  - blocked seekers
  - overdue actions
  - interviewing
  - offer stage
  - placed this month
- filters:
  - owner
  - stage
  - risk
  - blocked / unblocked
  - overdue / not overdue
- table/cards:
  - seeker
  - stage
  - next action
  - due date
  - blockers
  - last touch
  - last application
  - next interview
  - risk
  - open button

### 2. Extend `/dashboard/today`

Add delivery task kinds derived from:

- overdue next action
- active blocker due soon
- stale seeker with no touch in X days
- interview prep due
- offer decision due

Do not replace existing `v_am_tasks`; extend it.

### 3. Extend seeker detail: `/dashboard/seekers/[id]`

Add a `Delivery Command` panel near the top.

Panel should show:

- effective stage
- risk
- next action
- next action due
- active blockers
- last touch
- applications in last 7 days
- next interview
- open offer status

Inline actions:

- update next action
- add blocker
- resolve blocker
- pause case
- change risk
- optional stage override

### 4. Extend timeline: `/dashboard/seekers/[id]/timeline`

Keep the existing AI `Suggest next action` flow.

Phase 1 should add:

- `Save as next action`
- `Create blocker from suggestion`

The timeline stays the evidence feed.
The Command Center becomes the operational control layer above it.

## API Plan

### `GET /api/am/delivery`

Returns filtered delivery snapshots for the current user scope.

Filters:

- `owner`
- `stage`
- `risk`
- `blocked`
- `overdue`

### `GET /api/am/delivery/[seekerId]`

Returns:

- case row
- derived snapshot
- active blockers
- recent blocker history

### `POST /api/am/delivery/[seekerId]/case`

Creates or updates case overlay fields:

- risk
- next action
- notes
- pause
- stage override

### `POST /api/am/delivery/[seekerId]/blockers`

Creates a blocker.

### `PATCH /api/am/delivery/blockers/[blockerId]`

Updates blocker:

- status
- due date
- escalation
- notes

### `POST /api/am/delivery/[seekerId]/next-action/commit`

Optional Phase 1.5 endpoint.

Purpose:

- save an AI-suggested next action from the timeline directly into the case

## Permissions

Reuse current auth and assignment rules.

### AM

- can view and edit delivery cases only for assigned seekers

### Admin / Superadmin

- can view and edit all delivery cases

### Ops manager

- can view all delivery cases
- can edit blockers, risk, and next actions

### Job seeker

- no access to internal delivery board

## Notifications

Phase 1 should add internal reminders for:

- next action overdue
- blocker due in next 24h
- seeker stale with no touch in 5+ days
- high-risk case with no manual review in 48h

These should go into existing internal notification infrastructure, not email-only logic.

## Audit

Add audit actions for:

- `delivery.case_update`
- `delivery.blocker_create`
- `delivery.blocker_update`
- `delivery.next_action_commit`

If audit action naming needs to stay under the existing `people.*` / admin style, use:

- `delivery.case_update`
- `delivery.blocker_update`

or extend the audit union cleanly.

## Rollout Order

### Phase 1A: Schema and server logic

- migration `097_client_delivery_command_center.sql`
- `lib/client-delivery.ts`
- `lib/client-delivery-server.ts`
- `v_client_delivery_snapshot`

### Phase 1B: Delivery board

- `/dashboard/delivery`
- filters, metrics, board table

### Phase 1C: Seeker command panel

- extend seeker detail
- add next action and blocker forms

### Phase 1D: Today + Timeline integration

- add delivery task kinds to `Today`
- add save-from-suggestion path in timeline

## Success Criteria

Phase 1 is successful if we can measure:

- % active seekers with a current next action
- % active seekers with no touch in 5+ days
- overdue next action count per AM
- active blocker count and median blocker age
- time from payment/activation to first meaningful execution
- time from interview scheduling to prep completion

The immediate product goal is not “more dashboards.”
It is:

- fewer stale seekers,
- clearer AM accountability,
- faster recovery from blockers,
- and better placement throughput.

## What We Should Avoid

- do not ask AMs to maintain daily stage manually
- do not create a second seeker notes system
- do not duplicate timeline events in new tables
- do not mix pre-sale leads and post-sale delivery in the same board for Phase 1
- do not gate this behind AI; the control layer must work without AI suggestion

## Recommended Next Phase After This

Once the Command Center is live, the next strongest follow-on is:

1. immutable attribution and outcome events
2. recruiter shortlist collaboration
3. outcome analytics

That sequence keeps the delivery layer operational first, then makes performance measurement trustworthy.
