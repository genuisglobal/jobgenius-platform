-- 103_jd_parser_fields.sql
-- Adds columns for the LLM-based JD parser (lib/matching/jd-parser.ts).
-- The parser enriches the existing regex parse with domain-agnostic skills,
-- responsibilities, and screening questions. required_skills/preferred_skills
-- and parsed_at already exist on job_posts; these three are new.

ALTER TABLE job_posts
  ADD COLUMN IF NOT EXISTS parse_source text,           -- 'regex' | 'hybrid' (null = not yet parsed)
  ADD COLUMN IF NOT EXISTS responsibilities text[],     -- key duties extracted from the JD
  ADD COLUMN IF NOT EXISTS screening_questions jsonb;   -- [{ question, type: boolean|select|text, options? }]

COMMENT ON COLUMN job_posts.parse_source IS
  'How the structured fields were derived: regex (deterministic fallback) or hybrid (regex + LLM). Set by lib/matching/jd-parser.ts.';
COMMENT ON COLUMN job_posts.responsibilities IS
  'Key duties extracted from the job description by the LLM JD parser.';
COMMENT ON COLUMN job_posts.screening_questions IS
  'Application-form questions implied by the JD (work auth, sponsorship, experience, certs). Feeds screening-answer pre-fill.';

-- Backfill lets the ops re-parse endpoint (POST /api/ops/reparse-jobs) target
-- rows that have not yet been LLM-parsed.
CREATE INDEX IF NOT EXISTS idx_job_posts_parse_source_active
  ON job_posts (parse_source)
  WHERE is_active = true;
