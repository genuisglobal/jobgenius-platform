const FORM_SELECTORS = [
  "form[action*='greenhouse.io']",
  "form[action*='greenhouse']",
  "form#application_form",
  "form[action*='/applications']",
].join(", ");

const APPLY_BUTTON_PATTERNS = [/^apply$/i, /^apply now$/i, /easy apply/i];
const SUBMIT_BUTTON_PATTERNS = [
  /submit application/i,
  /^submit$/i,
  /review application/i,
  /continue/i,
  /next/i,
];
const SUCCESS_PATTERNS = [
  /thank you for applying/i,
  /application submitted/i,
  /thanks for applying/i,
  /we have received your application/i,
  /your application has been submitted/i,
];

function readBoolean(value, fallback) {
  if (value == null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function pickFirst(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function splitFullName(fullName) {
  const parts = pickFirst(fullName).split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function splitLocation(location) {
  const raw = pickFirst(location);
  if (!raw) {
    return { city: "", state: "" };
  }
  const match = raw.match(/^([^,]+),\s*([A-Za-z]{2})$/);
  if (!match) {
    return { city: raw, state: "" };
  }
  return {
    city: match[1].trim(),
    state: match[2].trim(),
  };
}

function buildProfileValues(profile = {}, job = {}) {
  const fullName = pickFirst(profile.full_name, profile.name);
  const { firstName, lastName } = splitFullName(fullName);
  const { city, state } = splitLocation(profile.location);

  return {
    fullName,
    firstName,
    lastName,
    email: pickFirst(profile.email),
    phone: pickFirst(profile.phone),
    location: pickFirst(profile.location),
    city: pickFirst(profile.address_city, city),
    state: pickFirst(profile.address_state, state),
    zip: pickFirst(profile.address_zip),
    country: pickFirst(profile.address_country),
    addressLine1: pickFirst(profile.address_line1),
    linkedin: pickFirst(profile.linkedin_url),
    website: pickFirst(profile.portfolio_url),
    company: pickFirst(job.company),
    jobTitle: pickFirst(job.title, "this role"),
  };
}

function resolveTextValue(hint, values) {
  const normalizedHint = normalize(hint);
  if (!normalizedHint) {
    return "";
  }

  if (normalizedHint.includes("first name")) return values.firstName;
  if (normalizedHint.includes("last name")) return values.lastName;
  if (normalizedHint.includes("full name")) return values.fullName;
  if (normalizedHint.includes("name") && !normalizedHint.includes("company")) return values.fullName;
  if (normalizedHint.includes("email")) return values.email;
  if (normalizedHint.includes("phone") || normalizedHint.includes("mobile")) return values.phone;
  if (normalizedHint.includes("linkedin")) return values.linkedin;
  if (
    normalizedHint.includes("website") ||
    normalizedHint.includes("portfolio") ||
    normalizedHint.includes("github")
  ) {
    return values.website;
  }
  if (normalizedHint.includes("address") || normalizedHint.includes("street")) return values.addressLine1;
  if (normalizedHint.includes("city")) return values.city;
  if (normalizedHint.includes("state")) return values.state;
  if (normalizedHint.includes("zip") || normalizedHint.includes("postal")) return values.zip;
  if (normalizedHint.includes("country")) return values.country;
  if (normalizedHint.includes("location")) return values.location;
  if (normalizedHint.includes("cover letter")) {
    return [
      "Dear Hiring Team,",
      "",
      `I am excited to apply for the ${values.jobTitle} role at ${values.company || "your company"}.`,
      "My background is closely aligned with the responsibilities of this position, and I would welcome the opportunity to contribute.",
      "",
      "Best regards,",
      values.fullName || "Candidate",
    ].join("\n");
  }
  if (
    normalizedHint.includes("why") ||
    normalizedHint.includes("interest") ||
    normalizedHint.includes("motivation")
  ) {
    return `I am excited about the ${values.jobTitle} role because it aligns closely with my experience and career goals.`;
  }

  return "";
}

function resolveSelectValue(hint, options, values) {
  const normalizedHint = normalize(hint);
  const loweredOptions = options.map((option) => normalize(option.label));

  if (
    normalizedHint.includes("work authorization") ||
    normalizedHint.includes("legally authorized") ||
    normalizedHint.includes("eligible to work")
  ) {
    const preferred = loweredOptions.find((option) =>
      option.includes("yes") || option.includes("authorized")
    );
    return preferred ?? "";
  }

  if (normalizedHint.includes("sponsor") || normalizedHint.includes("sponsorship")) {
    const preferred = loweredOptions.find((option) =>
      option.includes("no") || option.includes("not require")
    );
    return preferred ?? "";
  }

  if (normalizedHint.includes("country")) {
    const country = normalize(values.country || "united states");
    const preferred = loweredOptions.find((option) => option.includes(country));
    return preferred ?? loweredOptions.find((option) => option.includes("united states")) ?? "";
  }

  if (
    normalizedHint.includes("gender") ||
    normalizedHint.includes("race") ||
    normalizedHint.includes("veteran") ||
    normalizedHint.includes("disability")
  ) {
    return loweredOptions.find((option) => option.includes("prefer not")) ?? "";
  }

  return "";
}

async function describeControl(handle) {
  return handle.evaluate((element) => {
    const visible = (() => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number.parseFloat(style.opacity || "1") !== 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    })();

    const id = element.getAttribute("id") ?? "";
    const label = (() => {
      if (id) {
        const linked = document.querySelector(`label[for="${id}"]`);
        if (linked?.textContent?.trim()) {
          return linked.textContent.trim();
        }
      }
      const wrapped = element.closest("label");
      if (wrapped?.textContent?.trim()) {
        return wrapped.textContent.trim();
      }
      return "";
    })();

    const tagName = element.tagName.toLowerCase();
    const type =
      tagName === "textarea" || tagName === "select"
        ? tagName
        : (element.getAttribute("type") ?? "text").toLowerCase();
    const options =
      element instanceof HTMLSelectElement
        ? Array.from(element.options).map((option) => ({
            value: option.value,
            label: option.textContent?.trim() ?? option.value,
          }))
        : [];

    return {
      tagName,
      type,
      id,
      name: element.getAttribute("name") ?? "",
      placeholder: element.getAttribute("placeholder") ?? "",
      ariaLabel: element.getAttribute("aria-label") ?? "",
      required:
        element.hasAttribute("required") ||
        (element.getAttribute("aria-required") ?? "").toLowerCase() === "true",
      disabled:
        element.hasAttribute("disabled") ||
        (element.getAttribute("aria-disabled") ?? "").toLowerCase() === "true",
      visible,
      label,
      options,
      value:
        "value" in element && typeof element.value === "string" ? element.value : "",
      checked:
        element instanceof HTMLInputElement &&
        (element.type === "checkbox" || element.type === "radio")
          ? element.checked
          : false,
      files:
        element instanceof HTMLInputElement && element.type === "file"
          ? element.files?.length ?? 0
          : 0,
    };
  });
}

async function findButtonByPattern(page, patterns) {
  const handles = await page.$$("button, input[type='submit'], input[type='button'], a[href]");
  for (const handle of handles) {
    const descriptor = await handle.evaluate((element) => {
      const text =
        element.textContent ||
        element.getAttribute("value") ||
        element.getAttribute("aria-label") ||
        element.getAttribute("title") ||
        "";
      if (!(element instanceof HTMLElement)) {
        return { text, visible: false, disabled: true };
      }
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        text: text.trim(),
        visible:
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number.parseFloat(style.opacity || "1") !== 0 &&
          rect.width > 0 &&
          rect.height > 0,
        disabled:
          element.hasAttribute("disabled") ||
          (element.getAttribute("aria-disabled") ?? "").toLowerCase() === "true",
      };
    });

    if (!descriptor.visible || descriptor.disabled) {
      continue;
    }

    if (patterns.some((pattern) => pattern.test(descriptor.text))) {
      return handle;
    }
  }
  return null;
}

async function ensureApplicationForm(page, log) {
  await page.waitForLoadState("domcontentloaded");
  const formHandle = await page.$(FORM_SELECTORS);
  if (formHandle) {
    return formHandle;
  }

  const applyButton = await findButtonByPattern(page, APPLY_BUTTON_PATTERNS);
  if (applyButton) {
    log("INFO", "Found apply entry button, opening application form.");
    await applyButton.click();
  }

  await page.waitForSelector(FORM_SELECTORS, { timeout: 20000 });
  return page.$(FORM_SELECTORS);
}

async function fillVisibleControls(page, values, log) {
  const controls = await page.$$("input, textarea, select");
  for (const control of controls) {
    const descriptor = await describeControl(control);
    if (!descriptor.visible || descriptor.disabled) {
      continue;
    }

    const hint = [
      descriptor.label,
      descriptor.ariaLabel,
      descriptor.placeholder,
      descriptor.name,
      descriptor.id,
    ]
      .filter(Boolean)
      .join(" ");

    if (descriptor.tagName === "select") {
      const selectedValue = resolveSelectValue(hint, descriptor.options, values);
      if (!selectedValue) {
        continue;
      }
      const option = descriptor.options.find(
        (candidate) => normalize(candidate.label) === selectedValue
      );
      if (!option?.value) {
        continue;
      }
      await control.selectOption(option.value);
      log("INFO", `Selected option for "${descriptor.label || descriptor.name || "select"}".`);
      continue;
    }

    if (descriptor.type === "file" || descriptor.type === "checkbox" || descriptor.type === "radio") {
      continue;
    }

    if (String(descriptor.value ?? "").trim()) {
      continue;
    }

    const value = resolveTextValue(hint, values);
    if (!value) {
      continue;
    }

    await control.fill(value);
    log("INFO", `Filled "${descriptor.label || descriptor.name || descriptor.placeholder || "field"}".`);
  }
}

async function uploadResume(page, resumePath, log) {
  if (!resumePath) {
    return { ok: true, skipped: true };
  }

  const fileInputs = await page.$$("input[type='file']");
  for (const input of fileInputs) {
    const descriptor = await describeControl(input);
    if (descriptor.disabled) {
      continue;
    }

    const hint = normalize(
      [descriptor.label, descriptor.ariaLabel, descriptor.placeholder, descriptor.name].join(" ")
    );
    if (hint && !hint.includes("resume") && !hint.includes("cv")) {
      continue;
    }

    await input.setInputFiles(resumePath);
    log("INFO", `Uploaded resume into "${descriptor.label || descriptor.name || "file input"}".`);
    return { ok: true };
  }

  const firstAvailable = fileInputs[0];
  if (!firstAvailable) {
    return { ok: false, reason: "RESUME_INPUT_NOT_FOUND" };
  }

  await firstAvailable.setInputFiles(resumePath);
  log("INFO", "Uploaded resume into the first available file input.");
  return { ok: true };
}

async function collectBlockingFields(page) {
  return page.evaluate(() => {
    const results = [];
    const getLabel = (element) => {
      const id = element.getAttribute("id");
      if (id) {
        const linked = document.querySelector(`label[for="${id}"]`);
        if (linked?.textContent?.trim()) {
          return linked.textContent.trim();
        }
      }
      const wrapped = element.closest("label");
      if (wrapped?.textContent?.trim()) {
        return wrapped.textContent.trim();
      }
      return (
        element.getAttribute("aria-label") ||
        element.getAttribute("placeholder") ||
        element.getAttribute("name") ||
        "Unknown field"
      );
    };

    const isVisible = (element) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number.parseFloat(style.opacity || "1") !== 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    const controls = Array.from(document.querySelectorAll("input, textarea, select"));
    const radioGroups = new Map();

    for (const control of controls) {
      if (
        !(
          control instanceof HTMLInputElement ||
          control instanceof HTMLTextAreaElement ||
          control instanceof HTMLSelectElement
        )
      ) {
        continue;
      }
      const required =
        control.hasAttribute("required") ||
        (control.getAttribute("aria-required") ?? "").toLowerCase() === "true";
      if (!required || control.disabled) {
        continue;
      }

      const type =
        control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement
          ? control.tagName.toLowerCase()
          : (control.getAttribute("type") ?? "text").toLowerCase();

      if (type === "radio") {
        const groupName = control.name || control.id || getLabel(control);
        if (!radioGroups.has(groupName)) {
          radioGroups.set(groupName, []);
        }
        radioGroups.get(groupName).push(control);
        continue;
      }

      if (type !== "file" && !isVisible(control)) {
        continue;
      }

      const empty =
        type === "file"
          ? (control.files?.length ?? 0) === 0
          : type === "checkbox"
            ? !control.checked
            : !String(control.value ?? "").trim();

      if (!empty) {
        continue;
      }

      results.push({ label: getLabel(control), type });
    }

    for (const [groupName, radios] of radioGroups.entries()) {
      if (!radios.some((radio) => radio.checked)) {
        results.push({ label: groupName, type: "radio" });
      }
    }

    return results;
  });
}

async function submitApplication(page, log) {
  const button = await findButtonByPattern(page, SUBMIT_BUTTON_PATTERNS);
  if (!button) {
    return { ok: false, reason: "SUBMIT_BUTTON_NOT_FOUND" };
  }

  await Promise.allSettled([
    page.waitForNavigation({ waitUntil: "networkidle", timeout: 10000 }),
    button.click(),
  ]);
  log("INFO", "Clicked Greenhouse submit button.");
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForTimeout(2000);
  return { ok: true };
}

async function confirmSubmission(page) {
  const bodyText = normalize(await page.textContent("body"));
  return SUCCESS_PATTERNS.some((pattern) => pattern.test(bodyText));
}

export const greenhouseAdapter = {
  name: "GREENHOUSE",
  supports(run) {
    const atsType = normalize(run?.ats_type);
    const jobUrl = normalize(run?.job?.url || run?.job_url || run?.target_url);
    return atsType === "greenhouse" || jobUrl.includes("greenhouse");
  },
  async execute({ page, log, run, plan, resumePath }) {
    const submitEnabled = readBoolean(process.env.PLAYWRIGHT_SUBMIT_ENABLED, false);
    const targetUrl = plan?.metadata?.targetUrl || run?.job?.url || run?.target_url || run?.job_url;
    if (!targetUrl) {
      return { success: false, reason: "MISSING_JOB_URL", message: "No job URL was available." };
    }

    log("INFO", `Opening Greenhouse application: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    await ensureApplicationForm(page, log);
    log("INFO", "Application form detected.");

    const values = buildProfileValues(run?.profile, run?.job);
    await fillVisibleControls(page, values, log);

    const resumeUpload = await uploadResume(page, resumePath, log);
    if (!resumeUpload.ok && resumeUpload.reason !== "RESUME_INPUT_NOT_FOUND") {
      return {
        success: false,
        reason: resumeUpload.reason,
        message: "Resume upload could not be completed.",
      };
    }

    const blockers = await collectBlockingFields(page);
    if (blockers.length > 0) {
      return {
        success: false,
        reason: "REQUIRED_FIELDS_REMAIN",
        message: "Required fields remain after autofill.",
        meta: { blockers },
      };
    }

    if (!submitEnabled) {
      return {
        success: false,
        reason: "SUBMIT_DISABLED",
        message:
          "Submit skipped because PLAYWRIGHT_SUBMIT_ENABLED is not true. Enable it only when you are ready for a real submission.",
      };
    }

    const submitResult = await submitApplication(page, log);
    if (!submitResult.ok) {
      return {
        success: false,
        reason: submitResult.reason,
        message: "Submit button could not be clicked.",
      };
    }

    if (!(await confirmSubmission(page))) {
      return {
        success: false,
        reason: "SUBMIT_UNCONFIRMED",
        message: "Submit was clicked but confirmation was not detected.",
      };
    }

    return {
      success: true,
      message: "Greenhouse application submitted successfully.",
    };
  },
};
