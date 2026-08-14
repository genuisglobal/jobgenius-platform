import {
  clickElementHandle,
  extractRequiredFields,
  fillKnownFields,
  fillComboboxByValue,
  findByAutomationId,
  findButtonByText,
  uploadResume,
} from "./base.js";
import { waitForDomStable } from "../dom-stability.js";
import { logLine } from "../logger.js";

// ============================================================
// Deep Workday adapter (ticket 7).
//
// Workday differs from every other ATS we automate in three ways:
//   1. It requires an ACCOUNT per (seeker, tenant) before applying —
//      handled via ctx.atsAccount (credentials created/stored by
//      /api/apply/ats-account; email = seeker email so Workday's
//      verification codes flow through the existing OTP pipeline).
//   2. Its application is a multi-page WIZARD (My Information → My
//      Experience → Application Questions → Voluntary Disclosures →
//      Self Identify → Review) — the engine's auto-advance loop drives
//      it; this adapter contributes reliable per-page fill + Next.
//   3. Its dropdowns are ARIA listbox buttons and its DOM is keyed by
//      stable data-automation-id attributes — we target those first
//      and fall back to text only when they're absent.
// ============================================================

const DEFAULT_SUBMIT_BUTTONS = [
  "next",
  "continue",
  "save and continue",
  "review",
  "submit",
];

const NEXT_BUTTON_AUTOMATION_IDS = [
  "bottom-navigation-next-button",
  "pageFooterNextButton",
];

function hostOf(page) {
  try {
    return new URL(page.url()).hostname.toLowerCase();
  } catch {
    return "";
  }
}

async function isVisibleByAutomationId(page, id) {
  return Boolean(await findByAutomationId(page, [id]));
}

async function readErrorBanner(page) {
  for (const id of ["errorBanner", "pageLevelErrorBanner", "errorMessage"]) {
    const banner = await findByAutomationId(page, [id]);
    if (banner) {
      const text = await banner.textContent().catch(() => "");
      if (text?.trim()) return text.replace(/\s+/g, " ").trim().slice(0, 300);
    }
  }
  return null;
}

async function fillAutomationInput(page, id, value) {
  if (!value) return false;
  const input = await findByAutomationId(page, [id]);
  if (!input) return false;
  const current = await input.inputValue().catch(() => "");
  if (current) return false; // never clobber an existing value
  await input.fill(String(value)).catch(() => {});
  return true;
}

// ─── Authentication (sign in / create account) ─────────────────────────────

async function attemptSignIn(page, account) {
  // Make sure the sign-in form (not create-account) is showing.
  if (await isVisibleByAutomationId(page, "verifyPassword")) {
    const signInLink = await findByAutomationId(page, ["signInLink"]);
    if (signInLink) {
      await clickElementHandle(signInLink, 5000);
      await waitForDomStable(page);
    }
  }

  const email = await findByAutomationId(page, ["email"]);
  const password = await findByAutomationId(page, ["password"]);
  if (!email || !password) return { attempted: false };

  await email.fill(account.email).catch(() => {});
  await password.fill(account.password).catch(() => {});

  const submit =
    (await findByAutomationId(page, ["signInSubmitButton"])) ??
    (await findButtonByText(page, ["sign in", "log in"]));
  if (!submit) return { attempted: false };

  await clickElementHandle(submit, 8000);
  await page.waitForTimeout(1500);
  await waitForDomStable(page);

  const error = await readErrorBanner(page);
  if (error) return { attempted: true, ok: false, error };
  // Still on the auth form → the click didn't take.
  if (await isVisibleByAutomationId(page, "password")) {
    return { attempted: true, ok: false, error: "Sign-in form still present." };
  }
  return { attempted: true, ok: true };
}

async function attemptCreateAccount(page, account) {
  // Switch to the create-account form if the verify-password field is absent.
  if (!(await isVisibleByAutomationId(page, "verifyPassword"))) {
    const createLink = await findByAutomationId(page, ["createAccountLink"]);
    if (createLink) {
      await clickElementHandle(createLink, 5000);
      await waitForDomStable(page);
    }
  }
  if (!(await isVisibleByAutomationId(page, "verifyPassword"))) {
    return { attempted: false };
  }

  const email = await findByAutomationId(page, ["email"]);
  const password = await findByAutomationId(page, ["password"]);
  const verify = await findByAutomationId(page, ["verifyPassword"]);
  if (!email || !password || !verify) return { attempted: false };

  await email.fill(account.email).catch(() => {});
  await password.fill(account.password).catch(() => {});
  await verify.fill(account.password).catch(() => {});

  const checkbox = await findByAutomationId(page, ["createAccountCheckbox"]);
  if (checkbox) {
    const checked = await checkbox.isChecked().catch(() => true);
    if (!checked) await checkbox.check().catch(() => {});
  }

  const submit =
    (await findByAutomationId(page, ["createAccountSubmitButton"])) ??
    (await findButtonByText(page, ["create account"]));
  if (!submit) return { attempted: false };

  await clickElementHandle(submit, 8000);
  await page.waitForTimeout(1500);
  await waitForDomStable(page);

  const error = await readErrorBanner(page);
  if (error) {
    const alreadyExists = /already (exists|in use|registered|have an account)/i.test(
      error
    );
    return { attempted: true, ok: false, error, alreadyExists };
  }
  if (await isVisibleByAutomationId(page, "verifyPassword")) {
    return { attempted: true, ok: false, error: "Create-account form still present." };
  }
  return { attempted: true, ok: true };
}

/**
 * If the tenant is showing its auth wall, sign in (or create the account)
 * with the seeker's stored per-tenant credentials. Order depends on whether
 * the credentials were just minted (create first) or reused (sign in first),
 * with one crossover attempt before giving up — then the account is marked
 * LOGIN_FAILED server-side and the run pauses REAUTH_REQUIRED for the AM.
 */
async function ensureSignedIn(page, ctx) {
  const authWall = await isVisibleByAutomationId(page, "password");
  if (!authWall) return { ok: true };

  const account = ctx.atsAccount;
  if (!account?.email || !account?.password) {
    return {
      ok: false,
      reason: "REAUTH_REQUIRED",
      message: "Workday requires an account and no ATS credentials are available.",
    };
  }

  const first = account.created ? attemptCreateAccount : attemptSignIn;
  const second = account.created ? attemptSignIn : attemptCreateAccount;

  const firstResult = await first(page, account);
  if (firstResult.ok) return { ok: true };

  const secondResult = await second(page, account);
  if (secondResult.ok) return { ok: true };

  logLine({
    level: "WARN",
    step: "WD_AUTH",
    msg: `Workday auth failed on ${hostOf(page)}: ${
      firstResult.error ?? secondResult.error ?? "unknown"
    }`,
  });
  // Stored password no longer works (e.g. the seeker changed it themselves) —
  // flag the row so the AM resets it instead of us retrying forever.
  try {
    await account.markFailed?.();
  } catch {
    /* best effort */
  }
  return {
    ok: false,
    reason: "REAUTH_REQUIRED",
    message: `Workday sign-in failed: ${
      firstResult.error ?? secondResult.error ?? "unknown"
    }`,
  };
}

// ─── Workday-specific field fills ──────────────────────────────────────────

// Stable automation-id → profile value for the "My Information" page.
function automationIdFills(profile) {
  const fullName = String(profile?.full_name ?? profile?.name ?? "").trim();
  const [firstName = "", ...rest] = fullName.split(/\s+/);
  const lastName = rest.join(" ");
  return [
    ["legalNameSection_firstName", firstName],
    ["legalNameSection_lastName", lastName],
    ["addressSection_addressLine1", profile?.address_line1],
    ["addressSection_city", profile?.address_city],
    ["addressSection_postalCode", profile?.address_zip],
    ["phone-number", profile?.phone],
  ];
}

// Listbox buttons we can answer deterministically from the profile.
// Everything else (questions, disclosures) goes through the engine's
// classify step, whose combobox fallback drives them.
async function fillDeterministicListboxes(page, ctx) {
  const profile = ctx?.profile ?? {};
  const targets = [
    {
      ids: ["addressSection_countryRegion", "countryDropdown", "country"],
      value: profile?.address_country,
    },
    { ids: ["addressSection_regionState", "state"], value: profile?.address_state },
    { ids: ["phone-device-type", "phoneType"], value: "Mobile" },
  ];

  for (const target of targets) {
    if (!target.value) continue;
    for (const id of target.ids) {
      const trigger = await page.$(
        `button[data-automation-id='${id}'], [data-automation-id='${id}'] button[aria-haspopup='listbox']`
      );
      if (!trigger) continue;
      const label = ((await trigger.textContent().catch(() => "")) ?? "").trim();
      // "Select One"-style placeholder = unset; anything else is already chosen.
      if (label && !/^(select one|select|choose)$/i.test(label)) break;
      await fillComboboxByValue(page, trigger, target.value);
      break;
    }
  }
}

// ─── Adapter ───────────────────────────────────────────────────────────────

export const workdayAdapter = {
  name: "WORKDAY",

  async detect(page) {
    const host = hostOf(page);
    return host.includes("workday") || host.includes("myworkdayjobs");
  },

  async clickApplyEntry(page, ctx) {
    // 1. The job page's Apply button.
    const apply =
      (await findByAutomationId(page, ["adventureButton"])) ??
      (await findButtonByText(page, ["apply", "apply now", "start application"]));
    if (apply) {
      const clicked = await clickElementHandle(apply, 10000);
      if (!clicked) return { ok: false, reason: "APPLY_BUTTON_NOT_INTERACTABLE" };
      await page.waitForTimeout(1200);
      await waitForDomStable(page);
    }

    // 2. "Start Your Application" chooser — Apply Manually is deterministic
    //    (Autofill-with-Resume adds a parse step whose output we can't trust).
    const manual =
      (await findByAutomationId(page, ["applyManually"])) ??
      (await findButtonByText(page, ["apply manually"]));
    if (manual) {
      await clickElementHandle(manual, 8000);
      await page.waitForTimeout(1200);
      await waitForDomStable(page);
    }

    // 3. Tenant auth wall (sign in / create account with stored credentials).
    const auth = await ensureSignedIn(page, ctx);
    if (!auth.ok) {
      return { ok: false, reason: auth.reason, message: auth.message };
    }

    return { ok: true };
  },

  async fillKnownFields(page, ctx) {
    // Automation-id fills first (stable across tenant themes), then the
    // generic hint-based pass for anything the ids missed.
    const profile = ctx?.profile ?? {};
    for (const [id, value] of automationIdFills(profile)) {
      await fillAutomationInput(page, id, value);
    }

    await fillKnownFields(page, ctx);
    await fillDeterministicListboxes(page, ctx);

    // Resume upload — Workday's uploader is a drop zone with a hidden input.
    if (ctx?.resumePath) {
      const dropInput = await page.$(
        "input[data-automation-id='file-upload-input-ref'], [data-automation-id='attachments'] input[type='file']"
      );
      if (dropInput) {
        const already = await dropInput
          .evaluate((el) => el.files && el.files.length > 0)
          .catch(() => false);
        if (!already) {
          await dropInput.setInputFiles(ctx.resumePath).catch(() => {});
          await page.waitForTimeout(1000);
        }
      } else {
        await uploadResume(page, ctx.resumePath).catch(() => {});
      }
    }

    return { ok: true };
  },

  async extractRequiredFields(page) {
    const fields = await extractRequiredFields(page);

    // Also report unset REQUIRED listbox buttons — the base extractor only
    // sees input/textarea/select, so without this the wizard would advance
    // with unanswered dropdowns and bounce back with an error banner.
    const listboxFields = await page.evaluate(() => {
      const out = [];
      const triggers = document.querySelectorAll("button[aria-haspopup='listbox']");
      for (const trigger of triggers) {
        const style = window.getComputedStyle(trigger);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const rect = trigger.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        const text = (trigger.textContent ?? "").trim();
        const unset = !text || /^(select one|select|choose)$/i.test(text);
        if (!unset) continue;

        const required =
          trigger.getAttribute("aria-required") === "true" ||
          Boolean(trigger.closest("[aria-required='true']")) ||
          // Workday marks required fields with an asterisk in the label.
          /\*/.test(
            trigger.closest("div[data-automation-id]")?.querySelector("label")
              ?.textContent ?? ""
          );
        if (!required) continue;

        const labelledBy = trigger.getAttribute("aria-labelledby");
        let label = "";
        if (labelledBy) {
          label = labelledBy
            .split(/\s+/)
            .map((ref) => document.getElementById(ref)?.textContent ?? "")
            .join(" ")
            .trim();
        }
        if (!label) {
          label =
            trigger.getAttribute("aria-label") ??
            trigger
              .closest("div[data-automation-id]")
              ?.querySelector("label")
              ?.textContent?.trim() ??
            "Unknown dropdown";
        }
        out.push({
          label: label.replace(/\s+/g, " ").replace(/\*/g, "").trim().slice(0, 160),
          type: "combobox",
          options: null,
          required: true,
        });
      }
      return out;
    });

    return [...fields, ...listboxFields];
  },

  async submit(page, ctx) {
    const hints = Array.isArray(ctx?.buttonHints) ? ctx.buttonHints : [];
    const nextButton =
      (await findByAutomationId(page, NEXT_BUTTON_AUTOMATION_IDS)) ??
      (await findButtonByText(page, [...hints, ...DEFAULT_SUBMIT_BUTTONS]));
    if (!nextButton) return { ok: false, reason: "SUBMIT_BUTTON_MISSING" };
    if (ctx.dryRun) return { ok: false, reason: "DRY_RUN_CONFIRM_SUBMIT" };

    // Per-wizard-page evidence BEFORE advancing (the page is about to change).
    await ctx.captureSnapshot?.(ctx.currentStep ?? "WD_STEP", "WD_STEP_SNAPSHOT");

    const clicked = await clickElementHandle(nextButton, 10000);
    if (!clicked) return { ok: false, reason: "SUBMIT_BUTTON_NOT_INTERACTABLE" };
    await page.waitForTimeout(1500);
    await waitForDomStable(page);

    // Workday validates on Next; a surviving error banner means fields our
    // extractor can't see are still unanswered — pause with the exact text
    // (the engine screenshots on pause) instead of grinding to NO_PROGRESS.
    const banner = await readErrorBanner(page);
    if (banner) {
      return {
        ok: false,
        reason: "REQUIRED_FIELDS",
        meta: { workday_error_banner: banner },
      };
    }

    return { ok: true, clickedLabel: "Next" };
  },

  async confirm(page) {
    // Tight confirmation: Workday's post-submit copy, required to appear
    // WITHOUT a wizard Next button still on screen (the old blind body-text
    // includes("submitted") check false-positived mid-wizard).
    const text = (await page.textContent("body"))?.toLowerCase() ?? "";
    const confirmed =
      text.includes("you've successfully applied") ||
      text.includes("you have successfully applied") ||
      text.includes("application was successfully submitted") ||
      text.includes("application has been submitted") ||
      text.includes("thank you for applying");
    if (!confirmed) return false;
    const nextStillVisible = await findByAutomationId(page, NEXT_BUTTON_AUTOMATION_IDS);
    return !nextStillVisible;
  },
};
