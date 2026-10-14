# JobGenius Saver Extension

Chrome extension for AMs to save jobs and run the Phase 3 automation runner.

## Load unpacked in Chrome
1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the folder `apps/extension`.

## Set the API Base URL
1. Click the extension icon to open the popup.
2. Paste your API base URL (for example: `https://jobgenius-platform.vercel.app`).
3. The value is saved automatically.

## Configure runner (Phase 3)
1. Connect with your **AM Code** to authenticate.
2. Select the **Active Job Seeker** from the dropdown.
3. Click **Start Runner**.
4. The service worker polls `/api/apply/next` every minute and executes jobs.

## Test
1. Open any job listing page in a tab.
2. Click **Save Job** in the extension popup.
3. Visit `/dashboard/saved-jobs` in your web app to confirm the entry appears.

## Cross-seeker orchestration (v0.4.28)
- Apply tab has an **"Apply across all my seekers (cycle the whole book)"**
  toggle. With it on, the background runner round-robins every assigned seeker
  each poll, claiming runs across the book until the shared concurrency cap (5)
  fills — so the Cockpit's queued work actually gets applied, not just staged.
- Each claim still goes through the normal per-seeker `/api/apply/next`, so every
  gate (velocity/pacing/quiet-hours, duplicate check, kill-switches) applies per
  seeker; the server also enforces the shared cap, so it can't over-launch. A
  persistent round-robin cursor prevents starving later seekers. Off = the
  original single-active-seeker behavior.

## Admin oversight (v0.4.27)
- Admin-role AMs get an extra **Admin** tab in the popup (hidden for everyone
  else — revealed only when `GET /api/extension/admin/overview` returns 200):
  - **Automation kill-switches** — GLOBAL_APPLY + per-ATS on/halt toggles.
    Halting takes a confirming second click (no native confirm dialog, which can
    close the popup); disabling raises a MEDIUM ops_alert, same as the dashboard.
  - **Adapter health (7d)** — per-ATS success rate + healthy/degraded/down.
  - **QA reviews** — pending-count from the QA queue.
- Endpoints verify the extension session AND the AM's admin role via
  `lib/extension-admin.ts` (`requireExtensionAdmin`) — the extension uses a
  Bearer session, not the cookie the `/api/admin/*` routes expect.

## AM Cockpit — triage board (v0.4.23)
- New default **Cockpit** tab in the popup: instead of stepping through seekers
  one at a time, the AM sees EVERY assigned seeker ranked by how much work they
  need — needs-attention runs, pending queue, and new above-threshold matches
  not yet actioned — with a top-line total across the whole book.
- One **Work** button per seeker makes them active and jumps straight to the tab
  holding their most urgent work (Apply for attention/queue, Matches for new).
- A per-row **Queue N** quick action (v0.4.24) makes the seeker active and queues
  all their new matches for the auto-apply runner in one click — no drilling in —
  then refreshes the board so the counts move from "new" to "queued".
- Powered by `GET /api/extension/cockpit` (verifies the extension session,
  aggregates `job_match_scores` / `application_queue` / `application_runs` across
  all assigned seekers, applies each seeker's own match threshold, and ranks).
  Read-only — nothing is claimed or mutated.

## Match Intelligence overlay (v0.4.21)
- On any job listing page (LinkedIn, Indeed, Greenhouse, Lever, Ashby, etc.) the
  spy overlay now scores the current job against the **active seeker** in real
  time and shows a match-score badge, matched skills, and missing keywords to
  add to the résumé.
- Powered by `POST /api/extension/score-job` (verifies the extension session,
  parses the scraped JD with the heuristic parser, and runs `computeMatchScore`
  — no LLM, nothing persisted). The auth token stays in the background worker;
  the content script only sends the scraped job and renders the result.
- The same card keeps the "Yes, I Applied" tracking action.

## AI Review surface (v0.4.22)
- After "Tailor résumé & autofill" (or any autofill that generates long-form
  answers), the Mode 3 sidebar now shows an **AI Review** section:
  - **Résumé card** — the tailoring changes summary, before→after keyword
    coverage, a safety badge (no-fabrication check), and a **Use base résumé
    instead** button that re-uploads the base résumé to the file input.
  - **AI-drafted answers** — each generated cover-letter/essay answer in a
    full-size editable textarea. Saving an edit fills the page field AND teaches
    the learning loop (recorded as a correction for reuse).
- **Provenance badges (v0.4.25)** — every filled field (checklist + AI answers)
  shows which layer produced it: **Memory** (learned rule from past
  applications), **Saved** (the seeker's screening answer), **Default**
  (deterministic EEO/work-auth fallback), **Profile** (straight from the seeker
  record), or **AI** (freshly generated). Sourced from the resolver's
  `resolved[{label,source,confidence}]` (now threaded through `classifyFields`),
  so the AM knows at a glance which answers to scrutinize.
- Plumbing: `background.js` passes the tailoring result + base résumé URL into
  the `AUTOFILL_PAGE` message; `dom.classifyFields` returns the AI answer map
  without filling so the panel can review it; `runner/index.js` builds the
  review from the long-form answers.

## Outcome tracking capture (v0.4.26)
- At Mode-3 fill time the runner tallies how many fields were answered from AI /
  memory / saved answers / defaults (from the resolver's per-field source) and
  posts them to `POST /api/extension/answer-stats` (keyed to the captured job).
- These feed the server-side conversion analytics (`application_answer_stats` →
  nightly `application_outcomes` rollup → `/dashboard/admin/interview-conversion`),
  so "AI-answered applications convert at X%" becomes measurable. Best-effort,
  fire-and-forget; nothing blocks the fill.

## Runner behavior (MVP)
- Supports LinkedIn Easy Apply, Greenhouse, Workday (basic click/fill).
- Logs events to `/api/apply/event`.
- Captcha or unknown steps pause the run and flag **Needs Attention** in the dashboard.

## Runner v1 testing
1. Seed demo data with `POST /api/seed/demo`.
2. Copy the returned `job_seeker_id` into the extension popup.
3. Start the runner and watch `/dashboard/jobseekers/[id]/queue`.
4. Expect either APPLIED or NEEDS_ATTENTION with a reason.

## Local testing notes
- The runner sends `Authorization: Bearer <token>` and `x-runner: extension` headers.
- Resume uploads use `resume_url` from the job seeker record (best-effort).
