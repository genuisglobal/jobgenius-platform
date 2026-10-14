-- Migration 065: Enhanced Job Sourcing & Matching Infrastructure
-- ==============================================================
-- 1. Add columns to external_jobs for incremental refresh + dedup
-- 2. Add job freshness column to job_posts
-- 3. Cross-source deduplication function
-- 4. Company career page monitoring table
-- ==============================================================

-- 1. Incremental refresh support
ALTER TABLE public.external_jobs ADD COLUMN IF NOT EXISTS is_stale BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.external_jobs ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.external_jobs ADD COLUMN IF NOT EXISTS description_text TEXT;
ALTER TABLE public.external_jobs ADD COLUMN IF NOT EXISTS salary_min INTEGER;
ALTER TABLE public.external_jobs ADD COLUMN IF NOT EXISTS salary_max INTEGER;
ALTER TABLE public.external_jobs ADD COLUMN IF NOT EXISTS company_slug TEXT;
ALTER TABLE public.external_jobs ADD COLUMN IF NOT EXISTS fingerprint TEXT;

CREATE INDEX IF NOT EXISTS idx_external_jobs_stale ON public.external_jobs (is_stale) WHERE is_stale = false;
CREATE INDEX IF NOT EXISTS idx_external_jobs_fingerprint ON public.external_jobs (fingerprint);

-- 2. Job freshness on job_posts
DO $$ BEGIN
  ALTER TABLE public.job_posts ADD COLUMN IF NOT EXISTS freshness_score REAL;
  ALTER TABLE public.job_posts ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE public.job_posts ADD COLUMN IF NOT EXISTS times_seen INTEGER NOT NULL DEFAULT 1;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- 3. Cross-source deduplication function
-- Generates a fingerprint from normalized title + company and marks older duplicates
CREATE OR REPLACE FUNCTION deduplicate_external_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deduped_count integer := 0;
BEGIN
  -- Update fingerprints for jobs that don't have one
  UPDATE external_jobs
  SET fingerprint = md5(
    lower(regexp_replace(title, '[^a-z0-9]', '', 'gi')) ||
    '::' ||
    lower(regexp_replace(coalesce(company_name, ''), '[^a-z0-9]', '', 'gi'))
  )
  WHERE fingerprint IS NULL;

  -- Mark duplicates: keep the newest per fingerprint, mark others as stale
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY fingerprint
             ORDER BY fetched_at DESC, source
           ) AS rn
    FROM external_jobs
    WHERE fingerprint IS NOT NULL
      AND is_stale = false
  )
  UPDATE external_jobs
  SET is_stale = true
  FROM ranked
  WHERE external_jobs.id = ranked.id
    AND ranked.rn > 1
    AND external_jobs.is_stale = false;

  GET DIAGNOSTICS deduped_count = ROW_COUNT;
  RETURN deduped_count;
END;
$$;

-- 4. Monitored company career pages
CREATE TABLE IF NOT EXISTS public.company_career_pages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name    TEXT NOT NULL,
  career_url      TEXT NOT NULL,
  ats_type        TEXT CHECK (ats_type IN ('greenhouse', 'lever', 'ashby', 'workday', 'icims', 'custom', 'unknown')),
  board_token     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  jobs_found      INTEGER DEFAULT 0,
  check_frequency TEXT NOT NULL DEFAULT 'daily' CHECK (check_frequency IN ('hourly', 'daily', 'weekly')),
  added_by        UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Conditionally add FK if account_managers exists
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'account_managers') THEN
    BEGIN
      ALTER TABLE public.company_career_pages
        ADD CONSTRAINT fk_career_pages_added_by
        FOREIGN KEY (added_by) REFERENCES account_managers(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_career_pages_active ON public.company_career_pages (is_active) WHERE is_active = true;

ALTER TABLE public.company_career_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on company_career_pages"
  ON public.company_career_pages FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- AM read access (safe: only if account_managers exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'account_managers') THEN
    EXECUTE 'CREATE POLICY "AM read access on company_career_pages"
      ON public.company_career_pages FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.account_managers am
          WHERE am.email = coalesce(auth.jwt() ->> ''email'', '''')
        )
      )';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. External jobs promotion tracking
ALTER TABLE public.external_jobs ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_posts') THEN
    ALTER TABLE public.external_jobs ADD COLUMN IF NOT EXISTS promoted_to_job_post_id UUID REFERENCES job_posts(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_external_jobs_promoted ON public.external_jobs (promoted_to_job_post_id) WHERE promoted_to_job_post_id IS NOT NULL;
  END IF;
END $$;

-- 6. Function to compute job freshness score (0-100)
-- Fresh jobs score higher, stale jobs score lower
CREATE OR REPLACE FUNCTION compute_job_freshness(
  posted_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  times_seen INTEGER
)
RETURNS REAL
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  age_days REAL;
  freshness REAL;
BEGIN
  age_days := EXTRACT(EPOCH FROM (NOW() - COALESCE(posted_at, last_seen_at, NOW()))) / 86400.0;

  -- Base freshness: exponential decay over 30 days
  freshness := 100.0 * EXP(-age_days / 15.0);

  -- Bonus for recently re-seen jobs (still active)
  IF last_seen_at IS NOT NULL AND last_seen_at > NOW() - INTERVAL '2 days' THEN
    freshness := freshness + 10;
  END IF;

  -- Small bonus for jobs seen multiple times (confirmed active)
  IF times_seen > 1 THEN
    freshness := freshness + LEAST(5, times_seen);
  END IF;

  RETURN LEAST(100, GREATEST(0, freshness));
END;
$$;
