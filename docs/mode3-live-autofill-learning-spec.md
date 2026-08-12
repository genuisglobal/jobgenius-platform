# Mode 3: Live Autofill + Autonomous Learning Engine — Spec

Status: Draft (verified against code 2026-07-01)
Owner: Extension / Apply
Last updated: 2026-07-01

---

## 1. Summary

Today the extension can apply to a job two ways, both of which require the job to
already be a matched, promoted `job_post` with a server-side **run** and **plan**:

1. **Cloud runner** — server queue/cron claims a run; headless autonomous apply.
2. **Extension "Apply"** — `confirmAutofill()` queues the job (`/api/extension/queue-job`),
   starts a run (`/api/apply/start`), then launches the runner in a tab.

Neither helps when the user is looking at a job **out of the blue** — a careers page
they found themselves, matched or not. There is no `job_post`, no run, no plan, so the
runner bails (`runner/index.js:57` fetches `/api/apply/plan?runId=…`; a missing plan
aborts).

**Mode 3** adds a third capability: an interactive, JobWizard-style **"Autofill this page"**
button that fills the visible application form on *any* tab from the active seeker's
profile — matched or unmatched — and **stops before submit** so the human reviews and
submits.

Mode 3 also does three things beyond filling:

- **Captures & stores the job** (link + scraped description) for unmatched opportunities,
  so the applied-to job and its assets are persisted like any matched job.
- **Offers resume optimization & customization** against the scraped job description
  before filling, reusing the existing tailoring engine.
- **Feeds a learning loop**: every field a human confirms or corrects becomes labeled
  training signal for the `learned_field_rules` cache that both autonomous modes already
  consult — reducing future `NEEDS_ATTENTION` and graduating hosts/fields to "safe to
  automate."

### Goals

- Fill standard identity fields + resume upload on any ATS or generic careers form, on
  demand, from the active seeker's profile. Matched or unmatched (no `job_post_id` required
  up front).
- Persist every applied-to unmatched job (url + description) and its tailored resume.
- Offer resume customization (job-targeted) and optimization (profile-targeted) in-flow.
- Human reviews and submits; default is **fill-only**.
- Emit human accept/correct/fill events into `learned_field_rules`,
  `job_seeker_screening_answers`, host/plan hints, and the auto-apply preflight.

### Non-goals (this spec)

- Auto-submitting in mode 3 (a later, opt-in toggle).
- Replacing the plan-driven autonomous engine.
- New matching/scoring behavior (unchanged).

---

## 2. Verified facts (from code, 2026-07-01)

These pin the design to what actually exists.

- **Injection is already tab-agnostic.** `background.js:436` injects `RUNNER_SCRIPT_FILES`
  into the active tab, all frames, then sends a message. Per-frame self-election
  (`runner/index.js:27`) handles embedded ATS iframes; captcha handled (`index.js:225`).
- **Autofill core is decoupled from the plan.** Adapters keep `fillKnownFields` separate
  from `submit` (`adapters/greenhouse.js:24` vs `:37`) and stop at submit under dry-run
  (`greenhouse.js:46` → `DRY_RUN_CONFIRM_SUBMIT`). Core primitives: `dom.fillAllFields`,
  `dom.uploadResume`, `dom.extractRequiredFields`, `dom.classifyAndFill` (`dom.js:1034`).
- **Profile shape** returned by `/api/apply/next` (`next/route.ts:462`) is exactly:
  `full_name, email, phone, location, linkedin_url, portfolio_url, address_line1,
  address_city, address_state, address_zip, address_country`.
  **There are NO demographic/work-auth fields on the profile** (sponsorship, gender,
  veteran, disability). Those are resolved as **screening answers / classifier output**,
  not profile fields.
- **Resume selection** (`next/route.ts:428`): a **`tailored_resumes`** row (migration 033,
  `UNIQUE(job_seeker_id, job_post_id)`, columns `original_text, tailored_text,
  changes_summary`, plus a later-added `resume_url`) is **preferred over** the base
  `job_seekers.resume_url`. `resume_source` = `"TAILORED" | "BASE"`. Tailored resumes are
  **keyed by `job_post_id`** — so tailoring an unmatched job requires creating a job_post
  first (see §5).
- **Learned rules** (`learned_field_rules`, migration 082): keyed
  `UNIQUE(ats_type, url_host, field_signature)`; columns `mapping (jsonb)`,
  `source TEXT CHECK (source IN ('llm','rule','am_fix','promoted'))`, `confidence`, `hits`.
  `mapping` shape is `{ kind: "static", value }` or `{ kind: "screening_answer", key }`
  (`field-resolver.ts:336`). Adding a new source tier requires **altering the CHECK
  constraint**.
- **Human signal today** only comes from an AM resolving a stuck run
  (`am-resolutions.ts:105` → `recordFieldClassification` as `am_fix`) — rare, reactive.
- **Resume engine exists** (`lib/resume-tailor.ts`): `tailorResumeStructured` (job-targeted,
  returns tailored data/text + before/after `coverage` + `safety` lint),
  `optimizeBaseResumeStructured` (profile/target-title targeted, no JD),
  `refineResumeStructuredWithGuidance` (freeform guidance),
  `buildStructuredResumeFromSeeker`. Gated on `isOpenAIConfigured()`; PDF via
  `renderResumePdf`. Safety lint in `resume-safety.ts`; coverage in `resume-score.ts`.
- **saved_jobs** (migration 001): `title, company, location, description, url UNIQUE,
  source` — a seeker-agnostic bank keyed by url.
- **Auth model**: the extension is **AM-operated**. `/api/apply/next` uses
  `requireAMAccessToSeeker(headers, jobSeekerId)`; `spy-apply` checks
  `account_manager_id` + a `job_seeker_assignments` row. New mode-3 endpoints use the same
  AM-access-to-seeker model.

---

## 3. Mode 3 design — Live Autofill

### 3.1 New profile endpoint (run-less)

`GET /api/apply/autofill-context?jobseekerId=…` — AM-access-to-seeker auth (mirror
`next/route.ts:284`). Returns the profile bundle **without** claiming a run (today the
profile is assembled only inside `fetchNextJob` after a run lock):

```jsonc
{
  "seeker_id": "…",
  "profile": {                       // EXACT job_seekers columns, matching /api/apply/next
    "full_name": "…", "email": "…", "phone": "…", "location": "…",
    "linkedin_url": "…", "portfolio_url": "…",
    "address_line1": "…", "address_city": "…", "address_state": "…",
    "address_zip": "…", "address_country": "…"
  },
  "resume": { "url": "https://…signed…", "filename": "Resume.pdf" },   // base resume
  "screening_answers": [ { "question": "…", "answer": "…" } ]          // job_seeker_screening_answers
}
```

- Resume URL is a short-lived signed URL (same mechanism as `next/route.ts:429`).
- Demographic/work-auth answers come through `screening_answers` + the classifier, never as
  profile fields.
- `full_name` is split client-side into first/last when a form needs them (the base
  profile has no first/last columns).

### 3.2 New injected entrypoint

Add an `AUTOFILL_PAGE` handler alongside `START_RUN` in `runner/index.js`:

```
onMessage AUTOFILL_PAGE:
  if (!shouldRunInThisFrame()) return
  atsType = detectAtsType()
  adapter = registry.resolveAdapter(atsType) || registry.getAdapter("GENERIC")
  ctx = { apiBaseUrl, authToken, profile, resumeUrl, defaultEmail, job:jobMeta,
          dryRun:true, mode:"LIVE_AUTOFILL", learn:true }
  sidebar.show({ atsType, step:"AUTOFILL" })
  if (adapter.clickApplyEntry) await adapter.clickApplyEntry(ctx)   // optional, non-fatal
  fill = await adapter.fillKnownFields(ctx)      // fillAllFields + uploadResume
  missing = adapter.extractRequiredFields()
  if (missing.length) await dom.classifyAndFill(ctx, missing)      // learned→screening→LLM
  missing = adapter.extractRequiredFields()
  // STOP. No submit. Report + highlight leftovers.
  emitFieldEvents(ctx)                            // see §6
  sidebar.finish("Ready for review", `Filled N fields; ${missing.length} need your input`)
```

Differences vs `runAutomation`: no plan fetch/generate; never calls `adapter.submit`;
highlights unresolved required fields for the human.

### 3.3 Background handler

Add `AUTOFILL_ACTIVE_TAB` in `background.js`:

```
1. read {apiBaseUrl, authToken, activeSeekerId} from storage
2. GET /api/apply/autofill-context  → { profile, resume, screening_answers }
3. capture active tab (id, url, title) via chrome.tabs.query({active,currentWindow})
4. (optional) scrape JD + POST /api/apply/capture-job  → { job_post_id }   // see §5
5. (optional) if user chose tailoring: POST /api/apply/tailor-live → tailored resume url // §7
6. executeScript(RUNNER_SCRIPT_FILES, {tabId, allFrames:true})
7. tabs.sendMessage(tabId, { type:"AUTOFILL_PAGE", apiBaseUrl, authToken,
      activeSeekerId, profile, resumeUrl, screeningAnswers, job:{title,company,url,job_post_id} })
```

Reuses the exact injection primitive from `startRunnerInExistingTab`.

### 3.4 Popup UI

In the **Apply tab** (already shows "CURRENT PAGE … ✓ Greenhouse"), add:

- **"Autofill this page"** — primary; enabled whenever a seeker is connected and a page is
  detected. **No match required.**
- **"Customize resume for this job"** / **"Optimize resume"** — see §7.
- Fill summary + "N fields need your input" after the run.

### 3.5 Submit policy

- Default **fill-only**; the human submits.
- Later, opt-in **"Fill & submit"** reuses `adapter.submit` (drop `dryRun`).
- Unknown ATS: `GENERIC` adapter + `classifyAndFill` still fill standard fields.

---

## 4. Capturing & storing unmatched opportunities

**Requirement:** for jobs applied to via mode 3, capture and store the job link +
description even when the job was never matched.

**Approach — "lightweight promote" to a `job_post`.** When the user autofills/applies (or
opts to tailor), scrape `{ url, title, company, description_text }` from the page and
**find-or-create** a `job_post`, deduped by `url` exactly like `admin/promote-jobs`
(`promote-jobs/route.ts:75`). This yields a `job_post_id`, which unlocks:

- `tailored_resumes` (keyed by `job_post_id`) — resume customization (§7);
- `application_runs` tracking — the applied job shows in the portal tracker / my-jobs;
- future matching + dedup — the job enters the Job Bank and can be scored later.

`POST /api/apply/capture-job` (AM-access-to-seeker auth):

```jsonc
// request
{ "job_seeker_id": "…", "url": "…", "title": "…", "company": "…",
  "location": "…", "description_text": "…", "ats_type": "GREENHOUSE" }
// response
{ "job_post_id": "…", "created": true, "already_existed": false }
```

Handler:
1. Normalize url (`resolveJobTargetUrl`). Look up `job_posts` by url → reuse if present.
2. Else insert `job_posts` with `source_type: "manual_autofill"`, `is_active: true`,
   `description_text`, `discovered_at = now()`, and run `parseJobPost` on the description
   to populate `required_skills/preferred_skills/seniority/...` (same as promote-jobs:110).
3. Also upsert `saved_jobs` (`onConflict: url`) so the JD lands in the seeker-agnostic bank.
4. Return `job_post_id`.

**Tracking the application:** when the human confirms they applied (reuse the existing
`spy-apply` / `JOB_SPY_MARK_APPLIED` path, `background.js:968`), create/complete an
`application_runs` row with `source: "manual_autofill"` and the captured `job_post_id`, so
mode-3 applications are tracked identically to matched ones.

**Why not just `saved_jobs`?** `saved_jobs` has no seeker link and no `job_post_id`, so it
cannot key tailored resumes or feed tracking. We write it too (cheap, deduped) but the
`job_post` is the primary store.

---

## 5. Resume optimization & customization (Mode 3)

**Requirement:** resume optimization and customization must be available for mode 3.

Reuse `lib/resume-tailor.ts` wholesale — it already returns before/after skill `coverage`
and a `safety` lint.

### 5.1 Customize for THIS job (job-targeted)

Requires the captured `job_post_id` from §4 (so the result persists in `tailored_resumes`).

`POST /api/apply/tailor-live` (AM-access-to-seeker auth; gated on `isOpenAIConfigured()`):

```jsonc
// request
{ "job_seeker_id": "…", "job_post_id": "…" }   // job_post_id from capture-job
// server:
//   base = buildStructuredResumeFromSeeker(seeker)
//   result = tailorResumeStructured({ baseResume: base, jobTitle, company,
//              jobDescription: job_posts.description_text, requiredSkills, preferredSkills })
//   render PDF (renderResumePdf) → upload → upsert tailored_resumes(job_seeker_id, job_post_id)
// response
{ "tailored_url": "…signed…", "changes_summary": "…",
  "coverage": { "before": {...}, "after": {...} }, "safety": {...} }
```

The autofill then uploads `tailored_url` instead of the base resume — mirroring the run
path's tailored-over-base preference (`next/route.ts:428`).

### 5.2 Optimize resume (profile-targeted, no JD)

For a general polish when there is no specific JD (or the user just wants a better base):
`optimizeBaseResumeStructured({ baseResume, targetTitles, seniority, preferredIndustries,
keySkills })`. Saves to the seeker's resume bank / base resume, not `tailored_resumes`.

### 5.3 Guardrails (reuse existing)

- **Safety lint** (`resume-safety.ts`): block/flag fabrication, identity drift, keyword
  stuffing, length. Surface the `safety` result in the popup before the user accepts.
- **Coverage delta** shown to the user (before → after skill coverage) so the value is
  visible.
- Tailoring is **opt-in per apply** and always previewed; the human accepts before it is
  uploaded.

### 5.4 UI flow

```
Apply tab → "Customize resume for this job"
  → capture-job (get job_post_id)
  → tailor-live (coverage + safety + changes summary shown)
  → user Accepts → tailored_url becomes the resume used by "Autofill this page"
```

---

## 6. Learning loop — Mode 3 as training front-end

### 6.1 Principle

Every reviewed field is a label. At review/submit time the runner diffs the
**autofilled** value against the **final** DOM value and emits an event per field.

| Human action | Meaning | Learning write |
|---|---|---|
| Accepts (unchanged) | mapping correct | `recordFieldHit` → confidence ↑ |
| Corrects | mapping wrong | `recordFieldClassification` (high-trust source) overrides prior |
| Fills a blank | no rule existed | new rule → net-new coverage |

Rules key on `field_signature` + `url_host`, so one seeker's correction improves autonomous
runs for **all** seekers on that host+field.

### 6.2 New source tier (migration)

Extend the `learned_field_rules.source` CHECK constraint
`('llm','rule','am_fix','promoted')` with **`user_confirmed`** (live human, mode 3):

- weighted above `llm`, below explicit admin `rule`;
- seed confidence ~0.8; eligible for auto-promotion (`PROMOTION_HITS = 3`);
- distinct source so it is auditable/reversible separately from `am_fix`.

### 6.3 Canonical mappings, not raw PII

Store the existing `mapping` vocabulary, reverse-mapped from the human's final value:

- Matches a profile field → `mapping: { kind: "static", value }` **only for enumerated /
  non-PII** values; for identity fields learn the *profile key association*, not the value.
- Screening question → `mapping: { kind: "screening_answer", key }` **and** upsert the
  per-seeker answer into `job_seeker_screening_answers`.
- Free-text identity (name, address) → never learned as a global literal.

Global rules encode *which field maps to which key*; the *values* stay per-seeker.

### 6.4 New endpoint

`POST /api/apply/learn-fields` (batch; AM-access-to-seeker auth):

```jsonc
{
  "ats_type": "GREENHOUSE",
  "url_host": "job-boards.greenhouse.io",
  "job": { "title": "…", "company": "…", "url": "…", "job_post_id": "…" },
  "events": [
    { "field": { "label": "Do you require sponsorship?", "type": "radio",
                 "options": ["Yes","No"] },
      "outcome": "corrected",
      "mapping": { "kind": "screening_answer", "key": "requires_sponsorship" },
      "answer": "No" },
    { "field": { "label": "LinkedIn Profile", "type": "text" },
      "outcome": "filled_blank",
      "mapping": { "kind": "static", "value": "https://linkedin.com/in/…" } },
    { "field": { "label": "First Name", "type": "text" },
      "outcome": "accepted", "rule_id": "…" }
  ]
}
```

Handler:
1. `accepted` + `rule_id` → `recordFieldHit(rule_id)`.
2. `corrected` / `filled_blank` → `recordFieldClassification({ …, source:"user_confirmed",
   confidence:0.8 })`.
3. `mapping.kind === "screening_answer"` → upsert `job_seeker_screening_answers`.
4. Append raw events to `learned_field_events` (§6.5).
5. Optionally propose a host rule (`host-rule-proposals.ts`) from observed apply/submit
   buttons.

### 6.5 New audit table (migration)

`learned_field_events` — raw, pre-canonicalization log for replay/retrain:

```
id, created_at, job_seeker_id, ats_type, url_host,
field_signature, field_label, field_type, field_options jsonb,
outcome (accepted|corrected|filled_blank),
autofilled_value_hash, final_value_hash,   -- hashes only, never raw PII
mapping jsonb, source_mode ('live_autofill')
```

### 6.6 Feeds beyond field rules

- **Screening answers** — stop autonomous runs stalling on screening questions.
- **Host/plan hints** — which apply-entry/submit buttons the human's flow used improve
  `plan/generate` `button_hints` / `apply_entry_hints` (`index.js:255`).
- **Auto-apply preflight** — per-`(ats, host)` mode-3 fill-success raises the
  `auto-apply-preflight.ts` confidence gate for **unattended** auto-apply.

### 6.7 The flywheel

```
Mode 3 (human autofills a live page)
  → confirmed/corrected mappings + screening answers  (source: user_confirmed)
  → learned_field_rules & screening_answers enriched per (ATS, host)
  → Modes 1 & 2 fill more fields at high confidence, fewer NEEDS_ATTENTION
  → preflight confidence rises → more jobs cleared for unattended auto-apply
  → humans only touch genuinely novel forms → which feed Mode 3 again
```

---

## 7. Guardrails

- **PII**: never learn free-text identity *values* globally; audit log stores hashes only.
- **Conflicts**: contradicting corrections resolved by recency + majority; a lone outlier
  does not overwrite a well-hit rule without repetition.
- **Confidence decay**: stale rules lose confidence so ATS redesigns self-heal.
- **Scope**: identity mappings global per host; answer *values* per-seeker.
- **Reversibility**: `user_confirmed` is a distinct source tier → auditable/bulk-revertible.
- **Consent**: mode 3 acts only on explicit user click; fill-only by default; tailoring is
  previewed and accepted before upload.
- **Resume safety**: every tailored resume passes `resume-safety.ts` before it can be used.

---

## 8. Phasing

- **Phase 1 — Live autofill MVP**: `autofill-context` endpoint, `AUTOFILL_PAGE` entrypoint,
  `AUTOFILL_ACTIVE_TAB` handler, popup "Autofill this page". Standard fields + base resume
  upload, fill-only. Works on any page.
- **Phase 2 — Capture & track**: `capture-job` endpoint (lightweight promote →
  `job_post_id` + `saved_jobs`); mark-applied → `application_runs` (`source:
  "manual_autofill"`).
- **Phase 3 — Resume optimization/customization**: `tailor-live` endpoint reusing
  `tailorResumeStructured` / `optimizeBaseResumeStructured`; coverage + safety preview;
  tailored-over-base upload.
- **Phase 4 — Screening coverage**: `classifyAndFill` for screening questions; pull & upsert
  `job_seeker_screening_answers`.
- **Phase 5 — Learning emitter**: runner field-event diffing;
  `POST /api/apply/learn-fields`; `user_confirmed` source (migration);
  `learned_field_events` table (migration).
- **Phase 6 — Graduate**: wire mode-3 fill-success into `auto-apply-preflight` so hosts
  graduate to unattended auto-apply.

---

## 9. Reuse vs new code

**Reused:** `dom.js` (fill/upload/classify), all `adapters/*`, runner sidebar, captcha +
iframe handling, `chrome.scripting` injection, `field-resolver.ts`, `learned-fields.ts`,
`/api/apply/classify-fields`, `host-rule-proposals.ts`, `auto-apply-preflight.ts`,
`resume-tailor.ts` (+ `resume-safety.ts`, `resume-score.ts`, `renderResumePdf`),
`promote-jobs` dedup pattern, `spy-apply` mark-applied path.

**New:** endpoints `autofill-context`, `capture-job`, `tailor-live`, `learn-fields`; one
runner message (`AUTOFILL_PAGE`) + background handler (`AUTOFILL_ACTIVE_TAB`); popup
buttons; one enum value (`user_confirmed`, migration); one audit table
(`learned_field_events`, migration); runner-side field-event diffing.

---

## 10. Open questions

- Auto-submit toggle in mode 3 — when (if ever) do we let the human opt into full submit?
- Should `user_confirmed` promote faster than `llm` (e.g. 2 hits vs 3)?
- Admin review surface for `user_confirmed` rules before they go global, or trust
  confidence + decay?
- Per-seeker vs global screening answers when answers legitimately differ (e.g. relocation)
  — signature scoping.
- Should mode-3-captured `job_post`s be auto-scored and surfaced back as matches, or kept
  out of the match pool unless they clear a quality bar?
