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

async function isLinkedInAuthGate(page) {
  const url = page.url().toLowerCase();
  if (
    url.includes("/login") ||
    url.includes("/checkpoint") ||
    url.includes("/uas/login")
  ) {
    return true;
  }

  return page
    .evaluate(() => {
      const text = document.body?.innerText?.toLowerCase() ?? "";
      return text.includes("sign in") && text.includes("linkedin");
    })
    .catch(() => false);
}

export const linkedinAdapter = {
  name: "LINKEDIN",
  async detect(page) {
    const host = new URL(page.url()).hostname.toLowerCase();
    if (!host.includes("linkedin.com")) {
      return false;
    }

    const hasEasyApplyButton = Boolean(
      (await page.$("button[aria-label*='Easy Apply']")) ||
        (await page.$("[data-easy-apply-button]"))
    );
    if (hasEasyApplyButton) {
      return true;
    }

    const url = page.url().toLowerCase();
    if (url.includes("/jobs/view/")) {
      return true;
    }

    const text = (await page.textContent("body"))?.toLowerCase() ?? "";
    return text.includes("easy apply");
  },
  async clickApplyEntry(page) {
    if (await isLinkedInAuthGate(page)) {
      return { ok: false, reason: "REAUTH_REQUIRED" };
    }

    const applyButton =
      (await page.$("button[aria-label*='Easy Apply']")) ||
      (await page.$("[data-easy-apply-button]")) ||
      (await findButtonByText(page, ["easy apply"]));
    if (!applyButton) {
      if (await isLinkedInAuthGate(page)) {
        return { ok: false, reason: "REAUTH_REQUIRED" };
      }
      return { ok: false, reason: "APPLY_BUTTON_MISSING" };
    }
    const clicked = await clickElementHandle(applyButton, 10000);
    if (!clicked) {
      return { ok: false, reason: "APPLY_BUTTON_NOT_INTERACTABLE" };
    }
    await page.waitForTimeout(1500);
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
    const nextButton = await findButtonByText(page, [
      ...hints,
      ...DEFAULT_SUBMIT_BUTTONS,
    ]);
    if (!nextButton) return { ok: false, reason: "SUBMIT_BUTTON_MISSING" };
    if (ctx.dryRun) return { ok: false, reason: "DRY_RUN_CONFIRM_SUBMIT" };
    const clicked = await clickElementHandle(nextButton, 10000);
    if (!clicked) return { ok: false, reason: "SUBMIT_BUTTON_NOT_INTERACTABLE" };
    await page.waitForTimeout(1500);
    return { ok: true };
  },
  async confirm(page) {
    const text = (await page.textContent("body"))?.toLowerCase() ?? "";
    return (
      text.includes("thank you") ||
      text.includes("submitted") ||
      text.includes("application submitted") ||
      text.includes("application sent") ||
      text.includes("your application was sent")
    );
  },
};
