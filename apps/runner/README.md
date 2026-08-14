# JobGenius Playwright Runner

## Overview
Minimal Playwright worker that polls JobGenius for application work, opens a browser, fills Greenhouse forms, uploads a resume, submits the application, and reports status back to the API.

The worker prefers the newer task contract:
- `POST /api/apply/tasks/claim`
- `POST /api/apply/runs/start`

If those routes are not present, it falls back to the current monorepo apply lifecycle:
- `GET /api/apply/next-global`
- `POST /api/apply/start`
- `POST /api/apply/event`
- `POST /api/apply/complete`
- `POST /api/apply/pause`

## Environment
- `API_BASE_URL` required
- `RUNNER_AUTH_TOKEN` required
- `RUNNER_ID` optional
- `RUNNER_POLL_INTERVAL_MS` default `5000`
- `PLAYWRIGHT_HEADLESS` default `true`
- `PLAYWRIGHT_SUBMIT_ENABLED` default `false`
- `PLAYWRIGHT_SLOW_MO_MS` optional
- `PLAYWRIGHT_NAVIGATION_TIMEOUT_MS` default `45000`
- `PLAYWRIGHT_ACTION_TIMEOUT_MS` default `15000`
- `VERIFY_GREENHOUSE_URL` optional helper for `npm run prepare:greenhouse`
- `VERIFY_JOB_SEEKER_ID` optional helper override for `npm run prepare:greenhouse`
- `VERIFY_AUTO_START` default `true` for `npm run prepare:greenhouse`

Backward-compatible aliases are also supported:
- `JOBGENIUS_API_BASE_URL`
- `JOBGENIUS_API_KEY`

Backend requirements for runner auth:
- `RUNNER_AUTH_TOKEN` must be set in `apps/web`
- `RUNNER_AM_EMAIL` must be set in `apps/web`
- the runner bearer token must exactly match the backend `RUNNER_AUTH_TOKEN`

## Local Run
```bash
cd apps/runner
npm install
npx playwright install
npm run check:auth
npm start
```

## Current Scope
- Greenhouse adapter only
- Fills `input`, `textarea`, and `select`
- Uploads resume files when an upload field is present
- Pauses runs clearly when required fields remain, resume upload fails, submit is missing, or confirmation cannot be detected
- Skips clicking submit unless `PLAYWRIGHT_SUBMIT_ENABLED=true`

## Real Greenhouse Verification
Use a real public Greenhouse application URL to create a deterministic verification task for the runner's assigned seeker.

```bash
cd apps/runner
npm run prepare:greenhouse -- "https://boards.greenhouse.io/<company>/jobs/<job-id>"
npm start
```

Notes:
- Stop any other background runner process first, or it may claim the task before your foreground run does.
- The helper saves the job, queues it, and creates or retries a run.
- Leave `PLAYWRIGHT_SUBMIT_ENABLED` unset or `false` for a safe pre-submit verification.
- Set `PLAYWRIGHT_SUBMIT_ENABLED=true` only when you want the runner to attempt a real submission.

## Two entrypoints (IMPORTANT)

- `npm start` → `index.js` → **worker.js**: the legacy worker Fly currently
  runs. Greenhouse only; any other ATS pauses `UNSUPPORTED_ATS`.
- `npm run start:engine` → **src/index.js**: the full engine stack — all
  adapters (LinkedIn, Greenhouse, Lever, SmartRecruiters, hosted ATSes,
  deep Workday), storage-state reuse, screening-answer classify, captcha
  service, failure screenshots, watchdog, circuit breakers, per-seeker
  hourly caps.

The Workday support below lives in the engine stack. To serve Workday runs
in production, switch the Fly process to `npm run start:engine` (after a
staging soak) or run a second machine with that command.

## Workday deep adapter (src/adapters/workday.js)

Workday requires an account per (seeker, tenant). The adapter:
1. Clicks Apply → "Apply Manually" (deterministic; skips resume-parse).
2. On the tenant auth wall, fetches per-tenant credentials from
   `POST /api/apply/ats-account` (created on first use: email = seeker
   email so Workday's verification codes flow through the existing
   `/api/otp` pipeline; password generated + stored AES-256-GCM-encrypted
   under `ATS_ACCOUNT_ENCRYPTION_KEY` — set it on BOTH the web app and
   runner environments' API). Signs in, or creates the account, with one
   crossover attempt; on hard failure marks the row LOGIN_FAILED and
   pauses `REAUTH_REQUIRED`.
3. Fills via stable `data-automation-id`s first (legalNameSection_*,
   addressSection_*, phone-number), then the generic hint pass, then
   deterministic listboxes (country/state/phone type) via the ARIA
   combobox driver. Remaining dropdowns are reported by
   `extractRequiredFields` as `combobox` fields and answered by the
   classify step (fillClassifiedFields now drives ARIA widgets too).
4. Advances the wizard via `bottom-navigation-next-button`, capturing a
   per-page screenshot before each Next, and pauses with the exact
   Workday error-banner text when validation rejects the page.
5. Confirms only on Workday success copy with no wizard Next button left.

### Staging verification (acceptance: 3 real postings E2E)
1. Set `ATS_ACCOUNT_ENCRYPTION_KEY` (web + confirm `/api/apply/ats-account`
   returns credentials for a test seeker) and run migration 105.
2. Queue 3 public `*.myworkdayjobs.com` postings for a test seeker.
3. `RUNNER_DRY_RUN=1 npm run start:engine` first — expect runs to pause
   `DRY_RUN_CONFIRM_SUBMIT` on the Review page with per-step screenshots
   in the run timeline; then rerun without dry-run to submit.
4. Success rate appears per-ATS in /dashboard/admin/adapter-health.
