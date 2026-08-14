# Delivery Phase 2 Spec

## Goal

Turn the existing Client Delivery Command Center from a visibility board into an
**operational control system**.

Phase 1 already gives JobGenius:

- a derived delivery snapshot,
- a delivery board,
- a seeker command panel,
- blocker tracking,
- next-action tracking,
- `Today` tasks for stale and overdue delivery work,
- and internal reminder hooks.

Phase 2 should add the discipline layer that answers:

- which paid seekers are most likely to stall,
- which cases require manager review now,
- which blockers are aging too long,
- where AM intervention is late,
- and when a case should be escalated out of ordinary AM flow.

This phase is about **delivery throughput protection**, not more reporting for its
own sake.

## Why This Comes Next

The repo now has the core command-center foundation in:

- `apps/web/supabase/migrations/097_client_delivery_command_center.sql`
- `apps/web/supabase/migrations/098_delivery_today_and_reminders.sql`
- `apps/web/lib/client-delivery.ts`
- `apps/web/lib/client-delivery-server.ts`
- `apps/web/app/dashboard/delivery`
- `apps/web/app/dashboard/seekers/[id]/DeliveryCommandPanel.tsx`
- `apps/web/app/api/cron/delivery-reminders/route.ts`

What is still missing is the management layer above that foundation:

- health scoring,
- stale-case classification,
- escalation lifecycle,
- manager review workflow,
- and SLA-driven intervention.

Without this layer, the board tells you what exists, but it does not reliably
force action when service quality begins to slip.

## Product Principle

Phase 2 should remain:

- **system-derived first**
- **exception-driven**
- **manager-aware**

That means:

- the system should classify risk and health from operating signals,
- escalation should exist only when ordinary AM execution is not enough,
- and managers should review the worst cases, not the whole book of business.

Do not turn this into another manual spreadsheet UI.

## Scope

### In Scope

- delivery health score
- health band classification
- stale-case detection
- escalation states and history
- blocker aging and blocker priority
- manager review queue
- SLA reminder automation
- delivery board filters for risk, stale, escalation, and health
- seeker-level escalation and review actions

### Out of Scope

Not in this phase:

- recruiter shortlist collaboration
- client-facing communication center
- outcome dashboard v2 filtering/export
- automatic reassignment engine
- compensation changes tied to delivery health

## Existing Foundation To Extend

Phase 2 should extend the existing delivery surfaces instead of creating a
second delivery system.

Primary files:

- `apps/web/supabase/migrations/097_client_delivery_command_center.sql`
- `apps/web/supabase/migrations/098_delivery_today_and_reminders.sql`
- `apps/web/lib/client-delivery.ts`
- `apps/web/lib/client-delivery-server.ts`
- `apps/web/app/dashboard/delivery/page.tsx`
- `apps/web/app/dashboard/delivery/DeliveryClient.tsx`
- `apps/web/app/dashboard/seekers/[id]/DeliveryCommandPanel.tsx`
- `apps/web/app/dashboard/today/page.tsx`
- `apps/web/app/dashboard/today/TodayClient.tsx`
- `apps/web/app/api/cron/delivery-reminders/route.ts`

Expected new files:

- `apps/web/supabase/migrations/100_delivery_sla_and_escalations.sql`
- `apps/web/lib/delivery-sla.ts`
- `apps/web/app/api/am/delivery/[seekerId]/review/route.ts`
- `apps/web/app/api/am/delivery/[seekerId]/escalate/route.ts`
- `apps/web/app/api/admin/delivery/escalations/route.ts`
- `apps/web/app/api/cron/delivery-sla/route.ts`

## Business Decisions

These should be treated as locked unless management changes them later.

### 1. Health is system-derived

Health score must be computed from existing operational signals.

AMs may change:

- next action,
- blockers,
- risk,
- pause state,
- escalation notes,

but they should **not** manually type a health score.

### 2. Risk and health are different

- `risk_level` remains the human/ops judgment field already in Phase 1
- `health_score` and `health_band` are system-derived

This distinction matters because some cases are operationally unhealthy even
before an AM marks them as high risk.

### 3. Stale means operational neglect, not just low market response

A seeker is stale when the case has lacked meaningful execution or review, not
simply because no employer has replied.

Staleness must consider:

- last touch,
- last application momentum,
- overdue next action,
- unresolved blocker state,
- and whether the case is intentionally paused.

### 4. Escalation is for exception handling

Escalations should exist only when an AM cannot resolve the case within normal
delivery flow.

Escalation is not just “I want help.”

It should be tied to specific categories and review history.

### 5. Manager review should be lightweight

Managers should review the worst cases in one focused queue:

- stale,
- high-risk,
- overdue,
- escalated,
- blocker-heavy.

Do not require a manager to touch every case.

## New Concepts

### Health Score

Add a computed integer `health_score` from `0` to `100`.

Higher means healthier.

Recommended interpretation:

- `80–100`: healthy
- `60–79`: watch
- `40–59`: at_risk
- `0–39`: critical

### Health Band

Add `client_delivery_health_band`:

- `healthy`
- `watch`
- `at_risk`
- `critical`

This should be shown in the board and seeker command panel.

### Escalation Status

Add `client_delivery_escalation_status`:

- `none`
- `needs_manager_review`
- `manager_reviewed`
- `ops_escalated`
- `resolved`

### Escalation Reason

Recommended enum:

- `client_unresponsive`
- `low_market_fit`
- `delivery_execution_gap`
- `blocker_unresolved`
- `interview_readiness`
- `payment_or_contract_hold`
- `offer_or_background_issue`
- `manager_attention_requested`
- `other`

## Health Score Rules

Phase 2 should compute score from signals already in the snapshot view.

Start at `100` and subtract penalties.

Recommended penalties:

- overdue next action: `-20`
- active blocker count:
  - `1 blocker`: `-8`
  - `2 blockers`: `-15`
  - `3+ blockers`: `-25`
- payment hold: `-20`
- active escalation: `-15`
- high manual risk:
  - `medium`: `-5`
  - `high`: `-12`
  - `critical`: `-20`
- no application in last 7 days while in `active_search`: `-15`
- no meaningful touch in 5+ days: `-15`
- no meaningful touch in 8+ days: `-25`
- follow-up due and overdue: `-8`
- no manual review in 7+ days on a high/critical case: `-10`

Positive offsets:

- application momentum:
  - `3+ applications in 7d`: `+6`
  - `7+ applications in 7d`: `+10`
- upcoming interview within 7 days: `+8`
- open offer: minimum floor of `70` unless payment or escalation issues exist

Clamp final score between `0` and `100`.

### Important Guardrails

- `placed` cases should always be `healthy`
- `paused` cases should not be classified stale unless pause exceeds its review window
- `offer` stage should not be punished for low application volume
- `interviewing` stage should not be punished for low application volume if interviews are active

## Stale Detection Rules

Create a system-derived `stale_status`:

- `none`
- `approaching_stale`
- `stale`
- `severely_stale`

Recommended thresholds for unpaused, non-placed cases:

- `approaching_stale`: `days_since_last_touch >= 4`
- `stale`: `days_since_last_touch >= 5`
- `severely_stale`: `days_since_last_touch >= 8`

Additional stale triggers:

- `next_action_due_at` overdue by 48h+
- `active_search` with zero applications in 7d and no outreach progress
- `high` or `critical` risk case with no manager/manual review in 7d

Paused cases:

- if paused and `last_manual_review_at` is within 7 days, stale = `none`
- if paused and no review in 7+ days, stale = `approaching_stale`
- if paused and no review in 14+ days, stale = `stale`

## Blocker Aging Rules

Each active blocker should derive:

- `age_days`
- `due_state`

Recommended due states:

- `not_due`
- `due_soon`
- `overdue`
- `critical_overdue`

Thresholds:

- `due_soon`: due within next 24 hours
- `overdue`: past due
- `critical_overdue`: 3+ days overdue

Escalation rules:

- any blocker overdue 3+ days should surface as escalation candidate
- any escalated blocker should increase case attention immediately

## Escalation Model

Add a new table via migration `100_delivery_sla_and_escalations.sql`.

### `client_delivery_escalations`

Suggested columns:

- `id uuid primary key`
- `delivery_case_id uuid not null references client_delivery_cases(id) on delete cascade`
- `job_seeker_id uuid not null references job_seekers(id) on delete cascade`
- `status client_delivery_escalation_status not null default 'needs_manager_review'`
- `reason client_delivery_escalation_reason not null`
- `details text`
- `opened_by_account_manager_id uuid references account_managers(id) on delete set null`
- `reviewed_by_account_manager_id uuid references account_managers(id) on delete set null`
- `resolved_by_account_manager_id uuid references account_managers(id) on delete set null`
- `opened_at timestamptz not null default now()`
- `reviewed_at timestamptz`
- `resolved_at timestamptz`
- `resolution_note text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:

- `(delivery_case_id, status, opened_at desc)`
- `(job_seeker_id, status)`
- `(status, opened_at desc)`

### Changes to `client_delivery_cases`

Add:

- `health_score integer`
- `health_band client_delivery_health_band`
- `stale_status text`
- `stale_since_at timestamptz`
- `last_touch_at_override timestamptz null`
- `escalation_status client_delivery_escalation_status not null default 'none'`
- `escalated_at timestamptz`
- `escalated_by_account_manager_id uuid references account_managers(id) on delete set null`
- `manager_reviewed_at timestamptz`
- `manager_reviewed_by_account_manager_id uuid references account_managers(id) on delete set null`

Notes:

- `health_score`, `health_band`, and `stale_status` can be persisted or exposed from a view.
- My recommendation: derive them in the snapshot view first, persist only escalation and review state.

## Snapshot/View Changes

Extend `v_client_delivery_snapshot`.

Add derived fields:

- `health_score`
- `health_band`
- `stale_status`
- `stale_since_at`
- `has_active_escalation_record`
- `latest_escalation_reason`
- `latest_escalation_opened_at`
- `latest_escalation_status`
- `oldest_active_blocker_due_at`
- `overdue_blocker_count`
- `critical_overdue_blocker_count`
- `blocker_max_age_days`
- `days_since_last_application`
- `days_since_last_manual_review`
- `needs_manager_review`

### Manager Review Logic

`needs_manager_review = true` if any of:

- escalation status is `needs_manager_review`
- health band is `critical`
- stale status is `severely_stale`
- critical overdue blocker exists
- payment hold + stale case
- high/critical manual risk and no review in 7+ days

## Server-Layer Responsibilities

Add `apps/web/lib/delivery-sla.ts`.

This file should contain pure logic for:

- computing health score
- mapping health band
- mapping stale status
- blocker due-state calculation
- escalation eligibility
- manager-review eligibility

Extend `apps/web/lib/client-delivery-server.ts` to:

- load manager review queue
- open escalation records
- review escalation records
- resolve escalation records
- update case review timestamps
- build reminder candidates for cron

## API Plan

### `POST /api/am/delivery/[seekerId]/review`

Purpose:

- mark case manually reviewed
- optionally add review note
- optionally downgrade escalation to `manager_reviewed` when privileged user acts

Payload:

- `note?: string`
- `review_target?: "case" | "escalation"`

### `POST /api/am/delivery/[seekerId]/escalate`

Purpose:

- create or reopen escalation for the case

Payload:

- `reason`
- `details`
- optional `linked_blocker_id`

Rules:

- only AM with seeker access, admin, or ops manager may create
- if there is already an open escalation, update instead of duplicating

### `GET /api/admin/delivery/escalations`

Purpose:

- privileged review queue

Filters:

- `status`
- `reason`
- `owner`
- `health_band`
- `stale_status`

### `PATCH /api/admin/delivery/escalations/[id]`

Purpose:

- review or resolve escalation

Payload:

- `status`
- `resolution_note`

Allowed status transitions:

- `needs_manager_review -> manager_reviewed`
- `manager_reviewed -> ops_escalated`
- `needs_manager_review -> ops_escalated`
- `manager_reviewed -> resolved`
- `ops_escalated -> resolved`

### `GET /api/am/delivery`

Extend existing response to include:

- health score
- health band
- stale status
- escalation status
- overdue blocker counts
- needs manager review

## UI Plan

### `/dashboard/delivery`

Add:

- health band pill
- stale status pill
- escalation pill
- overdue blocker count

Add filters:

- `Health: all / healthy / watch / at_risk / critical`
- `Stale: all / approaching / stale / severe`
- `Escalated only`
- `Needs manager review`
- `Overdue blockers`

Add summary cards:

- active cases
- needs attention
- manager review queue
- stale cases
- escalated cases
- critical cases

### Seeker command panel

Add:

- health score display
- stale status display
- escalation status
- `Escalate case` action
- `Mark reviewed` action
- manager review timestamp

### `/dashboard/today`

Extend delivery-related tasks with:

- stale-case review
- escalation follow-up
- critical overdue blocker
- manager review required

### Privileged queue

Start inside `/dashboard/delivery` first.

Add a privileged-only section or toggle:

- `Manager Review Queue`

Only create a separate admin page if the inline privileged view becomes too dense.

## Notifications

Add categories to existing notification infrastructure:

- `delivery_stale_case`
- `delivery_manager_review_required`
- `delivery_escalated_case`
- `delivery_blocker_overdue`
- `delivery_case_reviewed`

Cron route:

- `apps/web/app/api/cron/delivery-sla/route.ts`

Daily/periodic behavior:

- notify AM on newly stale case
- notify AM on overdue blocker
- notify ops/admin on manager-review-required case
- notify case owner when escalation is reviewed or resolved

Deduping:

- do not send the same stale/escalation reminder more than once per day per case per user

## Permissions

### AM

- can escalate assigned cases
- can mark assigned cases reviewed
- cannot resolve manager escalation as final unless privileged

### Ops Manager

- can view all cases
- can review and resolve escalations
- can update case review state

### Admin / Superadmin

- full access

### Job seeker

- no access to internal SLA controls

## Audit

Add audit actions:

- `delivery.case_review`
- `delivery.case_escalated`
- `delivery.escalation_reviewed`
- `delivery.escalation_resolved`

These should include:

- seeker id
- case id
- escalation id where relevant
- old status
- new status
- reason

## Rollout Order

### Phase 2A: Pure logic + schema

- `100_delivery_sla_and_escalations.sql`
- `lib/delivery-sla.ts`
- snapshot/view extension

### Phase 2B: Board surfacing

- health band
- stale status
- escalation status
- new filters

### Phase 2C: Seeker controls

- escalate case
- mark reviewed
- escalation notes

### Phase 2D: Reminder automation

- delivery SLA cron
- internal notifications

### Phase 2E: Manager queue

- privileged review section on delivery board
- optional dedicated escalation endpoint/UI

## Suggested Initial Thresholds

These should be constants in `lib/delivery-sla.ts`, not magic numbers scattered in UI code.

- stale warning: `4 days`
- stale: `5 days`
- severe stale: `8 days`
- paused stale warning: `7 days`
- paused stale: `14 days`
- high-risk no-review escalation: `7 days`
- blocker critical overdue: `3 days`
- manager review grace on escalated case: `48 hours`
- overdue next action hard attention: immediate

## Success Criteria

Phase 2 is successful if JobGenius can measure:

- count of stale active cases
- count of critical cases
- count of manager-review-required cases
- median blocker age
- critical overdue blocker count
- average time from escalation open to manager review
- average time from review to resolution
- reduction in stale active seekers over time

## What To Avoid

- do not let AMs manually edit health score
- do not mix lead-qualification escalations into delivery SLA
- do not create duplicate “notes” systems disconnected from delivery cases
- do not overfit the score formula in v1; keep it legible
- do not require manager review for every case

## Recommended Next Phase After This

After Delivery Phase 2, the strongest next build remains:

1. consultation ops hardening
2. outcomes dashboard v2 filters/drilldowns
3. recruiter shortlist collaboration

That sequence keeps:

- current client delivery under control,
- conversion and outcome visibility improving,
- and recruiter-side demand growing only after delivery operations are disciplined.
