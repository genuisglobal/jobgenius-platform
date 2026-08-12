export async function extractRequiredFields(page) {
  return page.evaluate(() => {
    // Pierce open shadow roots so web-component fields (Workday etc.) are seen.
    const queryAllDeep = (selector, root = document) => {
      const out = [];
      const seen = new Set();
      const visit = (node) => {
        if (!node || seen.has(node) || typeof node.querySelectorAll !== "function") return;
        seen.add(node);
        node.querySelectorAll(selector).forEach((el) => out.push(el));
        node.querySelectorAll("*").forEach((el) => {
          if (el.shadowRoot) visit(el.shadowRoot);
        });
      };
      visit(root);
      return out;
    };

    const getLabelText = (input) => {
      const id = input.getAttribute("id");
      if (id) {
        const label = document.querySelector(`label[for='${id}']`);
        if (label?.textContent) return label.textContent.trim();
      }
      const parentLabel = input.closest("label");
      if (parentLabel?.textContent) return parentLabel.textContent.trim();
      const ariaLabel = input.getAttribute("aria-label");
      if (ariaLabel) return ariaLabel.trim();
      const placeholder = input.getAttribute("placeholder");
      if (placeholder) return placeholder.trim();
      const name = input.getAttribute("name");
      return name ? name.trim() : "Unknown field";
    };

    const isVisible = (input) => {
      if (!(input instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(input);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      ) {
        return false;
      }
      const rect = input.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const isRequiredField = (input) =>
      input.matches?.("[required], [aria-required='true']");

    const getFieldType = (input) => {
      const tagName = input.tagName.toLowerCase();
      if (tagName === "textarea" || tagName === "select") {
        return tagName;
      }
      return (input.getAttribute("type") || "text").toLowerCase();
    };

    const hasEmptyValue = (input, type) => {
      if (type === "checkbox") {
        return !input.checked;
      }
      if (type === "file") {
        return !input.files || input.files.length === 0;
      }
      if (type === "radio") {
        return !input.checked;
      }
      return !String(input.value ?? "").trim();
    };

    const requiredFields = [];
    const radioGroups = new Map();
    const inputs = queryAllDeep("input, textarea, select");

    for (const input of inputs) {
      if (
        !(
          input instanceof HTMLInputElement ||
          input instanceof HTMLTextAreaElement ||
          input instanceof HTMLSelectElement
        )
      ) {
        continue;
      }

      if (input.disabled || !isRequiredField(input)) {
        continue;
      }

      const type = getFieldType(input);
      if (type === "radio") {
        const groupKey =
          input.getAttribute("name") ||
          input.getAttribute("id") ||
          getLabelText(input);
        if (!radioGroups.has(groupKey)) {
          radioGroups.set(groupKey, []);
        }
        radioGroups.get(groupKey).push(input);
        continue;
      }

      if (type !== "file" && !isVisible(input)) {
        continue;
      }

      if (!hasEmptyValue(input, type)) {
        continue;
      }

      let options = null;
      if (input instanceof HTMLSelectElement) {
        options = Array.from(input.options)
          .map((option) => option.textContent?.trim())
          .filter(Boolean);
      }

      requiredFields.push({
        label: getLabelText(input),
        type,
        options,
        required: true,
      });
    }

    for (const group of radioGroups.values()) {
      if (!Array.isArray(group) || group.length === 0 || group.some((input) => input.checked)) {
        continue;
      }

      const visibleGroup = group.filter((input) => isVisible(input));
      const firstInput = visibleGroup[0] || group[0];
      requiredFields.push({
        label: getLabelText(firstInput),
        type: "radio",
        options: group
          .map((input) => {
            const id = input.getAttribute("id");
            if (id) {
              const label = document.querySelector(`label[for='${id}']`);
              if (label?.textContent?.trim()) return label.textContent.trim();
            }
            return (
              input.getAttribute("aria-label") ||
              input.getAttribute("value") ||
              getLabelText(input)
            );
          })
          .filter(Boolean),
        required: true,
      });
    }

    return requiredFields;
  });
}

function normalizeHint(value) {
  return (value ?? "").toString().trim().toLowerCase();
}

function pickFirst(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

function splitFullName(fullName) {
  if (!fullName) return { firstName: "", lastName: "" };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function splitLocation(location) {
  if (!location) return { city: "", state: "" };
  const match = location.match(/^([^,]+),\s*([A-Za-z]{2})$/);
  if (match) {
    return { city: match[1].trim(), state: match[2].trim() };
  }
  return { city: location.trim(), state: "" };
}

async function getInputHint(input) {
  const label = await input.evaluate((el) => {
    const id = el.getAttribute("id");
    if (id) {
      const labelEl = document.querySelector(`label[for='${id}']`);
      if (labelEl?.textContent) return labelEl.textContent.trim();
    }
    const parentLabel = el.closest("label");
    if (parentLabel?.textContent) return parentLabel.textContent.trim();
    return "";
  });
  const ariaLabel = await input.getAttribute("aria-label");
  const placeholder = await input.getAttribute("placeholder");
  const name = await input.getAttribute("name");
  const id = await input.getAttribute("id");
  return normalizeHint([label, ariaLabel, placeholder, name, id].filter(Boolean).join(" "));
}

async function getGroupHint(input) {
  return input.evaluate((el) => {
    const normalize = (value) => (value ?? "").toString().trim().toLowerCase();

    const fieldset = el.closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend?.textContent) return normalize(legend.textContent);
    }

    const group = el.closest("[role='group'], [role='radiogroup']");
    if (group) {
      const labelId = group.getAttribute("aria-labelledby");
      if (labelId) {
        const labelEl = document.getElementById(labelId);
        if (labelEl?.textContent) return normalize(labelEl.textContent);
      }
      const ariaLabel = group.getAttribute("aria-label");
      if (ariaLabel) return normalize(ariaLabel);
    }

    const id = el.getAttribute("id");
    if (id) {
      const label = document.querySelector(`label[for='${id}']`);
      if (label?.textContent) return normalize(label.textContent);
    }

    const parentLabel = el.closest("label");
    if (parentLabel?.textContent) return normalize(parentLabel.textContent);

    return normalize(el.getAttribute("name"));
  });
}

function resolveFieldValue(hint, type, profile, defaultEmail) {
  const fullName = pickFirst(profile?.full_name, profile?.name);
  const { firstName, lastName } = splitFullName(fullName);
  const email = pickFirst(profile?.email, defaultEmail);
  const phone = pickFirst(profile?.phone);
  const location = pickFirst(profile?.location);
  const { city, state } = splitLocation(location);

  const addressLine1 = pickFirst(profile?.address_line1);
  const addressCity = pickFirst(profile?.address_city, city);
  const addressState = pickFirst(profile?.address_state, state);
  const addressZip = pickFirst(profile?.address_zip);
  const addressCountry = pickFirst(profile?.address_country);
  const isCompanyField = hint.includes("company") || hint.includes("employer");

  if (hint.includes("first name")) return firstName;
  if (hint.includes("last name")) return lastName;
  if (hint.includes("full name")) return fullName;
  if (hint.includes("name") && !isCompanyField) return fullName;
  if (hint.includes("email")) return email;
  if (hint.includes("phone") || hint.includes("mobile")) return phone;
  if (hint.includes("linkedin")) return pickFirst(profile?.linkedin_url);
  if (hint.includes("portfolio") || hint.includes("website") || hint.includes("github")) {
    return pickFirst(profile?.portfolio_url);
  }
  if (hint.includes("address") || hint.includes("street")) return addressLine1;
  if (hint.includes("city")) return addressCity;
  if (hint.includes("state")) return addressState;
  if (hint.includes("zip") || hint.includes("postal")) return addressZip;
  if (hint.includes("country")) return addressCountry;

  // Additional common screening fields
  if (hint.includes("salary") || hint.includes("compensation") || hint.includes("desired pay")) {
    return "Negotiable";
  }
  if ((hint.includes("years") && hint.includes("experience")) || hint.includes("years of experience")) {
    if (Array.isArray(profile?.work_history) && profile.work_history.length > 0) {
      return String(Math.min(profile.work_history.length * 2, 15));
    }
    return "3";
  }
  if (hint.includes("current") && (hint.includes("company") || hint.includes("employer"))) {
    const latest = Array.isArray(profile?.work_history) ? profile.work_history[0] : null;
    return pickFirst(latest?.company, latest?.organization, latest?.employer) || "";
  }
  if (hint.includes("current") && hint.includes("title")) {
    const latest = Array.isArray(profile?.work_history) ? profile.work_history[0] : null;
    return pickFirst(latest?.title, latest?.role) || "";
  }
  if (hint.includes("how did you hear") || hint.includes("where did you find") || hint.includes("referral source")) {
    return "Job board";
  }
  if (hint.includes("start date") || hint.includes("when can you start") || hint.includes("available to start")) {
    return "Immediately";
  }
  if (hint.includes("notice period")) {
    return "2 weeks";
  }

  if (type === "email") return email;
  if (type === "tel") return phone;
  return type === "email" ? email : "";
}

// Jittered pause + scroll-into-view make the runner less bot-like and more
// reliable on lazy-rendered forms (mirrors the extension's pacing).
function humanPause(page) {
  return page.waitForTimeout(120 + Math.floor(Math.random() * 280));
}

async function fillField(input, value, page) {
  await input.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
  await input.fill(value);
  await humanPause(page);
}

export async function fillKnownFields(page, ctx) {
  const profile = ctx?.profile ?? {};
  const defaultEmail = ctx?.defaultEmail ?? "";
  const job = ctx?.job ?? {};
  const inputs = await page.$$(
    "input[type='text'], input[type='email'], input[type='tel'], input:not([type]), textarea"
  );
  for (const input of inputs) {
    const isDisabled = await input.getAttribute("disabled");
    if (isDisabled !== null) continue;
    const value = await input.inputValue();
    if (value) continue;
    const tagName = await input.evaluate((el) => el.tagName.toLowerCase());
    const type = (await input.getAttribute("type")) ?? "text";
    const hint = await getInputHint(input);

    // Handle textarea cover letter / motivation fields
    if (tagName === "textarea") {
      const coverLetterValue = resolveCoverLetterValue(hint, profile, job);
      if (coverLetterValue) {
        await fillField(input, coverLetterValue, page);
        continue;
      }
    }

    const fillValue = resolveFieldValue(hint, type, profile, defaultEmail);
    if (!fillValue) continue;
    await fillField(input, fillValue, page);
  }

  // Handle select fields (work authorization, sponsorship, etc.)
  await fillSelectFields(page, profile);

  // Handle radio groups
  await fillRadioGroups(page, profile);

  // Handle consent checkboxes
  await fillConsentCheckboxes(page);
}

function resolveCoverLetterValue(hint, profile, job) {
  const fullName = pickFirst(profile?.full_name, profile?.name);
  const jobTitle = pickFirst(job?.title, "this position");
  const company = pickFirst(job?.company, "your company");

  let background = "my professional experience";
  if (Array.isArray(profile?.work_history) && profile.work_history.length > 0) {
    const latest = profile.work_history[0];
    background = pickFirst(latest?.title, latest?.role, background);
  }

  if (hint.includes("cover letter") || hint.includes("letter of interest") || hint.includes("introduction")) {
    return `Dear Hiring Team,\n\nI am excited to apply for the ${jobTitle} role at ${company}. My background in ${background} makes me a strong fit for this position. I look forward to contributing to your team.\n\nBest regards,\n${fullName}`;
  }
  if (hint.includes("why") || hint.includes("motivation") || hint.includes("interest") || hint.includes("reason for applying")) {
    return `I am excited about the ${jobTitle} opportunity at ${company} because it aligns perfectly with my background and career goals.`;
  }
  if (hint.includes("additional") || hint.includes("anything else") || hint.includes("comments")) {
    return "No additional information at this time.";
  }
  return null;
}

async function fillSelectFields(page, profile) {
  const selects = await page.$$("select");
  for (const select of selects) {
    const isDisabled = await select.getAttribute("disabled");
    if (isDisabled !== null) continue;
    const currentValue = await select.inputValue().catch(() => "");
    // Check if default/empty
    const firstOptValue = await select.evaluate((el) => el.options[0]?.value ?? "");
    if (currentValue && currentValue !== firstOptValue) continue;

    const hint = await getInputHint(select);
    if (!hint) continue;

    let candidates = null;
    // Sensitive / preference-bearing fields (work authorization, sponsorship,
    // EEO/demographics) are deferred to the screening-aware classify step,
    // which honors the seeker's configured screening answers before any default.
    if (hint.includes("country")) {
      const country = pickFirst(profile?.address_country);
      candidates = country ? [country.toLowerCase(), "united states", "usa"] : ["united states", "usa"];
    }

    if (!candidates) continue;

    // Try to match option text
    const matched = await select.evaluate(
      (el, candidates) => {
        const options = Array.from(el.options);
        for (const candidate of candidates) {
          const match = options.find((o) => (o.textContent ?? "").toLowerCase().includes(candidate));
          if (match) {
            el.value = match.value;
            el.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
          }
        }
        return false;
      },
      candidates
    );

    if (!matched) continue;
  }
}

async function fillRadioGroups(page, profile) {
  const radios = await page.$$("input[type='radio']");
  const groups = new Map();
  for (const radio of radios) {
    const name = await radio.getAttribute("name");
    if (!name) continue;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(radio);
  }

  for (const [, group] of groups) {
    const anyChecked = await Promise.all(group.map((r) => r.isChecked()));
    if (anyChecked.some(Boolean)) continue;

    const firstRadio = group[0];
    const hint = await getGroupHint(firstRadio);
    if (!hint) continue;

    // Work authorization, sponsorship, relocation, and EEO radio groups are
    // deferred to the screening-aware classify step rather than answered with
    // blind defaults that could override the seeker's configured answers.
    const targetLabel = null;

    if (!targetLabel) continue;

    for (const radio of group) {
      const radioLabel = await radio.evaluate((el) => {
        const id = el.getAttribute("id");
        const linkedLabel =
          id ? document.querySelector(`label[for='${id}']`)?.textContent ?? "" : "";
        const wrappedLabel = el.closest("label")?.textContent ?? "";
        const label =
          linkedLabel ||
          wrappedLabel ||
          el.getAttribute("aria-label") ||
          el.getAttribute("value") ||
          "";
        return label.toLowerCase().trim();
      });
      if (radioLabel.includes(targetLabel) || targetLabel.includes(radioLabel)) {
        await radio.click().catch(() => null);
        break;
      }
    }
  }
}

async function fillConsentCheckboxes(page) {
  const checkboxes = await page.$$("input[type='checkbox']");
  const autoCheckKeywords = ["agree", "accept", "certify", "confirm", "acknowledge", "terms", "conditions", "authorize"];
  for (const checkbox of checkboxes) {
    const checked = await checkbox.isChecked();
    if (checked) continue;
    const isDisabled = await checkbox.getAttribute("disabled");
    if (isDisabled !== null) continue;
    const hint = await getInputHint(checkbox);
    if (autoCheckKeywords.some((kw) => hint.includes(kw))) {
      await checkbox.check().catch(() => null);
    }
  }
}

export async function uploadResume(page, resumePath) {
  if (!resumePath) return { ok: false, reason: "NO_INPUT_OR_URL" };

  const fileInputs = await page.$$("input[type='file']");
  const enabledInputs = [];
  for (const input of fileInputs) {
    const disabled = await input.getAttribute("disabled");
    if (disabled === null) {
      enabledInputs.push(input);
    }
  }

  const input =
    (await (async () => {
      for (const candidate of enabledInputs) {
        const hint = await getInputHint(candidate);
        if (
          hint.includes("resume") ||
          hint.includes("cv") ||
          hint.includes("curriculum vitae")
        ) {
          return candidate;
        }
      }
      return enabledInputs[0] ?? null;
    })()) ?? null;

  if (!input) return { ok: false, reason: "NO_INPUT_OR_URL" };

  await input.setInputFiles(resumePath);
  return { ok: true };
}

export async function hasCaptcha(page) {
  const text = (await page.textContent("body"))?.toLowerCase() ?? "";
  if (text.includes("captcha")) return true;
  return Boolean(await page.$("iframe[src*='captcha']"));
}

export async function hasSmsOtp(page) {
  const text = (await page.textContent("body"))?.toLowerCase() ?? "";
  if (text.includes("sms") && text.includes("code")) return true;
  if (text.includes("text message") && text.includes("code")) return true;
  return Boolean(await page.$("input[type='tel']"));
}

export async function hasEmailOtp(page) {
  const text = (await page.textContent("body"))?.toLowerCase() ?? "";
  if (text.includes("email") && text.includes("code")) return true;
  if (text.includes("verification") && text.includes("code")) return true;
  return Boolean(await page.$("input[autocomplete='one-time-code'], input[name*='code']"));
}

async function readControlState(handle) {
  return handle
    .evaluate((el) => {
      if (!(el instanceof HTMLElement)) {
        return { label: "", disabled: true, visible: false };
      }

      const value =
        "value" in el && typeof (el).value === "string" ? (el).value : "";
      const label = (
        el.textContent ||
        value ||
        el.getAttribute("aria-label") ||
        el.getAttribute("title") ||
        ""
      )
        .toLowerCase()
        .trim();

      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const hiddenByStyle =
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number.parseFloat(style.opacity || "1") === 0;

      const visible =
        !hiddenByStyle &&
        !el.hasAttribute("hidden") &&
        (el.getAttribute("aria-hidden") ?? "").toLowerCase() !== "true" &&
        rect.width > 0 &&
        rect.height > 0;

      const disabled =
        el.hasAttribute("disabled") ||
        (el.getAttribute("aria-disabled") ?? "").toLowerCase() === "true";

      return { label, disabled, visible };
    })
    .catch(() => ({ label: "", disabled: true, visible: false }));
}

async function findControlByText(page, texts, selector) {
  const targets = (texts ?? [])
    .map((text) => (text ?? "").toString().trim().toLowerCase())
    .filter(Boolean);
  if (targets.length === 0) {
    return null;
  }

  const controls = await page.$$(selector);
  for (const control of controls) {
    const state = await readControlState(control);
    if (state.disabled || !state.visible || !state.label) {
      continue;
    }

    if (targets.some((text) => state.label.includes(text))) {
      return control;
    }
  }
  return null;
}

export async function findButtonByText(page, texts) {
  return findControlByText(
    page,
    texts,
    "button, input[type='submit'], input[type='button'], [role='button']"
  );
}

export async function findClickableByText(page, texts) {
  return findControlByText(
    page,
    texts,
    "button, input[type='submit'], input[type='button'], [role='button'], a[href], a[role='button']"
  );
}

export async function clickElementHandle(handle, timeoutMs = 12000) {
  if (!handle) {
    return false;
  }

  try {
    await handle.scrollIntoViewIfNeeded();
  } catch {
    // Best effort.
  }

  try {
    await handle.click({ timeout: timeoutMs });
    return true;
  } catch {
    try {
      await handle.evaluate((el) => {
        if (el instanceof HTMLElement) {
          el.click();
        }
      });
      return true;
    } catch {
      return false;
    }
  }
}

// ─── data-automation-id helpers (Workday et al.) ──────────────────────────
// Workday's DOM is riddled with stable data-automation-id attributes; they
// survive tenant theming far better than text or CSS classes.

export async function findByAutomationId(page, ids) {
  for (const id of Array.isArray(ids) ? ids : [ids]) {
    const handles = await page.$$(`[data-automation-id='${id}']`);
    for (const handle of handles) {
      const state = await readControlState(handle);
      if (state.visible && !state.disabled) return handle;
    }
  }
  return null;
}

// ─── ARIA combobox / listbox driver ────────────────────────────────────────
// Playwright port of the extension's fillComboboxByValue (runner/dom.js):
// Workday/Ashby/react-select dropdowns are ARIA widgets, not <select>s —
// setting the input's value never commits; they must be driven like a user:
// open, (type), wait for the portal-rendered [role='option'] list, click the
// best-scoring match. Never clicks a weak match: a wrong dropdown answer is
// worse than pausing for the AM.

const COMBO_PLACEHOLDER_TEXTS = new Set([
  "select", "choose", "please select", "select an option", "select one",
  "no results", "no results found", "no options", "loading", "loading...",
]);

function normalizeComboText(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

// 4 exact | 3 starts-with | 2 contains | 1 option is a whole token of the
// value. Token-level on the reverse test so option "US" can't match "aUStria".
export function scoreComboOption(optionText, wanted) {
  const option = normalizeComboText(optionText);
  const target = normalizeComboText(wanted);
  if (!option || !target) return 0;
  if (COMBO_PLACEHOLDER_TEXTS.has(option)) return 0;
  if (option === target) return 4;
  if (option.startsWith(target)) return 3;
  if (option.includes(target)) return 2;
  if (target.split(" ").includes(option)) return 1;
  return 0;
}

async function collectVisibleOptions(page) {
  const handles = await page.$$("[role='option']");
  const options = [];
  for (const handle of handles) {
    const state = await readControlState(handle);
    if (state.visible && !state.disabled && state.label) {
      options.push({ handle, label: state.label });
    }
  }
  return options;
}

export async function fillComboboxByValue(page, handle, value, opts = {}) {
  const wanted = String(value ?? "").trim();
  if (!handle || !wanted) return false;
  const waitMs = Number.isFinite(opts.waitMs) ? opts.waitMs : 5000;

  await handle.scrollIntoViewIfNeeded().catch(() => {});
  await clickElementHandle(handle, 5000);

  const typeable = await handle
    .evaluate((el) => {
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute("type") || "text").toLowerCase();
      return (tag === "input" || tag === "textarea") && !el.readOnly && type === "text";
    })
    .catch(() => false);
  if (typeable) {
    await handle.fill(wanted).catch(() => {});
  }

  const pollForOptions = async (deadlineMs) => {
    const deadline = Date.now() + deadlineMs;
    for (;;) {
      const found = await collectVisibleOptions(page);
      if (found.length > 0) return found;
      if (Date.now() >= deadline) return [];
      await page.waitForTimeout(150);
    }
  };

  let options = await pollForOptions(waitMs);

  // Some widgets only open on ArrowDown.
  if (options.length === 0) {
    await handle.press("ArrowDown").catch(() => {});
    options = await pollForOptions(Math.max(500, waitMs / 2));
  }

  // Typed filter may be too narrow — loosen to a prefix, let scoring decide.
  if (options.length === 0 && typeable && wanted.length > 3) {
    await handle.fill(wanted.slice(0, 3)).catch(() => {});
    options = await pollForOptions(Math.max(500, waitMs / 2));
  }

  if (options.length === 0) {
    await page.keyboard.press("Escape").catch(() => {});
    return false;
  }

  let best = null;
  for (const option of options) {
    const score = scoreComboOption(option.label, wanted);
    if (score === 0) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score && option.label.length < best.label.length)
    ) {
      best = { ...option, score };
    }
  }

  if (!best) {
    await page.keyboard.press("Escape").catch(() => {});
    return false;
  }

  await clickElementHandle(best.handle, 5000);
  await page.waitForTimeout(200); // let the widget commit
  return true;
}

/**
 * Find an unfilled ARIA combobox / listbox trigger whose resolved label
 * matches `label` (both-way includes). Used by the engine's classified-fill
 * fallback so LLM/screening answers can land on widget dropdowns, not just
 * native inputs/selects.
 */
export async function findComboboxByLabel(page, label) {
  const target = normalizeComboText(label);
  if (!target) return null;

  const handles = await page.$$(
    "[role='combobox'], [aria-haspopup='listbox'], input[aria-autocomplete]"
  );
  for (const handle of handles) {
    const state = await readControlState(handle);
    if (!state.visible || state.disabled) continue;
    const resolved = await handle
      .evaluate((el) => {
        const norm = (v) => (v ?? "").toString().toLowerCase().replace(/\s+/g, " ").trim();
        const labelledBy = el.getAttribute("aria-labelledby");
        if (labelledBy) {
          const parts = labelledBy
            .split(/\s+/)
            .map((ref) => document.getElementById(ref)?.textContent ?? "")
            .filter(Boolean);
          if (parts.length) return norm(parts.join(" "));
        }
        const aria = el.getAttribute("aria-label");
        if (aria) return norm(aria);
        const id = el.getAttribute("id");
        if (id) {
          const forLabel = document.querySelector(`label[for='${id}']`);
          if (forLabel?.textContent) return norm(forLabel.textContent);
        }
        const wrapped = el.closest("label");
        if (wrapped?.textContent) return norm(wrapped.textContent);
        // Workday: the field container carries the automation id; a sibling
        // label usually precedes the trigger inside it.
        const container = el.closest("[data-automation-id]");
        const sibling = container?.querySelector("label");
        if (sibling?.textContent) return norm(sibling.textContent);
        return "";
      })
      .catch(() => "");
    if (!resolved) continue;
    if (resolved === target || resolved.includes(target) || target.includes(resolved)) {
      return handle;
    }
  }
  return null;
}
