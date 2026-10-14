-- 110_interview_scheduling_links.sql
-- Detected scheduling links on inbound recruiter replies.
--
-- When a recruiter's reply contains a link to a scheduling tool (Calendly,
-- HubSpot Meetings, Chili Piper, Cal.com, Microsoft Bookings, etc.) it's a
-- strong, deterministic signal they're ready to book NOW — today this is
-- entirely manual: an AM has to notice it inside individual reply threads.
-- lib/interview-link-detector.ts extracts the link deterministically (no
-- freeform date/time NLP — too fragile to trust); the resend webhook
-- (app/api/outreach/webhook/resend/route.ts) stores it here on REPLIED;
-- /dashboard/outreach/scheduling queues unconverted links for the AM, who
-- confirms the actual interview via the existing POST /api/interviews.

ALTER TABLE outreach_messages
  ADD COLUMN IF NOT EXISTS detected_scheduling_link text,
  ADD COLUMN IF NOT EXISTS detected_scheduling_provider text,
  -- PENDING: link found, no interview created yet | CONVERTED: AM created
  -- the interview from this link | DISMISSED: AM reviewed and set aside.
  ADD COLUMN IF NOT EXISTS scheduling_link_status text;

ALTER TABLE outreach_messages
  DROP CONSTRAINT IF EXISTS chk_scheduling_link_status;
ALTER TABLE outreach_messages
  ADD CONSTRAINT chk_scheduling_link_status
  CHECK (scheduling_link_status IS NULL
         OR scheduling_link_status IN ('PENDING', 'CONVERTED', 'DISMISSED'));

CREATE INDEX IF NOT EXISTS idx_outreach_messages_scheduling_pending
  ON outreach_messages (created_at DESC)
  WHERE scheduling_link_status = 'PENDING';

COMMENT ON COLUMN outreach_messages.detected_scheduling_link IS
  'Scheduling-tool URL extracted from an inbound reply body (Calendly/HubSpot Meetings/etc). Set by the resend webhook; see lib/interview-link-detector.ts.';
COMMENT ON COLUMN outreach_messages.scheduling_link_status IS
  'PENDING (needs AM action) -> CONVERTED (interview created) | DISMISSED. Null when no link was detected.';
