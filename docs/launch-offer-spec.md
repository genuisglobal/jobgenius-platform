# JobGenius Launch Offer Spec

## Purpose

Define the first implementation of:

- plan-based registration discounts,
- a 7-day strategy preview,
- seeker referral discounts and referral credits,
- AM-approved monthly onboarding capacity,
- and the website/admin/product changes required to support all of it.

This spec is written against the current codebase, which already has:

- base registration billing and installments,
- job seeker referral codes and referral tracking,
- AM assignment workflows,
- and a multi-step onboarding flow.

Relevant current files:

- `apps/web/app/(auth)/signup/page.tsx`
- `apps/web/app/portal/onboarding/OnboardingWizard.tsx`
- `apps/web/app/portal/onboarding/steps/PlanSelectionStep.tsx`
- `apps/web/app/portal/onboarding/steps/ContractStep.tsx`
- `apps/web/app/portal/onboarding/steps/InstallmentPlanStep.tsx`
- `apps/web/app/api/auth/signup/route.ts`
- `apps/web/app/api/portal/billing/contract/sign/route.ts`
- `apps/web/app/api/portal/billing/installments/route.ts`
- `apps/web/app/portal/referrals/ReferralsClient.tsx`
- `apps/web/app/dashboard/admin/referrals/AdminReferralsClient.tsx`
- `apps/web/app/api/admin/assignments/route.ts`

## Locked Business Decisions

These are treated as approved unless changed later.

### Offer Paths

Two mutually exclusive paths:

1. `Direct signup with discount`
2. `7-day strategy preview`

The strategy preview is not a free trial of full service.

### Direct Signup Discount

- `Essentials`: 20% off registration fee
- `Premium`: 25% off registration fee

Base pricing remains:

- `Essentials`: $500 base registration fee
- `Premium`: $1,000 base registration fee

Discounted pricing:

- `Essentials`: $400
- `Premium`: $750

### Strategy Preview

Preview includes:

- resume audit,
- target-role plan,
- optional kickoff call,

Preview excludes:

- live applications,
- recruiter outreach,
- referral outreach,
- active AM execution,
- any workflow that consumes ongoing delivery capacity.

If the user converts after the preview window, they pay the full base registration fee for the selected plan.

### Referral Mechanics

- Existing seekers keep their referral code and share link after signup.
- A referred user can use a seeker referral code to unlock the standard plan discount.
- The referrer earns a `5% registration credit` for each successful referral.

### Capacity / Scarcity

- Monthly spots are approved by AM review, not taken at raw signup.
- Default AM monthly onboarding capacity is `4`.
- Admin can raise or lower the monthly capacity per AM.
- Public site should show real monthly spots remaining.
- Signup stays self-serve even when approval is required.

## Product Principle

This system should position JobGenius as:

- a limited-capacity managed service,
- not a self-serve SaaS,
- and not a “free trial” tool.

All copy and flows should reinforce:

- real account managers,
- limited onboarding slots,
- direct-discount path for serious buyers,
- strategy preview for people who need confidence before paying.

## Offer Rules

### Rule 1: Offer Path Choice

The user must choose one:

- `discount_path`
- `preview_path`

No one can combine both for the same signup.

### Rule 2: Code Resolution

A signup may include one acquisition code:

- admin promo code, or
- seeker referral code

No stacking between promo code types.

### Rule 3: Discount Scope

The discount applies only to the registration fee.

It does not reduce:

- success fee percentage,
- commission due dates,
- contract terms,
- or add-on charges later.

### Rule 4: Preview Scope

Users on preview path may:

- complete onboarding basics,
- receive the preview deliverables,
- remain unassigned for live execution,
- and convert to paid during or after the preview window.

Users on preview path may not:

- enter live application queues,
- receive outreach execution,
- consume ongoing AM search bandwidth,
- or appear as active managed clients.

### Rule 5: Spot Consumption

A spot is consumed when:

- an AM or admin approves the intake into the current month,
- and reserves it against AM capacity.

Signup alone does not consume a spot.

### Rule 6: Referral Credit Trigger

Recommended v1 trigger:

- referred user is approved,
- contract is signed,
- and first registration payment is confirmed.

Only then is the referrer’s 5% registration credit created.

This avoids abuse from fake signups or non-converting referrals.

## Recommended Clarifications

These are recommended defaults for v1.

### Credit Cap

Recommended:

- cap referral credits at `50% of the referrer's base registration fee`.

Reason:

- preserves pricing integrity,
- keeps the program generous but bounded,
- and avoids zero-cost acquisition loops.

### Credit Application Order

Recommended:

- credits apply automatically to the referrer’s remaining unpaid registration balance,
- oldest credits first.

### If Registration Is Already Fully Paid

Recommended default for v1:

- accrue credit in a wallet ledger,
- but do not auto-convert it to cash,
- and do not apply it to success fee yet.

This should be shown in the portal as `earned credit awaiting future use`.

Reason:

- keeps implementation cleaner,
- avoids immediate payout logic,
- and preserves flexibility for phase 2.

### Approval SLA

Recommended:

- AM review target: 48 hours.

### Waitlist Behavior

Recommended:

- when all current-month spots are full, new signups can still complete the flow,
- but they enter `waitlisted` state unless capacity opens.

## Required Data Model

The current schema has billing tables, referrals, and AM assignments, but it does not have:

- promo code pricing,
- approval-state intake,
- AM capacity,
- or referral credit ledgering.

Add the following.

### 1. `promo_codes`

Purpose:

- admin-created codes for direct signup discounts.

Suggested fields:

- `id uuid primary key`
- `code text unique not null`
- `label text not null`
- `status text not null check (status in ('active','inactive','expired'))`
- `discount_percent_essentials numeric(5,4) not null default 0.20`
- `discount_percent_premium numeric(5,4) not null default 0.25`
- `starts_at timestamptz null`
- `ends_at timestamptz null`
- `max_redemptions int null`
- `redemption_count int not null default 0`
- `single_use_per_email boolean not null default true`
- `metadata jsonb not null default '{}'::jsonb`
- `created_by uuid null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### 2. `job_seeker_intake_states`

Purpose:

- central state machine for offer path, approval, preview, and capacity reservation.

Suggested fields:

- `id uuid primary key`
- `job_seeker_id uuid unique not null references job_seekers(id) on delete cascade`
- `selected_plan text not null check (selected_plan in ('essentials','premium'))`
- `offer_path text not null check (offer_path in ('discount','strategy_preview'))`
- `submitted_code text null`
- `code_source text null check (code_source in ('promo_code','seeker_referral'))`
- `promo_code_id uuid null references promo_codes(id)`
- `referrer_job_seeker_id uuid null references job_seekers(id)`
- `base_registration_fee numeric(10,2) not null`
- `discount_percent numeric(5,4) not null default 0`
- `discount_amount numeric(10,2) not null default 0`
- `effective_registration_fee numeric(10,2) not null`
- `status text not null`
- `status_detail text null`
- `preview_expires_at timestamptz null`
- `approved_account_manager_id uuid null references account_managers(id)`
- `approved_by_admin_id uuid null`
- `approved_for_month date null`
- `reviewed_at timestamptz null`
- `submitted_at timestamptz not null default now()`
- `notes text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Recommended statuses:

- `draft`
- `submitted`
- `pending_review`
- `waitlisted`
- `approved_preview`
- `preview_active`
- `preview_expired`
- `approved_payment_pending`
- `active_client`
- `rejected`

### 3. `account_manager_capacity`

Purpose:

- store monthly onboarding capacity per AM.

Suggested fields:

- `id uuid primary key`
- `account_manager_id uuid not null references account_managers(id) on delete cascade`
- `capacity_month date not null`
- `monthly_new_client_limit int not null default 4`
- `notes text null`
- `created_by uuid null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- unique constraint on `(account_manager_id, capacity_month)`

### 4. `referral_registration_credits`

Purpose:

- ledger the 5% referrer credit separately from payout-style referral tracking.

Suggested fields:

- `id uuid primary key`
- `referral_id uuid not null references referrals(id) on delete cascade`
- `job_seeker_id uuid not null references job_seekers(id) on delete cascade`
- `credit_percent numeric(5,4) not null default 0.05`
- `credit_amount numeric(10,2) not null`
- `status text not null check (status in ('earned','applied','expired','voided'))`
- `applied_contract_id uuid null references job_seeker_contracts(id)`
- `applied_registration_payment_id uuid null references registration_payments(id)`
- `earned_at timestamptz not null default now()`
- `applied_at timestamptz null`
- `expires_at timestamptz null`
- `notes text null`

### 5. Extend `job_seeker_contracts`

Add:

- `base_registration_fee numeric(10,2) null`
- `discount_amount numeric(10,2) null`
- `discount_source text null`
- `discount_code text null`
- `final_registration_fee numeric(10,2) null`

Use `registration_fee` as the final stored amount for backward compatibility, but preserve the breakdown.

### 6. Extend `registration_payments`

Add:

- `credit_applied_amount numeric(10,2) not null default 0`
- `intake_state_id uuid null references job_seeker_intake_states(id)`

## State Machine

### Direct Discount Path

1. User signs up.
2. User chooses plan.
3. User enters valid promo or referral code.
4. Intake state created with:
   - `offer_path = discount`
   - discounted fee stored.
5. User completes onboarding.
6. User enters `pending_review`.
7. AM/admin approves into a monthly slot.
8. Status becomes `approved_payment_pending`.
9. User signs full contract at discounted fee.
10. User creates installment plan at discounted fee.
11. First payment confirmed.
12. Status becomes `active_client`.
13. AM assignment is created or activated.

### Strategy Preview Path

1. User signs up.
2. User chooses plan.
3. User chooses `7-day strategy preview`.
4. Intake state created with:
   - `offer_path = strategy_preview`
   - no discount applied.
5. User completes onboarding basics.
6. User enters `pending_review`.
7. AM/admin approves into a slot.
8. Status becomes `approved_preview`.
9. Preview start is confirmed and `preview_expires_at` is set.
10. Status becomes `preview_active`.
11. AM delivers:
    - resume audit,
    - target-role plan,
    - optional kickoff call.
12. Before expiry, user can convert.
13. On conversion:
    - full contract signed,
    - full registration fee created,
    - payment plan saved,
    - service starts after first payment confirmation.
14. If not converted by expiry:
    - status becomes `preview_expired`.

## UX Flow Changes

### Signup Page

Current signup page already supports a referral code query param.

Add:

- plan teaser:
  - `Direct signup with discount`
  - `7-day strategy preview`
- optional code entry:
  - promo code or referral code
- live messaging:
  - `20% off Essentials`
  - `25% off Premium`
- monthly spots module:
  - `X onboarding spots left this month`

Do not force code entry at signup if it complicates auth; it can be persisted during onboarding if needed.

### Onboarding Wizard

Current steps are:

1. Welcome
2. Choose Plan
3. Agreement
4. Payment Plan
5. About You
6. Job Preferences
7. Work Style
8. Salary & Availability
9. Review

Recommended new flow:

1. Welcome
2. Choose Plan
3. Choose Offer Path
4. Enter Code or Confirm Preview
5. About You
6. Job Preferences
7. Work Style
8. Salary & Availability
9. Review & Submit for Approval

Then branch:

- direct discount path:
  - contract,
  - payment plan,
  - pending payment

- preview path:
  - preview agreement,
  - preview scheduling,
  - preview active

Reason:

- users should not sign the paid client contract before they know whether they are in discount or preview mode.

### Billing Flow

Current billing assumes fixed fees by plan.

Update billing to use:

- `base registration fee`
- `discount amount`
- `effective registration fee`
- `credit applied`
- `remaining balance`

`InstallmentPlanStep.tsx` must stop deriving total fee from plan alone and instead read the resolved effective fee.

## Admin Workflow

### 1. Promo Codes Admin

Add admin page:

- list promo codes,
- create code,
- edit code,
- enable/disable,
- set redemption limits,
- inspect usage count.

### 2. Intake Queue Admin

Add admin/AM queue for all self-serve signups with:

- seeker name,
- selected plan,
- offer path,
- submitted code,
- resolved discount,
- onboarding completion state,
- availability for current month,
- assign to AM,
- approve,
- waitlist,
- reject.

### 3. Capacity Admin

Add admin page for capacity by month with:

- each AM,
- current monthly limit,
- approved count,
- remaining spots,
- override control.

Default new month values:

- 4 for each active AM unless overridden.

### 4. Referrals Admin

Update current referrals admin to show:

- referral source,
- referred user conversion stage,
- earned credit amount,
- whether credit was applied,
- wallet balance if not yet applied.

The existing reward UI is payout-oriented and should be renamed/reframed around credits.

## Public Capacity Logic

Show a real count:

- `spots_left = total_monthly_capacity - approved_or_active_intakes_this_month`

Recommended statuses that count against current month capacity:

- `approved_preview`
- `preview_active`
- `approved_payment_pending`
- `active_client`

Do not count:

- `draft`
- `submitted`
- `pending_review`
- `waitlisted`
- `rejected`
- `preview_expired`

### Public Fallback

If the capacity query fails:

- do not show a fake number,
- show copy only:
  - `Limited onboarding capacity this month`

## Exact Website Copy

Use this as the first pass.

### Homepage Hero Support Copy

- `Choose the path that fits your confidence level: start directly with up to 25% off registration, or begin with a 7-day strategy preview before committing to full execution.`

### Homepage Scarcity Line

- `We only onboard a limited number of new clients each month because every client is paired with a real account manager.`

### Spots Module

- `This month: {N} onboarding spots left`
- `Reviewed and approved by our team before a spot is reserved`

Fallback:

- `Limited onboarding capacity this month`

### Pricing Page Offer Band

- `Direct signup: 20% off Essentials, 25% off Premium`
- `Need more confidence first? Start with a 7-day strategy preview.`

### Strategy Preview Copy

Headline:

- `Try the strategy before you buy the execution`

Body:

- `Your 7-day strategy preview includes a resume audit, a target-role plan, and an optional kickoff call. Live applications and recruiter outreach begin only after payment is confirmed.`

### FAQ Copy

Question:

- `What is the 7-day strategy preview?`

Answer:

- `It is a short planning engagement, not a full free trial of managed search. You receive a resume audit, a target-role plan, and an optional kickoff call. We do not begin live applications, recruiter outreach, or ongoing account-manager execution until payment is confirmed.`

Question:

- `Can I combine the preview with the registration discount?`

Answer:

- `No. You choose one path: start directly with the discounted registration fee, or begin with the 7-day strategy preview and convert later at the standard plan price.`

Question:

- `How do referral discounts work?`

Answer:

- `If you sign up using a valid referral or promo code, the registration fee discount for your selected plan is applied automatically. Essentials receives 20% off and Premium receives 25% off.`

Question:

- `What do I get for referring someone?`

Answer:

- `When your referral is approved and completes their first registration payment, you earn a 5% registration credit that can reduce your own registration balance.`

### Referral Portal Copy

Replace current “earn a reward” framing with:

- `Share your referral link. When a friend is approved and completes their first registration payment, you earn a 5% registration credit.`

Stats labels:

- `Referred`
- `Approved`
- `Activated`
- `Credits Earned`

## API / Backend Change List

New or changed endpoints recommended:

- `POST /api/portal/intake/offer-path`
- `POST /api/portal/intake/resolve-code`
- `POST /api/portal/intake/submit`
- `POST /api/admin/promo-codes`
- `PATCH /api/admin/promo-codes/[id]`
- `GET /api/admin/promo-codes`
- `GET /api/admin/capacity`
- `PUT /api/admin/capacity`
- `GET /api/admin/intake`
- `POST /api/admin/intake/[id]/approve`
- `POST /api/admin/intake/[id]/waitlist`
- `POST /api/admin/intake/[id]/reject`
- `POST /api/portal/strategy-preview/convert`
- `GET /api/public/capacity`

Changed existing logic:

- `POST /api/auth/signup`
  - keep auth creation as-is,
  - optionally capture source code context,
  - but do not finalize discount there.

- `POST /api/portal/billing/contract/sign`
  - accept `baseRegistrationFee`,
  - `discountAmount`,
  - `finalRegistrationFee`,
  - `discountSource`,
  - `discountCode`.

- `POST /api/portal/billing/installments`
  - use effective fee from intake/contract,
  - not hardcoded fee by plan.

## Frontend Change List

Recommended file touch list:

- `apps/web/app/(auth)/signup/page.tsx`
- `apps/web/app/portal/onboarding/OnboardingWizard.tsx`
- `apps/web/app/portal/onboarding/steps/PlanSelectionStep.tsx`
- new step: `ChooseOfferPathStep.tsx`
- new step: `OfferCodeStep.tsx`
- `apps/web/app/portal/onboarding/steps/ContractStep.tsx`
- `apps/web/app/portal/onboarding/steps/InstallmentPlanStep.tsx`
- `apps/web/app/portal/billing/BillingClient.tsx`
- `apps/web/app/portal/referrals/ReferralsClient.tsx`
- `apps/web/app/components/homepage/HeroSection.tsx`
- `apps/web/app/components/homepage/PricingSection.tsx`
- `apps/web/app/components/faqs.ts`
- new admin pages for promo codes, intake queue, and capacity.

## Rollout Plan

### Phase 1: Core Revenue Path

Ship first:

- direct discount path,
- promo code resolution,
- seeker referral discount resolution,
- updated billing using effective registration fee,
- portal referral copy update,
- admin promo code management.

Reason:

- lowest operational risk,
- highest immediate conversion impact.

### Phase 2: Capacity and Approval

Ship next:

- intake states,
- AM monthly capacity,
- public spots remaining,
- admin intake approval queue,
- waitlist states.

Reason:

- this is the layer that makes scarcity real instead of cosmetic.

### Phase 3: Strategy Preview

Ship last:

- preview agreement,
- preview state machine,
- preview expiration and conversion logic,
- preview-specific admin workflow.

Reason:

- most operational nuance,
- highest risk of edge cases,
- should be implemented after core pricing and capacity are stable.

## Acceptance Criteria

The system is ready when:

- a user can self-serve signup and choose either direct discount or preview,
- a valid promo code or referral code produces the correct plan-specific registration discount,
- installment totals match the effective fee, not the base fee,
- AM/admin can approve or waitlist users based on real monthly capacity,
- public site can show accurate remaining spots,
- referred users trigger a 5% referrer credit only after approval plus first payment,
- and the portal/admin copy reflects credits instead of generic referral rewards.

## Remaining Open Decisions

One decision still needs confirmation before implementation:

- what should happen to new referral credits if the referrer has already paid their registration fee in full?

Recommended answer:

- keep credits in a wallet ledger for phase 1,
- display them in portal,
- and decide later whether they become cash payouts, success-fee credits, or another benefit.
