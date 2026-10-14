import {
  clickElementHandle,
  extractRequiredFields,
  fillKnownFields,
  findButtonByText,
} from "./base.js";

const DEFAULT_SUBMIT_BUTTONS = [
  "next",
  "continue",
  "review",
  "submit application",
  "submit",
];

export const greenhouseAdapter = {
  name: "GREENHOUSE",
  async detect(page) {
    return Boolean(await page.$("form[action*='greenhouse']"));
  },
  async clickApplyEntry(page) {
    const applyButton = await findButtonByText(page, ["apply", "apply now"]);
    if (applyButton) {
      const clicked = await clickElementHandle(applyButton, 10000);
      if (!clicked) {
        return { ok: false, reason: "APPLY_BUTTON_NOT_INTERACTABLE" };
      }
      await page.waitForTimeout(1200);
    }
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
    const submitButton = await findButtonByText(page, [
      ...hints,
      ...DEFAULT_SUBMIT_BUTTONS,
    ]);
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
      text.includes("we have received your application")
    );
  },
};
