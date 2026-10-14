import {
  clickElementHandle,
  extractRequiredFields,
  fillKnownFields,
  findButtonByText,
  findClickableByText,
} from "./base.js";

// Thin, hint-driven Playwright adapters for hosted ATS boards that otherwise
// fall through to GENERIC. They add accurate host detection + the right
// adapter name (so learned rules / host rules / telemetry key correctly) and
// ATS-appropriate apply-entry / submit button text. Field filling is delegated
// to the shared base.js fillKnownFields + the engine's screening-aware classify
// step (classifyFields) — no fragile per-field selectors.

const CONFIRM_PHRASES = [
  "thank you",
  "application submitted",
  "successfully applied",
  "application received",
  "we have received",
  "thanks for applying",
  "application complete",
  "application has been submitted",
];

function makeHostedAdapter(config) {
  return {
    name: config.name,

    async detect(page) {
      const host = new URL(page.url()).hostname.toLowerCase();
      return config.hosts.some((h) => host.includes(h));
    },

    async clickApplyEntry(page, ctx) {
      const entryHints =
        Array.isArray(ctx?.applyEntryHints) && ctx.applyEntryHints.length > 0
          ? ctx.applyEntryHints
          : config.applyEntry;
      const applyButton = await findClickableByText(page, entryHints);
      if (!applyButton) {
        const hasForm = Boolean(
          await page.$(
            "form input, form textarea, form select, input[required], textarea[required], select[required]"
          )
        );
        if (hasForm) return { ok: true };
        return { ok: false, reason: "APPLY_BUTTON_MISSING" };
      }

      const existingPages = new Set(page.context().pages());
      const popupPromise = page
        .context()
        .waitForEvent("page", {
          timeout: 3000,
          predicate: (p) => !existingPages.has(p),
        })
        .catch(() => null);

      const clicked = await clickElementHandle(applyButton, 10000);
      if (!clicked) return { ok: false, reason: "APPLY_BUTTON_NOT_INTERACTABLE" };

      const popupPage = await popupPromise;
      if (popupPage) {
        await popupPage.waitForLoadState("domcontentloaded").catch(() => null);
        return { ok: true, nextPage: popupPage, handoff: "NEW_PAGE" };
      }

      await page.waitForTimeout(1200);
      return { ok: true };
    },

    async fillKnownFields(page, ctx) {
      await fillKnownFields(page, ctx);
      return { ok: true };
    },

    async extractRequiredFields(page) {
      return extractRequiredFields(page);
    },

    async submit(page, ctx) {
      const hints = Array.isArray(ctx?.buttonHints) ? ctx.buttonHints : [];
      const submitButton = await findButtonByText(page, [...hints, ...config.submit]);
      if (!submitButton) return { ok: false, reason: "SUBMIT_BUTTON_MISSING" };
      if (ctx.dryRun) return { ok: false, reason: "DRY_RUN_CONFIRM_SUBMIT" };
      const clicked = await clickElementHandle(submitButton, 10000);
      if (!clicked) return { ok: false, reason: "SUBMIT_BUTTON_NOT_INTERACTABLE" };
      await page.waitForTimeout(1500);
      return { ok: true };
    },

    async confirm(page) {
      const text = (await page.textContent("body"))?.toLowerCase() ?? "";
      return CONFIRM_PHRASES.some((phrase) => text.includes(phrase));
    },
  };
}

const HOSTED_ADAPTER_CONFIGS = [
  {
    name: "ASHBY",
    hosts: ["ashbyhq.com"],
    applyEntry: ["apply for this job", "apply now", "apply", "submit application"],
    submit: ["submit application", "submit", "next", "continue"],
  },
  {
    name: "WORKABLE",
    hosts: ["workable.com"],
    applyEntry: ["apply now", "apply for this job", "apply"],
    submit: ["submit", "send application", "next", "continue"],
  },
  {
    name: "BREEZY",
    hosts: ["breezy.hr"],
    applyEntry: ["apply for this job", "apply now", "apply"],
    submit: ["submit application", "submit", "next", "continue"],
  },
  {
    name: "ICIMS",
    hosts: ["icims.com"],
    applyEntry: ["apply", "apply for job", "apply now", "begin application"],
    submit: ["submit", "next", "continue", "save and continue", "submit application"],
  },
  {
    name: "JOBVITE",
    hosts: ["jobvite.com"],
    applyEntry: ["apply", "apply now", "apply to this job"],
    submit: ["submit", "send", "next", "continue"],
  },
  {
    name: "BAMBOOHR",
    hosts: ["bamboohr.com"],
    applyEntry: ["apply for this job", "apply now", "apply"],
    submit: ["submit application", "submit", "next", "continue"],
  },
];

export const hostedAtsAdapters = HOSTED_ADAPTER_CONFIGS.map(makeHostedAdapter);
