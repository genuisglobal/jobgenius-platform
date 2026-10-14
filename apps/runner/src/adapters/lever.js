import {
  clickElementHandle,
  extractRequiredFields,
  fillKnownFields,
  findButtonByText,
  findClickableByText,
} from "./base.js";

const APPLY_BUTTONS = ["apply for this job", "apply now", "apply"];

const SUBMIT_BUTTONS = [
  "submit application",
  "submit",
  "apply",
  "next",
  "continue",
];

export const leverAdapter = {
  name: "LEVER",
  async detect(page) {
    const host = new URL(page.url()).hostname.toLowerCase();
    if (host.includes("lever.co") || host.includes("jobs.lever.co")) {
      return true;
    }
    // Lever embeds: check for form with lever action
    return Boolean(
      await page.$("form[action*='lever.co'], form[action*='lever.co/apply'], .lever-application-form")
    );
  },
  async clickApplyEntry(page, ctx) {
    const entryHints =
      Array.isArray(ctx?.applyEntryHints) && ctx.applyEntryHints.length > 0
        ? ctx.applyEntryHints
        : APPLY_BUTTONS;
    const applyButton = await findClickableByText(page, entryHints);
    if (!applyButton) {
      // Lever often shows the form directly on the page
      const hasForm = Boolean(
        await page.$("form input[name], form textarea, .application-form, .lever-application-form")
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

    // Lever-specific: handle "Additional information" textarea
    const additionalTextarea = await page.$(
      "textarea[name*='additional'], textarea[name*='comments'], textarea[name*='coverLetter']"
    );
    if (additionalTextarea) {
      const value = await additionalTextarea.inputValue();
      if (!value) {
        const jobTitle = ctx?.profile?.target_title ?? "this position";
        const name = ctx?.profile?.full_name ?? ctx?.profile?.name ?? "";
        await additionalTextarea.fill(
          `I am excited to apply for ${jobTitle}. My professional background aligns well with the requirements, and I look forward to contributing to your team.\n\nBest regards,\n${name}`
        );
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
      text.includes("application received") ||
      text.includes("application has been submitted")
    );
  },
};
