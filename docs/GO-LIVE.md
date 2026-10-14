# JobGenius — Go-Live Activation Checklist

A lot of recent work is **built but inert** until migrations are applied, flags are
set, and one-shot jobs are run. Work top to bottom; each step is independent and
safe to do in any order unless noted.

## 1. Apply database migrations
Run all pending migrations in `apps/web/supabase/migrations/`. The most recent
ones that gate new features:

| Migration | Unlocks |
|---|---|
| `100_client_collaboration_agreement.sql` | Agreement push/sign + `job_seekers.collaboration_agreement_*` columns + `client_agreements` table |
| `101_offer_guaranteed_compensation.sql` | `job_offers.guaranteed_compensation` (correct 5% fee base) |

Until `100` is applied, the AM "Send agreement" button and `/portal/agreement`
signing return errors. Until `101`, the offer forms still post but the column is
absent.

## 2. Set environment variables / flags
On the **web app** (Vercel) unless noted:

| Var | Effect | Recommended |
|---|---|---|
| `STATE_ENCRYPTION_KEY` | Encrypts ATS session cookies at rest (must match the **runner's** value) | **Set on both** web + runner |
| `AUTO_TAILOR_ENABLED` | Background per-job resume tailoring | `true` |
| `AUTO_TAILOR_REQUIRED` | Block apply until a tailored resume exists | optional |
| `FIELD_CLASSIFIER_ENABLED` | LLM field classification in the cloud runner | `true` (needs an LLM key) |
| `RESUME_TAILOR_MODEL` | Stronger model for tailoring (e.g. `gpt-4o`) | optional |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Resume tailoring, field classifier | required for the above |
| `EXTENSION_MIN_VERSION` | Shows an "update" banner in older extensions | set to current (`0.4.1`) |
| `OPS_API_KEY` | Auth for all `/api/ops/*` (crons) | required |
| `FACT_GATE_ENFORCED` | Decision-engine enforcement | **leave off** until validated |

> Note: with `STATE_ENCRYPTION_KEY` unset, cookie storage stays plaintext (prior
> behaviour). Both web and runner read either format, so set it once on both.

## 3. Run one-shot ops jobs (dry-run first)
All use the `x-ops-key: $OPS_API_KEY` header.

```bash
# Retroactively clean matches the new hard-disqualifiers now flag:
curl -X POST -H "x-ops-key: $OPS_API_KEY" "$WEB_BASE_URL/api/ops/rescore-matches?dry_run=true"   # preview
curl -X POST -H "x-ops-key: $OPS_API_KEY" "$WEB_BASE_URL/api/ops/rescore-matches"                  # apply

# Preview the new 2-week Job Hub retention before the daily cron runs:
curl -X POST -H "x-ops-key: $OPS_API_KEY" "$WEB_BASE_URL/api/ops/retention/run?dry_run=true"
```

The daily crons (`.github/workflows/scheduled-jobs.yml`) already cover the weekly
match cleaner (04:00) and retention (03:00) — no action needed there.

## 4. Verify the apply engine live (human-in-the-loop)
Static checks are green, but the runner has never been driven against real ATS
pages. Walk **`apps/extension/VERIFY.md`**: load the unpacked extension, connect an
AM code, and test a Greenhouse-embed page (iframe), a Workday posting (shadow
DOM), and a LinkedIn Easy Apply — confirming fields fill, only one frame runs, and
applied jobs don't re-apply.

## 5. Confirm CI is green
`.github/workflows/ci.yml` runs `tsc --noEmit` + `vitest run` on PRs. Confirm it's
passing on the default branch before relying on it as a gate.

## Done-when
- [ ] Migrations applied (incl. 100, 101)
- [ ] Env vars set (esp. `STATE_ENCRYPTION_KEY` on web + runner, `OPS_API_KEY`)
- [ ] `rescore-matches` run (after dry-run)
- [ ] `VERIFY.md` walked on the three ATS types
- [ ] CI green on the default branch
