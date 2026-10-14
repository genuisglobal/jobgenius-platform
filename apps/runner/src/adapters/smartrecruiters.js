import {
  clickElementHandle,
  extractRequiredFields,
  fillKnownFields,
  findButtonByText,
  findClickableByText,
} from "./base.js";

const APPLY_BUTTONS = ["i'm interested", "apply now", "apply", "apply for this job"];

const SUBMIT_BUTTONS = [
  "next",
  "continue",
  "review",
  "submit application",
  "submit",
  "apply",
];

export const smartRecruitersAdapter = {
  name: "SMARTRECRUITERS",
  async detect(page) {
    const host = new URL(page.url()).hostname.toLowerCase();
    if (host.includes("smartrecruiters.com") || host.includes("jobs.smartrecruiters.com")) {
      return true;
    }
    // SmartRecruiters can be embedded
    return Boolean(
      await page.$("form[action*='smartrecruiters'], [class*='smartrecruiters'], [data-testid*='sr-']")
    );
  },
  async clickApplyEntry(page, ctx) {
    const entryHints =
      Array.isArray(ctx?.applyEntryHints) && ctx.applyEntryHints.length > 0
        ? ctx.applyEntryHints
        : APPLY_BUTTONS;

    // SmartRecruiters uses "I'm interested" as primary CTA
    const applyButton = await findClickableByText(page, entryHints);
    if (!applyButton) {
      const hasForm = Boolean(
        await page.$("form input[name], .application-form, [class*='application']")
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

    await page.waitForTimeout(1500);
    return { ok: true };
  },
  async fillKnownFields(page, ctx) {
    await fillKnownFields(page, ctx);

    // SmartRecruiters-specific: handle consent checkboxes
    const consentBoxes = await page.$$("input[type='checkbox'][name*='consent'], input[type='checkbox'][name*='agree'], input[type='checkbox'][name*='gdpr']");
    for (const box of consentBoxes) {
      const checked = await box.isChecked();
      if (!checked) {
        await box.check().catch(() => null);
      }
    }

    return { ok: true };
  },
  async extractRequiredFields(page) {
    return extractRequiredFields(page);
  },
  async submit(page, ctx) {
    const hints = Array.isArray(ctx?.buttonHints) ? ctx.buttonHints : [];
    const submitButton = await findButtonByText(page, [...hints, ...SUBMIT_BUTTONS]);
    if (!submitButton) return { ok: false, reason: "SUBMIT_BUTTON_MISSING" };
    if (ctx.dryRun) return { ok: false, reason: "DRY_RUN_CONFIRM_SUBMIT" };
    const clicked = await clickElementHandle(submitButton, 10000);
    if (!clicked) return { ok: false, reason: "SUBMIT_BUTTON_NOT_INTERACTABLE" };
    await page.waitForTimeout(1500);
    return { ok: true };
  },
  async confirm(page) {
    const text = (await page.textContent("body"))?.toLowerCase() ?? "";
    return (
      text.includes("thank you") ||
      text.includes("application submitted") ||
      text.includes("thanks for applying") ||
      text.includes("we have received your application") ||
      text.includes("application complete") ||
      text.includes("successfully submitted")
    );
  },
};
