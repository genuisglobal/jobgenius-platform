-- Migration 073: Career page source expansion
-- ==========================================
-- Allow additional ATS types for monitored company career pages.

ALTER TABLE public.company_career_pages
  DROP CONSTRAINT IF EXISTS company_career_pages_ats_type_check;

ALTER TABLE public.company_career_pages
  ADD CONSTRAINT company_career_pages_ats_type_check
  CHECK (
    ats_type IN (
      'greenhouse',
      'lever',
      'ashby',
      'workday',
      'smartrecruiters',
      'icims',
      'custom',
      'unknown'
    )
  );
