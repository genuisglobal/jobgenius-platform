# Job Discovery Accuracy Phase 1 Spec

## Goal

Increase discovery recall without flooding the system with noise by fixing two structural issues in the current pipeline:

1. Rediscovered jobs are not refreshed.
2. Crawl depth is capped too early with fixed limits.

Phase 1 is intentionally narrow. It does **not** add new job boards, ATS adapters, or ML ranking. It upgrades the current discovery loop so we stop missing jobs for mechanical reasons.

## Why This Phase Comes First

Current issues in the codebase:

- The runner hard-caps each search at `5` pages and `50` jobs in `apps/runner/src/discovery/agent.js`.
- The scraper hard-caps description fetches at `20` jobs in `apps/runner/src/discovery/scraper.js`.
- Rediscovered jobs only refresh `last_seen_at` and `is_active` in `apps/web/app/api/discovery/jobs/save/route.ts`.
- `job_discovery_runs.jobs_updated` exists in schema, but the runner always reports `0`.
- `job_posts` already has `first_seen_at`, `times_seen`, and `freshness_score`, but the discovery save path does not use them well.

This means the system can:

- miss jobs because it stops crawling too early
- keep stale job content after the source changed
- underreport whether a source is actually healthy
- re-match only new inserts while ignoring meaningful updates

## Success Criteria

Phase 1 is successful if we can measure all of the following:

- more `jobs_found` per run on high-yield searches
- non-zero `jobs_updated` on rediscovery runs
- `description_text` coverage increases for scraper sources
- `times_seen` increments on rediscovery
- `freshness_score` changes when `posted_at` / `last_seen_at` / `times_seen` change
- updated jobs can be re-matched when content materially changed

## Non-Goals

Not in Phase 1:

- title-alias query expansion
- new ATS integrations
- hidden XHR / JSON-LD extraction
- adjacent-opportunity ranking lane
- recruiter-demand ingestion

Those come after this phase is stable.

## Scope

Phase 1 has four deliverables:

1. Content-aware refreshes for existing `job_posts`
2. Source-specific crawl configuration instead of fixed global caps
3. Better run telemetry from runner to backend
4. Re-match updated jobs when the content materially changed

## Data Model Changes

Create a new migration, e.g. `072_job_discovery_accuracy_phase1.sql`.

### 1. `job_posts`

Add:

- `content_hash text`
- `last_content_change_at timestamptz`
- `last_discovery_status text`

Recommended meaning:

- `content_hash`: hash of canonical discovery fields used to detect material change
- `last_content_change_at`: when title/location/description/company materially changed
- `last_discovery_status`: last save-path outcome such as `inserted`, `updated`, `unchanged`

Indexes:

- index on `content_hash` is optional for Phase 1
- index on `last_content_change_at desc` is useful for ops review

### 2. `job_sources`

Add:

- `discovery_config jsonb not null default '{}'::jsonb`

Purpose:

- source-level crawl limits
- early-stop thresholds
- description fetch budget
- retry behavior

Example shape:

```json
{
  "max_pages": 12,
  "max_jobs": 180,
  "max_zero_yield_pages": 2,
  "fetch_descriptions": true,
  "max_description_fetches": 60,
  "page_timeout_ms": 30000,
  "scroll_delay_ms": 1200
}
```

This avoids hardcoding source behavior in the runner.

### 3. No new table is required

Phase 1 should reuse:

- `job_discovery_runs`
- `job_discovery_searches`
- `job_posts`

Do not create a second discovery-results table yet.

## Save Semantics

Update `apps/web/app/api/discovery/jobs/save/route.ts`.

### Insert path

For new jobs:

- normalize URL
- parse structured fields from `description_text`
- compute `content_hash`
- set:
  - `discovered_at`
  - `first_seen_at`
  - `last_seen_at`
  - `times_seen = 1`
  - `last_content_change_at = now()`
  - `last_discovery_status = 'inserted'`
- enqueue auto-match

### Update path

For existing jobs found by URL or `(external_id, source_name)`:

1. Load the existing row with fields needed for comparison.
2. Compute a new canonical hash from:
   - normalized title
   - normalized company
   - normalized location
   - normalized description text
3. Always update:
   - `last_seen_at`
   - `is_active = true`
   - `times_seen = times_seen + 1`
   - `discovery_run_id`
4. If the new hash is different, also update:
   - `title`
   - `company`
   - `location`
   - `description_text`
   - `external_id`
   - `posted_at`
   - parsed fields from `parseJobPost(...)`
   - `parsed_at`
   - `content_hash`
   - `last_content_change_at = now()`
   - `last_discovery_status = 'updated'`
5. If the hash is unchanged, set:
   - `last_discovery_status = 'unchanged'`

### Re-match rule

If a job is materially updated, re-enqueue it for `AUTO_MATCH_JOB_POSTS`.

Reason:

- title change
- location change
- salary change
- description change

all can alter seeker match scores.

## Runner Changes

### `apps/runner/src/discovery/agent.js`

Replace the current fixed defaults as the primary behavior.

Keep env vars as global fallbacks only.

Add a small helper:

- `resolveDiscoveryConfig(source, search)`

Resolution order:

1. `search.filters.discovery_config`
2. `source.discovery_config`
3. env defaults

The runner should pass resolved values into `scrapeJobs(...)` or adapters.

Use and report:

- `maxPages`
- `maxJobs`
- `maxDescriptionFetches`
- `maxZeroYieldPages`
- `scrollDelay`
- `pageTimeout`
- `fetchDescriptions`

Also update the run result mapping:

- `jobs_new = saveResult.saved`
- `jobs_updated = saveResult.updated`
- `jobs_unchanged = saveResult.unchanged`

`jobs_unchanged` can stay in run `metadata` for now. No schema change is needed on `job_discovery_runs`.

### `apps/runner/src/discovery/scraper.js`

Add support for:

- `maxZeroYieldPages`
- `maxDescriptionFetches`
- `stopReason`
- description fetch success/failure counts

Scrape loop change:

- after each page extraction, count how many *new* jobs were found on that page
- if that count is `0`, increment a zero-yield streak
- stop when `zeroYieldStreak >= maxZeroYieldPages`

This is better than fixed page limits alone.

Description fetch change:

- replace the hardcoded `20` limit with `config.maxDescriptionFetches`
- return:
  - `description_fetch_attempted`
  - `description_fetch_succeeded`
  - `description_fetch_failed`

Return these in the discovery run result so backend metadata is useful.

### `apps/runner/src/discovery/api.js`

Update the save result typing expectation to accept:

- `saved`
- `updated`
- `unchanged`
- `duplicates`
- `errors`

Pass the richer run metadata to `/api/discovery/runs/complete`.

## Backend API Changes

### `apps/web/app/api/discovery/jobs/save/route.ts`

Response shape should become:

```json
{
  "success": true,
  "saved": 0,
  "updated": 0,
  "unchanged": 0,
  "duplicates": 0,
  "errors": 0,
  "total": 0
}
```

Interpretation:

- `saved`: newly inserted jobs
- `updated`: existing jobs with material content changes
- `unchanged`: existing jobs re-seen with no content change
- `duplicates`: race-condition unique conflicts only

Do not keep using `duplicates` as a bucket for healthy rediscovery.

### `apps/web/app/api/discovery/runs/complete/route.ts`

Accept richer `metadata`.

Recommended metadata payload:

```json
{
  "jobs_unchanged": 34,
  "stop_reason": "zero_yield_limit",
  "description_fetch_attempted": 40,
  "description_fetch_succeeded": 31,
  "description_fetch_failed": 9,
  "max_pages": 12,
  "max_jobs": 180
}
```

This gives ops enough signal to debug poor sources without another table.

### `apps/web/app/api/discovery/searches/pending/route.ts`

Select and return `job_sources.discovery_config`.

No scheduling redesign yet. Phase 1 only needs the config available to the runner.

## Matching / Enrichment Changes

### `apps/web/lib/matching/extractors.ts`

No algorithm rewrite is required in Phase 1.

Keep `parseJobPost(...)` as-is, but make sure it runs on:

- insert
- material update

This is enough to improve effective accuracy once refreshes work.

## Canonical Hash Rules

Hash these normalized fields:

- title
- company
- location
- description_text

Normalization rules:

- trim
- collapse whitespace
- lowercase
- treat `null` as empty string

Do **not** include:

- `last_seen_at`
- `discovery_run_id`
- `posted_at`
- source-specific ephemeral query params

The hash should detect content changes, not observational changes.

## File-by-File Implementation Sequence

### 1. Migration

Create:

- `apps/web/supabase/migrations/072_job_discovery_accuracy_phase1.sql`

Tasks:

- add `job_sources.discovery_config`
- add `job_posts.content_hash`
- add `job_posts.last_content_change_at`
- add `job_posts.last_discovery_status`
- add any supporting indexes

### 2. Shared helper

Create:

- `apps/web/lib/discovery/content-hash.ts`

Functions:

- `normalizeDiscoveryText(value: string | null | undefined): string`
- `computeDiscoveredJobContentHash(job: { title; company; location; description_text }): string`

Reason:

- keep hash logic identical between insert and update paths

### 3. Backend save path

Update:

- `apps/web/app/api/discovery/jobs/save/route.ts`

Tasks:

- classify rows as insert / updated / unchanged
- update `times_seen`
- re-parse changed jobs
- enqueue re-match for updated jobs
- return richer counters

### 4. Pending-search source config

Update:

- `apps/web/app/api/discovery/searches/pending/route.ts`

Tasks:

- select `discovery_config`
- return it in `source`

### 5. Runner config resolution

Update:

- `apps/runner/src/discovery/agent.js`

Tasks:

- add `resolveDiscoveryConfig(...)`
- stop relying on fixed `DEFAULT_MAX_PAGES` / `DEFAULT_MAX_JOBS` as primary limits
- pass resolved config through to scraper/adapters
- persist `jobs_updated`
- pass telemetry metadata to run completion

### 6. Scraper telemetry and adaptive stopping

Update:

- `apps/runner/src/discovery/scraper.js`

Tasks:

- add zero-yield early stop
- replace hardcoded description limit
- count description success/failure
- return stop reason

### 7. Runner API client

Update:

- `apps/runner/src/discovery/api.js`

Tasks:

- accept richer save response
- send richer completion metadata

### 8. Run completion endpoint

Update:

- `apps/web/app/api/discovery/runs/complete/route.ts`

Tasks:

- store metadata
- no schema change required

## Rollout Plan

### Step 1

Ship migration and backend save-path changes first.

Reason:

- runner can keep working with old behavior while backend gains refresh correctness

### Step 2

Ship runner config resolution and scraper telemetry.

Reason:

- lower risk than changing search generation

### Step 3

Tune `discovery_config` on the highest-yield sources first:

- `linkedin`
- `indeed`
- `glassdoor`

Start conservative, then raise limits where yield justifies it.

## Suggested Initial `discovery_config`

### LinkedIn

```json
{
  "max_pages": 10,
  "max_jobs": 120,
  "max_zero_yield_pages": 2,
  "fetch_descriptions": true,
  "max_description_fetches": 50,
  "scroll_delay_ms": 1200
}
```

### Indeed

```json
{
  "max_pages": 8,
  "max_jobs": 100,
  "max_zero_yield_pages": 2,
  "fetch_descriptions": true,
  "max_description_fetches": 40,
  "scroll_delay_ms": 900
}
```

### Glassdoor

```json
{
  "max_pages": 6,
  "max_jobs": 80,
  "max_zero_yield_pages": 1,
  "fetch_descriptions": true,
  "max_description_fetches": 30,
  "scroll_delay_ms": 1000
}
```

## Testing Checklist

### Unit / functional

- new job insert sets `content_hash`, `times_seen = 1`, `last_discovery_status = inserted`
- rediscovery with same content increments `times_seen` and sets `unchanged`
- rediscovery with changed description sets `updated` and refreshes parsed fields
- updated job is re-enqueued for matching
- scraper stops on zero-yield threshold
- scraper respects `maxDescriptionFetches`

### Smoke test

1. Run one search against a known high-volume source.
2. Confirm `jobs_updated` is non-zero on repeat runs after changing description/title input fixtures.
3. Confirm `job_discovery_runs.metadata` contains stop reason and description counts.
4. Confirm updated jobs receive refreshed match scores.

## Risks

- Raising crawl depth too quickly can increase bans / bot detection.
- Re-matching too many updated jobs can increase queue load.
- Some sources will show noisy description changes due to formatting differences.

## Guardrails

- hash normalized plain text, not HTML
- keep source-specific crawl limits in DB
- only re-match on material content change
- keep env defaults as emergency fallback

## Phase 2 After This

Once Phase 1 is stable, the next correct step is query expansion:

- title aliases
- location variants
- skill-led searches
- remote/hybrid variants

That is where additional recall will come from after the mechanical losses are fixed.
