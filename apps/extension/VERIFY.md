# Extension — live verification checklist

The automated tests (`apps/web/tests/extension-dom-shadow.test.ts` and
`apps/web/tests/extension-reliability.test.ts`, run with `npm test` — i.e.
`vitest run` — or `npx vitest run tests/extension-*.test.ts` from `apps/web`)
cover the shadow-DOM piercing and the reliability logic (field resolution,
resume MIME, confined confirmation detection, flow fingerprinting) in `dom.js`.
The items below need a **real browser with the extension loaded and real ATS
logins** — they can't be checked headlessly.

## Setup
1. `chrome://extensions` → enable Developer mode → **Load unpacked** → select `apps/extension`.
2. Open the popup → connect with an **AM code** → pick a **seeker** who has
   screening answers configured (incl. `sponsorship`).
3. Keep the **background service worker console** open (Inspect views: service
   worker) to watch run logs, and DevTools on the page frame.

## 1. Embedded ATS iframe (all-frames + election) — Greenhouse/Lever embed
- Open a company **careers page that embeds Greenhouse/Lever** (form lives in an `iframe`).
- Trigger apply. **Expected:** the form **inside the iframe** gets filled; the
  runner sidebar appears in that iframe; the top frame does **not** also run
  (no duplicate fills). In the SW console you should see one run, not several.

## 2. Shadow-DOM ATS — Workday
- Open a **Workday** posting (`*.myworkdayjobs.com`).
- Trigger apply. **Expected:** fields rendered in web components are detected and
  filled (this is the shadow-DOM path the jsdom test covers mechanically).

## 3. Top-frame app — LinkedIn Easy Apply
- Open a LinkedIn job with **Easy Apply** (no embedded ATS iframe).
- Trigger apply. **Expected:** the **top frame** runs (election lets it, since no
  ATS iframe is present); Easy Apply modal fields fill.

## 4. Duplicate-apply guard
- Apply to a job and let it reach **Applied**.
- Try to apply to the **same job** again (from Matches/Apply).
- **Expected:** popup shows *"This job is already marked applied."* and **no second
  submission** happens.

## 5. Screening correctness
- For a seeker whose `sponsorship` screening answer is e.g. *"Yes, I need sponsorship"*,
  apply to a job that asks about sponsorship.
- **Expected:** the form is answered with the **seeker's** answer, not a blanket "No".
  (EEO questions with no seeker answer → "Prefer not to answer"; work-auth → "Yes".)

## 6. Branding
- Popup header shows the **violet orbit + orange sparkle** mark and the two-tone
  **Job**(violet)/**Genius**(orange) wordmark; controls are violet, not indigo/blue.
- Autofill modal header is a **violet→orange** gradient.
- (Optional) run `npm install canvas && node generate-icons.js` in `apps/extension`,
  add the printed snippet to `manifest.json`, reload → toolbar icon appears.

## 7. Apply Health dashboard (AM-facing)
- In the AM dashboard: **Pipeline → Apply Health** (`/dashboard/apply-health`).
- **Expected:** stat cards (runs / applied / success rate / need you / failed /
  running), a **Needs you** table with humanized blockers, and **By ATS** + **By
  seeker** breakdowns scoped to *your* assigned seekers.

## 8. Proof / pause screenshots (v0.4.16+)
- Run an apply to completion with the application tab **focused**.
- **Expected:** sidebar logs "Captured page screenshot for the run timeline";
  the AM seeker detail → screenshots section shows the confirmation page with
  reason `SUBMIT_PROOF`; pauses (CAPTCHA/required fields) attach a screenshot
  with the pause reason.
- With the tab in the background, capture is skipped (sidebar: "Screenshot
  skipped (TAB_NOT_ACTIVE)") — it must never photograph a different tab.

## 9. ARIA combobox / typeahead fills (v0.4.17+)
- Run an autofill on a form with a react-select/Workday-style dropdown
  (e.g. Greenhouse "Country" typeahead, Ashby select, Workday listbox button).
- **Expected:** the widget visibly opens, the value is typed, and the matching
  option is clicked — the selection survives form validation/submit (the old
  blind `.value` set looked filled but never committed).
- With a value that matches no option, the field is left EMPTY (popup closed
  via Escape) and surfaces as a required field for the AM — the driver must
  never click a wrong option.

## 10. Session health & SESSION_EXPIRED (v0.4.18+)
- Log out of LinkedIn, then launch a run on a LinkedIn job.
- **Expected:** the run pauses immediately with reason `SESSION_EXPIRED`
  (not NO_PROGRESS/UNKNOWN_ATS), the toolbar badge shows "!", and the popup
  banner names the board. After logging back in, auto-resume picks the run
  back up.
- Indeed session checks (PPID cookie) only warn when the seeker has actually
  used Indeed before — no nagging about boards the seeker doesn't use.
- A Workday "Create Account" step must NOT trigger SESSION_EXPIRED (account
  creation is part of the normal flow).

## 11. Indeed adapter (v0.4.19+)
- Launch a run on an indeed.com job with **Indeed Apply** (native).
- **Expected:** the extension clicks "Apply now", the tab navigates to
  smartapply.indeed.com, and the runner AUTOMATICALLY resumes there
  (same-tab rearm) — fills the contact step, advances with Continue, and
  pauses at DRY_RUN_CONFIRM_SUBMIT (dry run) or submits.
- On an "Apply on company site" job, the employer's ATS opens in a new tab
  and the run hands off to that tab (sidebar: "Transferred").
- "Apply on company site" must never be clicked as if it were the native
  button (it starts with "apply" — the adapter reroutes it).

## 12. Embedded application iframes (v0.4.20+)
- Run an autofill on a company career page that EMBEDS its application form
  in an iframe (Greenhouse `embed/job_app`, Lever embed, etc.).
- **Same-origin embed:** fields inside the iframe are detected, labeled, and
  filled directly (no navigation) — the run proceeds as if the form were on
  the page.
- **Cross-origin embed on a known ATS host:** unchanged — the iframe's own
  runner instance self-elects and drives (sidebar appears inside the frame).
- **Cross-origin embed on an unknown host with an apply-ish path:** the tab
  navigates to the iframe's URL and the runner re-arms there automatically.
- Widget-sized iframes (chat bubbles, badges) must never trigger navigation —
  a page with only those pauses APPLY_BUTTON_MISSING as before.

## What to watch for (regressions)
- More than one frame running on a single apply (election bug).
- Fields left blank on a Workday/web-component form (shadow-DOM regression).
- A second submission on an already-applied job (dup-apply regression).
- Instant, robotic fill with no scroll (pacing not applied).
- A run that fails/hangs because screenshot upload failed (proof capture must
  stay strictly best-effort).
