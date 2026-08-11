# JobGenius n8n Workflows

These workflows drive autonomous job application through the JobGenius runner.

## Why n8n?

The runner (`apps/runner`) executes Playwright automation but only picks up runs that are already in **READY** status. The background job queue (`background_jobs` table) handles the pipeline from QUEUED → READY, but that queue requires an external caller to process it. n8n provides that trigger layer.

## The Autonomous Application Pipeline

```
Job Post Saved
  └─► AUTO_MATCH_JOB_POST background job enqueued
        └─► [background/run called] → score seekers → AUTO_START_RUN enqueued
              └─► [background/run called] → application_run created (READY)
                    └─► Runner polls /api/apply/next-global → executes application
                          └─► /api/apply/complete → APPLIED ✓
```

The critical missing link: **`POST /api/background/run` must be called repeatedly**.

---

## Workflows

### 01 — Background Job Processor (`01-background-job-processor.json`)

- **Trigger:** Every 1 minute
- **Action:** `POST /api/background/run?limit=10` with `x-ops-key`
- **What it does:** Processes up to 10 pending background jobs per tick, including:
  - `AUTO_MATCH_JOB_POST` — scores seekers against new jobs, adds to queue
  - `TAILOR_RESUME` — AI-tailors resume for a specific job
  - `AUTO_START_RUN` — creates READY application_run for runner to pick up
  - `AUTO_OUTREACH` — drafts post-application networking emails
  - `SCAN_INBOX` — scans Gmail for OTP/interview responses
  - `INTERVIEW_PREP_READY` — generates interview prep content
  - Also recovers stale RUNNING runs (locks older than `AUTO_APPLY_STALE_RUN_MINUTES`)

### 02 — Queue Sweeper (`02-queue-sweeper.json`)

- **Trigger:** Every 5 minutes
- **Action:** `POST /api/ops/queue/sweep` → if items enqueued → `POST /api/background/run?limit=20`
- **What it does:** Safety net. Finds QUEUED items in `application_queue` that have been sitting for > 5 minutes with no `application_run` and no pending `AUTO_START_RUN` background job. Enqueues `AUTO_START_RUN` for them, then immediately kicks the background worker.

---

## Setup

### 1. Environment variables (set in n8n → Settings → Variables)

| Variable | Value |
|---|---|
| `JOBGENIUS_API_URL` | Your Next.js app URL, e.g. `https://app.jobgenius.com` |
| `JOBGENIUS_OPS_API_KEY` | Value of `OPS_API_KEY` env var in your web app |

### 2. Import workflows

In n8n, go to **Workflows → Import** and import each JSON file in order:
1. `01-background-job-processor.json`
2. `02-queue-sweeper.json`

### 3. Activate

Toggle both workflows to **Active**.

---

## Required environment variables in the web app

Make sure these are set in your Vercel / hosting environment:

| Variable | Purpose |
|---|---|
| `OPS_API_KEY` | Secret key that authenticates n8n and Vercel cron requests |
| `AUTO_APPLY_ENABLED` | Set to `true` to allow autonomous application runs |
| `AUTO_APPLY_ALLOWED_ATS` | Comma-separated list, e.g. `LINKEDIN,GREENHOUSE,WORKDAY,GENERIC` |
| `AUTO_TAILOR_ENABLED` | Set to `true` if OpenAI resume tailoring should run before apply |
| `AUTO_APPLY_MAX_RETRIES` | Max retries per run (default: 2) |

> **Important:** `AUTO_APPLY_ENABLED` defaults to `true` only in production (`NODE_ENV=production`). Make sure it is set explicitly to `true` if you're testing in a non-production environment.

---

## Vercel Cron (complementary)

`apps/web/vercel.json` has a Vercel cron that also calls `/api/background/run` every minute.
- Requires Vercel **Pro** plan for per-minute scheduling.
- On Hobby plan, change the schedule to `0 * * * *` (hourly) or rely entirely on n8n.

```json
{
  "crons": [{ "path": "/api/background/run", "schedule": "* * * * *" }]
}
```

---

## Monitoring

Each workflow logs to n8n's execution history. You can also:
- Check `background_jobs` table for `FAILED` status rows
- Check `application_runs` table for runs stuck in `RUNNING` state (recovered automatically by the background worker)
- Check `application_queue` for items stuck in `QUEUED` (the sweeper handles these)
