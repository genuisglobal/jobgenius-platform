-- Migration 062: Referral System
-- Adds referral codes to job_seekers and a referrals tracking table

-- 1. Add referral_code column to job_seekers
ALTER TABLE job_seekers
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

-- 2. Function to generate a random 8-char alphanumeric code (excludes ambiguous chars: O, 0, 1, I)
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code TEXT := '';
  i INT;
  attempt INT := 0;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;

    -- Check uniqueness
    IF NOT EXISTS (SELECT 1 FROM job_seekers WHERE referral_code = code) THEN
      RETURN code;
    END IF;

    attempt := attempt + 1;
    IF attempt > 100 THEN
      RAISE EXCEPTION 'Could not generate unique referral code after 100 attempts';
    END IF;
  END LOOP;
END;
$$;

-- 3. Trigger to auto-assign referral_code on insert
CREATE OR REPLACE FUNCTION assign_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := generate_referral_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_referral_code ON job_seekers;
CREATE TRIGGER trg_assign_referral_code
  BEFORE INSERT ON job_seekers
  FOR EACH ROW
  EXECUTE FUNCTION assign_referral_code();

-- 4. Backfill existing seekers that have no referral_code
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM job_seekers WHERE referral_code IS NULL LOOP
    UPDATE job_seekers
    SET referral_code = generate_referral_code()
    WHERE id = r.id;
  END LOOP;
END;
$$;

-- 5. Referrals table
CREATE TABLE IF NOT EXISTS referrals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id     UUID NOT NULL REFERENCES job_seekers(id) ON DELETE CASCADE,
  referred_id     UUID REFERENCES job_seekers(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'signed_up' CHECK (status IN ('signed_up', 'placed', 'rewarded')),
  reward_amount   NUMERIC(10, 2),
  reward_paid_at  TIMESTAMPTZ,
  reward_notes    TEXT,
  signed_up_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  placed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(referrer_id, referred_id)
);

-- 6. RLS: service role only
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_referrals" ON referrals;
CREATE POLICY "service_role_all_referrals"
  ON referrals
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
