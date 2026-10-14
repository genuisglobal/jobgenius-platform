# Organizational Singularity — Foundation Spec

Two interlocking primitives mined from the DataGenius Academy "Career Service Consultant"
course. The **Fact Ledger** is the system's memory of what's *confirmed*; the **Decision
Engine** is the brain that applies the course's universal rule **Act → Ask → Escalate**.
The Engine's #1 rule queries the Ledger: *is every sensitive field this action needs
confirmed and fresh? If not → Ask or Escalate.*

> Status: **Spec 1 (Fact Ledger) Phase 1a is implemented in shadow mode.** Spec 2 (Decision
> Engine) is designed here and not yet built.

---

## Spec 1 — Confirmed-Fact Ledger + Sensitive-Information Gate

Encodes the course's non-negotiable rule (M1L3, M2L6, M2L17): **never guess** work
authorization, clearance, salary, sponsorship, C2C/1099, availability — confirm or escalate.

### Data model (migration `094_client_fact_ledger.sql`)
- `fact_definitions` — registry: `fact_key`, `label`, `category`, `sensitivity`
  (`standard|sensitive|legal`), `value_type`, `default_ttl_days` (freshness), `ai_inference_allowed`,
  `applies_to`. Seeded from the course's sensitive-info categories.
- `client_facts` — one **active** fact per `(job_seeker_id, fact_key)` with `provenance`
  (`client_confirmed|am_entered|ai_inferred|imported`), `confidence`, `source_ref`, `confirmed_at`,
  `confirmed_by`, `expires_at` (freshness), `status` (`active|stale|superseded|revoked`).
- Backfill: existing `job_seeker_screening_answers` imported as `provenance='imported'` (history
  preserved; sensitive ones require re-confirmation before automation may use them).

### Gate logic (`lib/consultant/fact-ledger.ts`, fail-closed)
`resolveFact(jobSeekerId, factKey)` → `confirmed | needs_confirmation | escalate`:
- `legal` category → always **escalate** (never auto-answered).
- `sensitive` → confirmed only if provenance ∈ {client_confirmed, am_entered} **and** fresh.
- `standard` → also accepts `imported`, and `ai_inferred` only when `ai_inference_allowed`.
- missing / stale / untrusted provenance → **needs_confirmation**.

Exports: `resolveFact`, `resolveFacts`, `getMissingRequiredFacts`, `upsertFact`,
`getActiveFacts`, `loadFactDefinitions`, `markStaleExpiredFacts`.

### Routes
- `GET /api/apply/resolved-answers?jobSeekerId=&fields=` — runner/AM. Returns `{ answers:[confirmed],
  blocked:[{fact_key, action:'ask'|'escalate', reason}] }`. Dual auth: `x-runner`=`OPS_API_KEY` or AM token.
- `GET/POST /api/am/seekers/[id]/facts` — AM views resolution status; confirms/updates facts
  (`provenance='am_entered'`).
- `POST /api/ops/facts/sweep-stale` — ops housekeeping (freshness is also enforced lazily at read time).

### UI
AM Seeker detail → **Facts** tab: facts grouped by category with Confirmed/Needs-confirmation/
Escalate badges, inline confirm/update.

### Rollout
- **1a (done):** ledger, registry, backfill, resolver endpoint, AM Facts tab — shadow mode
  (runner still uses the legacy screening-answers endpoint; nothing enforced yet).
- **2:** enforce — apply preflight gates on confirmed facts; route Ask/Escalate via the Decision Engine.

---

## Spec 2 — Decision Engine (Act / Ask / Escalate) — designed, not built

### Data model (migration `095_consultant_decisions.sql`)
`consultant_decisions`: `job_seeker_id`, `subject_type`
(`job|application|application_question|recruiter_message|inbound_email|offer`), `subject_ref`,
`verdict` (`act|ask|escalate|pause`), `confidence`, `reason_codes jsonb`, `recommended_action`,
`required_facts jsonb`, `risk_category` (`none|sensitive|financial|legal|scam|contractual`),
`decided_by` (`system|ai|am`), `status` (`open|resolved|auto_executed|dismissed`), resolution fields.
Idempotent: unique `(subject_type, subject_ref) where status='open'`.

### Core lib (`lib/consultant/decision-engine.ts`)
`decide(ctx)` (rules-first, LLM tiebreak), `recordDecision`, `routeDecision`, `resolveDecision`.
Precedence: offer/legal → escalate; scam → escalate; unconfirmed sensitive fact (Spec 1) → ask;
deal-breaker → pause; else act.

### Routing (existing surfaces)
act → execute + `seeker_activity_feed`; ask → client task via `notifications` + activity, queue→`NEEDS_INPUT`;
escalate → `ops_alerts` + AM `notifications`, queue→`PAUSED`; pause → AM review.

### Integration seams
`processOutreachReply` (inbox), `lib/auto-apply-preflight.ts` (apply), job-fit (new match),
offer events (`placement_outcomes`).

### Singularity metric
With both live: **% actions auto-acted vs ask vs escalate** per AM/seeker — the autonomy-rung
dashboard, the number we drive up over time.
