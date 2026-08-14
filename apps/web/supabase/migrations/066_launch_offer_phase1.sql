-- Migration 066: Launch offer phase 1
-- Adds promo codes, referral registration credits, and pricing breakdown fields.

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  status text not null default 'active' check (status in ('active', 'inactive', 'expired')),
  discount_percent_essentials numeric(5,4) not null default 0.20,
  discount_percent_premium numeric(5,4) not null default 0.25,
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions int,
  redemption_count int not null default 0,
  single_use_per_email boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.account_managers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_promo_codes_status on public.promo_codes(status);

alter table public.promo_codes enable row level security;

drop policy if exists "service_role_all_promo_codes" on public.promo_codes;
create policy "service_role_all_promo_codes"
  on public.promo_codes
  for all
  to service_role
  using (true)
  with check (true);

alter table public.job_seekers
  add column if not exists offer_code text;

create index if not exists idx_job_seekers_offer_code on public.job_seekers(offer_code);

alter table public.job_seeker_contracts
  add column if not exists base_registration_fee numeric(10,2),
  add column if not exists discount_percent numeric(5,4) not null default 0,
  add column if not exists discount_amount numeric(10,2) not null default 0,
  add column if not exists discount_source text,
  add column if not exists discount_code text,
  add column if not exists final_registration_fee numeric(10,2),
  add column if not exists discount_metadata jsonb not null default '{}'::jsonb;

alter table public.registration_payments
  add column if not exists credit_applied_amount numeric(10,2) not null default 0;

create table if not exists public.referral_registration_credits (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals(id) on delete cascade,
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  credit_percent numeric(5,4) not null default 0.05,
  credit_amount numeric(10,2) not null,
  remaining_amount numeric(10,2) not null,
  status text not null default 'earned' check (status in ('earned', 'partially_applied', 'applied', 'expired', 'voided')),
  applied_contract_id uuid references public.job_seeker_contracts(id) on delete set null,
  applied_registration_payment_id uuid references public.registration_payments(id) on delete set null,
  earned_at timestamptz not null default now(),
  applied_at timestamptz,
  expires_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique (referral_id)
);

create index if not exists idx_referral_registration_credits_seeker
  on public.referral_registration_credits(job_seeker_id);

create index if not exists idx_referral_registration_credits_status
  on public.referral_registration_credits(status);

alter table public.referral_registration_credits enable row level security;

drop policy if exists "service_role_all_referral_registration_credits" on public.referral_registration_credits;
create policy "service_role_all_referral_registration_credits"
  on public.referral_registration_credits
  for all
  to service_role
  using (true)
  with check (true);
