# Emi: lead-qualification voice agent (Retell)

Emi is Fidelis's virtual assistant. She calls new leads, qualifies them using
everything JobGenius already knows, and hands each lead a temperature, niche,
fit score and next step. This doc is the source of truth for the Retell agent
configuration; the field names below are read by `lib/voice/lead-qualification.ts`.

## How a lead reaches Emi

| Source | Trigger | When Emi calls |
|---|---|---|
| Signup (`/api/auth/signup`) | Phone + consent tick | Immediately (inside calling hours) |
| Marketing form (`/api/marketing/lead`) | Phone + consent tick | Immediately (inside calling hours) |
| Retry / callback / follow-up | Previous call's outcome | Scheduled by `lib/voice/lead-outcome.ts` |

Rules enforced in `lib/voice/dispatch.ts` before every call:

- `consent_voice` must be true (exact consent text stored in `metadata.call_consent`).
- `handled_by = 'founder'` → never called (Fidelis takes the lead himself).
- Number on the all-voice opt-out list → never called.
- 8am–9pm in the lead's timezone; unknown zone → 11am–9pm Eastern (safe for all continental US zones).
- Disqualified / converted leads are not called.

No answer / voicemail: retry after 2 hours, then the next day, then the lead
moves to the nurture email track (`next_action = nurture_email`).

## Retell setup

1. **Agent**: create one agent for lead qualification. Voice: warm, conversational
   female voice; speed slightly below default. Responsiveness: medium; interruption
   sensitivity: medium-low (let people finish; job loss is an emotional topic).
2. **Prompt**: paste the prompt below. Dynamic variables in `{{...}}` are filled per call.
3. **Post Call Extraction**: add every field in the table below, with exactly these
   names, types and options.
4. **Webhook**: agent webhook URL `https://job-genius.com/api/voice/webhook/retell`.
   Events: `call_started`, `call_ended`, `call_analyzed`.
5. **Link the agent**: Admin → Voice → Playbooks → *Lead Qualification* → set the
   Retell agent id. The playbook's goal text must not be empty.

### Environment (Vercel, production)

| Variable | Value |
|---|---|
| `RETELL_API_KEY` | Retell API key |
| `RETELL_WEBHOOK_SECRET` | The Retell key with the **webhook** badge (signs `x-retell-signature`) |
| `RETELL_DEFAULT_FROM_NUMBER` | Your Retell number, E.164 (`+1…`) |
| `RETELL_OUTBOUND_ENABLED` | `false` until test calls pass, then `true` |

## Dynamic variables (sent on every call)

| Variable | Example |
|---|---|
| `lead_first_name`, `lead_full_name` | Sarah |
| `how_they_came_to_us` | has been chatting with Fidelis on LinkedIn about their job search |
| `call_context` | `first_call` · `retry` · `callback` · `follow_up` |
| `call_context_note` | They asked to be called back at this time. Thank them… |
| `lead_background` | Fidelis's notes + resume highlights + form note |
| `known_answers` | Target role: GRC Analyst / Years of experience: 6 … |
| `questions_still_needed` | US work authorization; whether the setup fee works for them |
| `previous_calls` | Summaries of the last calls |
| `current_time_local`, `lead_timezone` | Wednesday, October 14, 2026 at 11:00 AM CDT · America/Chicago |
| `founder_name` | Fidelis |
| `essentials_price`, `premium_price`, `pricing_note` | $399 · $799 · Launch pricing through December 31, 2026… |
| `success_fee_terms` | 5% of first-year base plus guaranteed cash, only after… |

## Prompt

```
You are Emi, Fidelis's virtual assistant at JobGenius. JobGenius runs managed job
searches for experienced professionals: a dedicated account manager handles targeted
applications, recruiter outreach and interview prep. Fidelis is the founder.

## Who you are calling
- Name: {{lead_full_name}} (use "{{lead_first_name}}")
- How they came to us: they {{how_they_came_to_us}}
- Their local time now: {{current_time_local}} (timezone: {{lead_timezone}})
- Call type: {{call_context}}. {{call_context_note}}
- Background (from Fidelis and their resume; use it naturally, never read it out or
  say where it came from):
{{lead_background}}
- What we already know (confirm in one line, do not re-ask):
{{known_answers}}
- What you still need to learn: {{questions_still_needed}}
- Earlier calls:
{{previous_calls}}

## Opening
"Hi {{lead_first_name}}, this is Emi, Fidelis's virtual assistant at JobGenius. This call
is recorded so Fidelis can review it. You {{how_they_came_to_us}}. Is now still a good time?"
- If it is not a good time: ask when would be better, confirm the day, time AND their
  timezone, thank them, end the call.
- If it is the wrong person: apologise and end the call.

## Conversation (keep it short: about 6–10 minutes)
1. Relevance: in one or two sentences, connect JobGenius to what you know about them.
2. Ask permission: "May I ask a few quick questions to see whether we'd be a good fit?"
3. Ask ONLY what is still needed, one question at a time, and listen. Cover: target
   role, years of experience, current situation, how soon they want a new role, target
   salary, US work authorization, whether anyone else is involved in the decision.
4. Fit check: "On a scale of 1 to 10, how well does this sound like what you need?"
   Then: "What makes it that number?" and "What would make it a 10?"
5. Explain the offer only after you understand their situation:
   - Free account and a 7-day strategy preview first.
   - Then a one-time campaign setup fee: Essentials {{essentials_price}} or Premium
     {{premium_price}}. {{pricing_note}}
   - Plus a success fee: {{success_fee_terms}}
   - Ask whether the setup fee works for them. If money is the issue, find out whether
     it's no budget at all, timing, or a need to pay in two instalments.
6. Concerns: acknowledge, ask what is behind it, then ask "If we cleared that up, would
   anything else stop you?" Answer with facts only.
7. Next step, always one clear step:
   - Good fit and ready: tell them Fidelis will contact them within one business day to
     book a short strategy call, and confirm the best email and phone.
   - Interested but not ready: agree a specific day to follow up, or permission to email.
   - Not a fit: be honest and kind. Ask: "Do you know anyone in tech, cybersecurity, IT,
     project management or construction safety who is job searching?"

## Tone
Warm and friendly in the opening. Slower and calmer when they talk about job loss or
stress. Clear and steady on pricing. Pause after questions; do not fill silences.

## Hard rules
- Never claim to be human. If asked whether you are a real person, say: "I'm Fidelis's
  automated virtual assistant. I can have Fidelis follow up with you personally if you
  prefer." Then continue only if they are comfortable.
- Never promise a job, interview, salary, employer or timeline.
- Never quote any price or term other than the ones above. Never offer discounts.
- No legal, immigration or visa advice. If asked, say Fidelis can discuss it.
- If they ask not to be called again, confirm you will not call again and end the call.
- If they are distressed, be kind, do not sell, and offer to have Fidelis reach out.
- Do not mention LinkedIn, their resume or any note unless they brought it up or it is
  in "How they came to us".
```

## Post Call Extraction fields

Create these on the agent **with exactly these names**. Selector options are the
exact values listed.

| Name | Type | Options / description |
|---|---|---|
| `call_outcome` | Selector | `qualified_conversation` (had the qualification conversation), `callback_requested` (asked to talk another time), `not_interested`, `wrong_person`, `do_not_call` (asked not to be called again), `no_conversation` (no real conversation happened) |
| `callback_time_iso` | Text | If they asked for a callback: the agreed time as ISO 8601 with UTC offset, e.g. `2026-10-15T15:00:00-05:00`. Empty otherwise. |
| `lead_timezone` | Text | IANA timezone if stated or obvious, e.g. `America/Chicago`. Empty if unknown. |
| `target_role` | Text | The role they want. |
| `niche` | Selector | `cybersecurity_grc`, `it_infrastructure`, `database`, `project_management`, `construction_safety`, `other` |
| `years_experience` | Number | Years of relevant experience. |
| `employment_status` | Selector | `employed`, `unemployed`, `student`, `other`, `unknown` |
| `search_timeline` | Selector | `now`, `within_3_months`, `3_6_months`, `later`, `unknown` |
| `salary_target_usd` | Number | Target annual base salary in USD. |
| `work_authorization` | Selector | `us_citizen_or_pr`, `visa_sponsorship_needed`, `opt_or_temporary`, `not_authorized`, `unknown` |
| `decision_makers` | Text | Anyone else involved in the decision (e.g. spouse). |
| `budget_status` | Selector | `ok`, `needs_payment_plan`, `negotiating`, `no_budget`, `unknown` |
| `fit_rating_1_10` | Number | The 1–10 rating they gave. |
| `fit_rating_reason` | Text | Why they gave that rating. |
| `fit_missing` | Text | What would make it a 10. |
| `concerns` | Text | Objections or concerns raised, short list. |
| `realign_reason` | Text | Only if expectations don't match what we offer (e.g. wants a guaranteed job, unrealistic salary for their level). Empty otherwise. |
| `disqualify_reason` | Text | Short reason if clearly not a fit. |
| `founder_call_booked` | Boolean | True only if a call with Fidelis was actually booked. (Phase 1: always false; Fidelis books.) |
| `founder_call_time_iso` | Text | Booked time, ISO 8601 with offset. |
| `permission_to_follow_up` | Boolean | They agreed to be contacted again later. |
| `referral_name` | Text | Name of anyone they referred. |
| `referral_contact` | Text | Contact details for that referral. |

## How results are categorised (`lib/voice/lead-qualification.ts`)

Fit score 0–100 from six factors: work authorization (20), experience (20), niche (15),
salary (15), timeline (15), setup-fee comfort (15). Unknown answers score mid-range.

| Result | Rule | Next action |
|---|---|---|
| Hot | Score ≥ 75, searching now or within 3 months, fee ok or payment plan (or a founder call booked) | `founder_call` |
| Warm | Score ≥ 50 | Emi follow-up call in 3 days; a second warm result goes to `founder_review` |
| Realign | `realign_reason` given | `founder_review` |
| Nurture | Lower score, or not interested but happy to hear from us | `nurture_email` |
| Disqualified | Not authorized to work, not interested, wrong person, do-not-call | `closed` (do-not-call also opts the number out) |

## Roadmap

Emi is the single client- and prospect-facing assistant: one name and voice, a
separate Retell agent (and prompt) per call type via `voice_playbooks.retell_agent_id`.

| Phase | Scope | Status |
|---|---|---|
| 1. Qualify leads | Instant first call, caller brief, categorisation, retries/callbacks, opt-out, admin view | Built (PR #13) |
| 2. Cal.com | Emi books Fidelis's strategy call live (Retell Cal.com tools, `founder_call_booked`); "Intro call with Emi" booking link for LinkedIn leads → Cal.com webhook creates the lead with background and schedules Emi at the booked time; founder-booked calls get an emailed brief | Next |
| 3. Nurture + alerts | Email sequence for no-phone / unanswered / nurture leads (Resend, booking link); email to Fidelis for hot leads and new bookings | Planned |
| 4a. Interview & application capture | Platform becomes the record of interviews and manual applications (see below) | In progress |
| 4. Client interview calls | See below; needs 4a | Planned |

### Phase 4a: interview and application capture (prerequisite)

In production (Oct 2026) the `interviews` table had 0 rows ever and manual
applications were not recorded anywhere: interview details, bookings and
availability lived only in AM↔client WhatsApp groups. Emi can only act on what
the platform knows, so AMs own the facts and Emi acts only on confirmed facts.

1. **Fast interview logging** for AMs (phone-friendly, about a minute): company, role,
   date/time with timezone, format, link, interviewer, round, note for Emi.
   An interview counts toward AM metrics and incentives only once it is logged.
2. **Manual application logging** (company, role, link) plus fixing analytics that
   queried a non-existent `applications` table.
3. **Email-detected interview drafts**: invites arriving in the designated job-search
   inbox become drafts the AM confirms in one click (inbox scanner + scheduling-link
   detector exist; verify they run in production).
4. **Emi captures on check-in calls**: upcoming interviews and availability become
   drafts for AM confirmation; Emi never acts on an unconfirmed draft.

WhatsApp stays the conversation channel. Group chats are not read automatically
(unofficial tools break WhatsApp's terms). Possible later: a JobGenius WhatsApp
Business number where AMs forward an invite and AI drafts the interview.

### Phase 4: Emi for clients' interviews

Builds on what exists: an `interview_warmup` call is already queued 24h before an
interview once the prep pack is ready (`app/api/background/run/route.ts`), and the
signup consent covers calls about the job search.

- **Interview brief**: company, role, interview time and format, interviewer if known,
  prep-pack highlights, and the client's weak spots from earlier practice scores.
- **Reminder + warm-up call** (5–10 min): confirm time, link and logistics; two or three
  role-specific practice questions with quick feedback; push to the full portal mock
  interview for deep prep (OpenAI Realtime, scored). Deep prep stays in the portal.
- **Outcome capture** (post-call fields): `confirmed_attending`, `logistics_issue`,
  `readiness_1_10`, `needs_am_help` → AM alert when attendance or readiness is at risk.
- **Debrief call** a few hours after the interview: how it went, next round expected,
  thank-you note sent → feeds the client's timeline and the AM.
- **No-show / reschedule follow-up** when the interview status changes.
- Only for interviews an AM has confirmed; per-interview "Emi prep call" on/off switch;
  brief includes the AM's note for Emi; Emi preps, she does not re-confirm logistics.
- Same rules as lead calls: calling window, opt-out, never promise outcomes.
- Before relying on it: run one real portal mock interview end to end (the realtime
  scoring path has never run against real data).

### Not Emi: account manager performance

Emi does not call AMs. Performance feedback is delivered by a person: AI drafts each
AM's coaching notes from the productivity data (what improved, what slipped, two or
three concrete actions) and Fidelis runs the conversation. Routine operational nudges
("3 seekers had no applications this week", missed clock-in) go by WhatsApp or the
dashboard, not voice, under a different name if a persona is wanted.

## Go-live checklist

1. Apply migration `125_emi_lead_qualification.sql` in production **before** deploying
   the code (the dispatcher and signup read the new columns).
2. Set the environment variables above with `RETELL_OUTBOUND_ENABLED=false`; deploy.
3. Create the agent, extraction fields and webhook as above; link the agent id.
4. Set `RETELL_OUTBOUND_ENABLED=true`, sign up with your own phone, and run the test
   personas: ready buyer, price objection, "is this a scam?", "call me tomorrow at 3",
   "stop calling me", "are you a real person?", anxious and recently laid off.
5. Check each test lead in Admin → Leads: temperature, score, next action, answers.
6. Review the first 20 real recordings before scaling outreach.
7. Have counsel review the consent text in `lib/voice/consent.ts`.
