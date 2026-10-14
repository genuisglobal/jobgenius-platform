-- Migration 072: Job discovery accuracy phase 1
-- ============================================
-- 1. Source-specific discovery config
-- 2. Content-aware refresh tracking for job_posts
-- 3. Freshness trigger for discovery-driven updates

ALTER TABLE public.job_sources
  ADD COLUMN IF NOT EXISTS discovery_config JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.job_posts
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

ALTER TABLE public.job_posts
  ADD COLUMN IF NOT EXISTS last_content_change_at TIMESTAMPTZ;

ALTER TABLE public.job_posts
  ADD COLUMN IF NOT EXISTS last_discovery_status TEXT;

CREATE INDEX IF NOT EXISTS job_posts_last_content_change_idx
  ON public.job_posts (last_content_change_at DESC)
  WHERE last_content_change_at IS NOT NULL;

UPDATE public.job_posts
SET
  content_hash = COALESCE(
    content_hash,
    encode(
      digest(
        lower(trim(regexp_replace(coalesce(title, ''), '\s+', ' ', 'g'))) || '::' ||
        lower(trim(regexp_replace(coalesce(company, ''), '\s+', ' ', 'g'))) || '::' ||
        lower(trim(regexp_replace(coalesce(location, ''), '\s+', ' ', 'g'))) || '::' ||
        lower(trim(regexp_replace(coalesce(description_text, ''), '\s+', ' ', 'g'))),
        'sha256'
      ),
      'hex'
    )
  ),
  last_content_change_at = COALESCE(last_content_change_at, parsed_at, discovered_at, created_at),
  last_discovery_status = COALESCE(last_discovery_status, CASE WHEN source_name IS NOT NULL THEN 'backfilled' ELSE NULL END);

CREATE OR REPLACE FUNCTION public.job_posts_sync_discovery_freshness()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.first_seen_at := COALESCE(NEW.first_seen_at, NEW.discovered_at, NEW.created_at, NOW());
  NEW.times_seen := GREATEST(COALESCE(NEW.times_seen, 1), 1);
  NEW.last_seen_at := COALESCE(NEW.last_seen_at, NEW.discovered_at, NEW.created_at, NOW());
  NEW.freshness_score := public.compute_job_freshness(NEW.posted_at, NEW.last_seen_at, NEW.times_seen);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_posts_sync_discovery_freshness ON public.job_posts;

CREATE TRIGGER trg_job_posts_sync_discovery_freshness
BEFORE INSERT OR UPDATE OF posted_at, last_seen_at, times_seen, discovered_at, first_seen_at
ON public.job_posts
FOR EACH ROW
EXECUTE FUNCTION public.job_posts_sync_discovery_freshness();
