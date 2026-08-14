(() => {
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Collects matches across the document, all open shadow roots, AND all
  // same-origin iframes, so inputs/controls inside web components (Workday,
  // some Ashby boards) and embedded application frames (Greenhouse
  // embed/job_app on a company career page served same-origin) are detected
  // and fillable. Cross-origin iframes are untouchable by design — known ATS
  // hosts are handled by the frame election in runner/index.js, unknown ones
  // by findApplicationIframeSrc() + tab navigation.
  function queryAllDeep(selector, root = document) {
    const out = [];
    const seen = new Set();
    const visit = (node) => {
      if (!node || seen.has(node)) return;
      seen.add(node);
      if (typeof node.querySelectorAll !== "function") return;
      node.querySelectorAll(selector).forEach((el) => out.push(el));
      node.querySelectorAll("*").forEach((el) => {
        if (el.shadowRoot) visit(el.shadowRoot);
      });
      node.querySelectorAll("iframe, frame").forEach((frame) => {
        try {
          // contentDocument is null/throws for cross-origin frames.
          if (frame.contentDocument) visit(frame.contentDocument);
        } catch {
          /* cross-origin — handled by election or navigation instead */
        }
      });
    };
    visit(root);
    return out;
  }

  function queryDeep(selector, root = document) {
    return queryAllDeep(selector, root)[0] ?? null;
  }

  function normalizeButtonTexts(texts) {
    return (texts ?? [])
      .map((text) => (text ?? "").toString().trim().toLowerCase())
      .filter(Boolean);
  }

  function getButtonLabel(button) {
    return (
      button.textContent ||
      button.getAttribute("value") ||
      button.getAttribute("aria-label") ||
      button.getAttribute("title") ||
      ""
    )
      .toLowerCase()
      .trim();
  }

  function isDisabled(button) {
    if (button.hasAttribute("disabled")) return true;
    const ariaDisabled = (button.getAttribute("aria-disabled") ?? "").toLowerCase();
    return ariaDisabled === "true";
  }

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Whole-word test so "clear" doesn't match "clearance" and "submit" doesn't
  // match "resubmit". Falls back to a plain includes for multi-word phrases.
  function containsWord(label, word) {
    if (word.includes(" ")) return label.includes(word);
    try {
      return new RegExp(`\\b${escapeRegExp(word)}\\b`).test(label);
    } catch {
      return label.includes(word);
    }
  }

  // Labels that almost never belong to a genuine apply/advance/submit control.
  // A candidate whose label contains one of these is only accepted when it
  // exactly equals a requested target — this stops "Apply filters", "Clear
  // form", "Cancel", "Sign in", etc. from being clicked instead of the real
  // action button.
  const NEGATIVE_LABEL_WORDS = [
    "filter", "filters", "sort", "search", "clear", "reset",
    "cancel", "previous", "logout", "log out", "sign out",
    "forgot", "coupon", "promo", "delete", "remove",
  ];

  // Score how well `label` satisfies the priority-ordered `targets`. Higher is
  // better. Encodes match quality (exact > starts-with > word-boundary >
  // loose substring) in the high digits and the target's priority (earlier =
  // stronger) in the low digits, so an exact match always beats a substring
  // match and, among equal-quality matches, the earlier-listed target wins.
  // Returns null when nothing matches (or a negative-label control fails the
  // exact-match guard).
  function scoreLabelMatch(label, targets) {
    let best = null;
    const hasNegative = NEGATIVE_LABEL_WORDS.some((w) => containsWord(label, w));

    targets.forEach((text, index) => {
      if (!label.includes(text)) return;

      let quality;
      if (label === text) quality = 4;
      else if (label.startsWith(text)) quality = 3;
      else if (containsWord(label, text)) quality = 2;
      else quality = 1;

      // A control that also carries a negative word (e.g. "apply filters") is
      // only trustworthy when the label IS exactly the target we want.
      if (hasNegative && quality < 4) return;

      const priorityWeight = targets.length - index;
      const score = quality * 1000 + priorityWeight;
      if (!best || score > best.score) {
        best = { score, quality, length: label.length };
      }
    });

    return best;
  }

  function pickBestByText(selector, texts) {
    const targets = normalizeButtonTexts(texts);
    if (targets.length === 0) return null;

    const candidates = Array.from(queryAllDeep(selector));
    let winner = null;

    candidates.forEach((el) => {
      if (isDisabled(el) || !isElementVisible(el)) return;
      const label = getButtonLabel(el);
      if (!label) return;
      const match = scoreLabelMatch(label, targets);
      if (!match) return;
      if (
        !winner ||
        match.score > winner.match.score ||
        // Tie-break: prefer the more specific (shorter) label.
        (match.score === winner.match.score && match.length < winner.match.length)
      ) {
        winner = { el, match };
      }
    });

    return winner?.el ?? null;
  }

  function findButtonByText(texts) {
    return pickBestByText(
      "button, input[type='submit'], input[type='button'], [role='button']",
      texts
    );
  }

  function findClickableByText(texts) {
    return pickBestByText(
      "button, input[type='submit'], input[type='button'], [role='button'], a[href], a[role='button']",
      texts
    );
  }

  // Robust click: bring the control into view, then fire the full pointer/mouse
  // sequence some frameworks require (React synthetic handlers, custom widgets
  // that ignore a bare .click()), and finally call native click() as the
  // canonical activation. Best-effort — a detached/odd node still falls back to
  // whatever .click() it has. Returns true if a click was dispatched.
  async function clickElement(el) {
    if (!el) return false;
    try {
      el.scrollIntoView({ block: "center", inline: "center" });
    } catch {
      /* not scrollable / detached — ignore */
    }
    // Let any scroll-triggered lazy content settle a beat.
    await sleep(60);

    const rect = el.getBoundingClientRect?.();
    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      ...(rect
        ? {
            clientX: Math.floor(rect.left + rect.width / 2),
            clientY: Math.floor(rect.top + rect.height / 2),
          }
        : {}),
    };

    try {
      el.dispatchEvent(new PointerEvent("pointerdown", opts));
    } catch {
      /* PointerEvent unsupported — mouse events below still cover it */
    }
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    try {
      el.dispatchEvent(new PointerEvent("pointerup", opts));
    } catch {
      /* ignore */
    }
    el.dispatchEvent(new MouseEvent("mouseup", opts));

    if (typeof el.click === "function") {
      el.click();
    } else {
      el.dispatchEvent(new MouseEvent("click", opts));
    }
    return true;
  }

  function isElementVisible(element) {
    if (!element) return false;
    // Use the element's OWN window: for fields inside same-origin iframes the
    // top window's getComputedStyle may return empty styles.
    const win = element.ownerDocument?.defaultView ?? window;
    const style = win.getComputedStyle(element);
    if (!style) return false;
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function hasBlockingCaptchaIframe() {
    const iframes = Array.from(
      queryAllDeep(
        "iframe[src*='captcha'], iframe[src*='recaptcha'], iframe[src*='turnstile'], iframe[title*='captcha' i], iframe[title*='challenge' i]"
      )
    );

    return iframes.some((frame) => {
      if (!isElementVisible(frame)) return false;

      const src = (frame.getAttribute("src") || "").toLowerCase();
      const title = (frame.getAttribute("title") || "").toLowerCase();
      const rect = frame.getBoundingClientRect();
      const isSmall = rect.width < 180 || rect.height < 60;
      const isRecaptchaBadge =
        Boolean(frame.closest(".grecaptcha-badge")) ||
        src.includes("recaptcha/api2/anchor");

      if (isSmall || isRecaptchaBadge) return false;

      return (
        src.includes("captcha") ||
        src.includes("recaptcha") ||
        src.includes("turnstile") ||
        title.includes("captcha") ||
        title.includes("challenge")
      );
    });
  }

  function hasBlockingCaptchaWidget() {
    const selectors = [
      ".g-recaptcha",
      ".h-captcha",
      ".cf-turnstile",
      "#captcha",
      "[id*='captcha']",
      "[class*='captcha']",
      "[data-sitekey]",
    ];

    const candidates = selectors.flatMap((selector) =>
      Array.from(queryAllDeep(selector))
    );

    return candidates.some((node) => {
      const className = (node.className || "").toString().toLowerCase();
      const id = (node.id || "").toLowerCase();
      const isRecaptchaBadge =
        className.includes("grecaptcha-badge") || id.includes("grecaptcha-badge");
      if (isRecaptchaBadge) return false;

      if (!isElementVisible(node)) return false;
      const rect = node.getBoundingClientRect();
      if (rect.width < 140 || rect.height < 40) return false;

      const text = (node.textContent || "").toLowerCase();
      const mentionsChallenge =
        text.includes("captcha") ||
        text.includes("robot") ||
        text.includes("verify") ||
        text.includes("human") ||
        text.includes("challenge");

      const hasInteractiveControl =
        Boolean(node.querySelector?.("iframe, input, textarea, [role='checkbox'], button")) ||
        node.tagName.toLowerCase() === "iframe";

      return mentionsChallenge || hasInteractiveControl;
    });
  }

  function hasCaptcha() {
    if (hasBlockingCaptchaIframe()) return true;
    if (hasBlockingCaptchaWidget()) return true;

    const text = document.body?.innerText?.toLowerCase() ?? "";
    const challengePhrases = window.JobGeniusPhrases?.captcha ?? [
      "verify you are human",
      "prove you're human",
      "complete the captcha",
      "i'm not a robot",
      "i am not a robot",
      "security challenge",
    ];
    return challengePhrases.some((phrase) => text.includes(phrase));
  }

  function hasAnyPhrase(text, phrases) {
    return phrases.some((phrase) => text.includes(phrase));
  }

  // Detect a login wall (expired/absent session) so the runner pauses with a
  // crisp SESSION_EXPIRED instead of floundering into NO_PROGRESS or
  // APPLY_BUTTON_MISSING. Two signals, most reliable first:
  //   1. URL path segments boards use for auth walls (linkedin.com/authwall,
  //      /checkpoint/…, secure.indeed.com/…/login, generic /login|/signin).
  //   2. A visible password field plus sign-in copy — DISQUALIFIED by
  //      account-creation copy, because ATSes like Workday ask new applicants
  //      to create an account mid-apply (that's the flow, not a lost session).
  function hasLoginWall(href = window.location.href) {
    let path = "";
    try {
      path = new URL(href).pathname.toLowerCase();
    } catch {
      path = "";
    }
    if (path) {
      const AUTH_SEGMENTS = new Set([
        "login", "signin", "sign-in", "sign_in", "authwall", "checkpoint",
        "authenticate", "session-expired",
      ]);
      const segments = path.split("/").filter(Boolean);
      if (segments.some((s) => AUTH_SEGMENTS.has(s))) return true;
    }

    const passwordFields = queryAllDeep("input[type='password']").filter(
      (input) => isElementVisible(input) && !input.disabled
    );
    if (passwordFields.length === 0) return false;

    // innerText for fidelity in real browsers; textContent fallback for
    // environments without layout (jsdom tests).
    const text = normalizeHint(
      document.body?.innerText ?? document.body?.textContent ?? ""
    );
    const negatives = window.JobGeniusPhrases?.loginWallNegative ?? [
      "create account",
      "create an account",
      "create your account",
      "sign up",
      "register",
    ];
    if (hasAnyPhrase(text, negatives)) return false;

    const phrases = window.JobGeniusPhrases?.loginWall ?? [
      "sign in to",
      "log in to",
      "welcome back",
      "session expired",
      "please sign in",
      "please log in",
    ];
    return hasAnyPhrase(text, phrases);
  }

  function looksLikeOtpInput(input) {
    if (!input || input.disabled || !isElementVisible(input)) {
      return false;
    }

    const type = normalizeHint(input.getAttribute("type") || input.type || "text");
    if (["hidden", "file", "checkbox", "radio"].includes(type)) {
      return false;
    }

    const combinedHint = [
      input.getAttribute("autocomplete"),
      input.getAttribute("name"),
      input.getAttribute("id"),
      input.getAttribute("placeholder"),
      input.getAttribute("aria-label"),
      getInputHint(input),
    ]
      .map((value) => normalizeHint(value))
      .filter(Boolean)
      .join(" ");

    const maxLength = Number(input.getAttribute("maxlength") || input.maxLength || 0);

    return (
      combinedHint.includes("one-time-code") ||
      combinedHint.includes("otp") ||
      combinedHint.includes("verification") ||
      combinedHint.includes("passcode") ||
      (combinedHint.includes("auth") && combinedHint.includes("code")) ||
      (combinedHint.includes("security") && combinedHint.includes("code")) ||
      (combinedHint.includes("code") && maxLength > 0 && maxLength <= 8)
    );
  }

  function getOtpInputCandidates() {
    return Array.from(queryAllDeep("input, textarea"))
      .filter((input) => looksLikeOtpInput(input))
      .sort((a, b) => {
        const aPriority = normalizeHint(a.getAttribute("autocomplete")) === "one-time-code" ? 1 : 0;
        const bPriority = normalizeHint(b.getAttribute("autocomplete")) === "one-time-code" ? 1 : 0;
        return bPriority - aPriority;
      });
  }

  function findOtpInput() {
    return getOtpInputCandidates()[0] ?? null;
  }

  function hasSmsOtp() {
    const text = document.body?.innerText?.toLowerCase() ?? "";
    const smsPhrases = window.JobGeniusPhrases?.otpSms ?? [
      "sms code",
      "text message code",
      "texted you a code",
      "sent a code to your phone",
      "verification code sent to your phone",
      "phone verification code",
      "enter the code we sent",
    ];

    return hasAnyPhrase(text, smsPhrases) && Boolean(findOtpInput());
  }

  function hasEmailOtp() {
    const text = document.body?.innerText?.toLowerCase() ?? "";
    const emailPhrases = window.JobGeniusPhrases?.otpEmail ?? [
      "email code",
      "verification code",
      "confirmation code",
      "one-time code",
      "one time code",
      "check your email",
      "sent to your inbox",
    ];
    const smsPhrases = window.JobGeniusPhrases?.otpSmsNegative ?? [
      "sms",
      "text message",
      "texted you",
      "phone",
    ];

    if (!hasAnyPhrase(text, emailPhrases)) {
      return false;
    }

    if (hasAnyPhrase(text, smsPhrases) && !text.includes("email") && !text.includes("inbox")) {
      return false;
    }

    return Boolean(findOtpInput());
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
    return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
  }

  function splitLocation(location) {
    if (!location) return { city: "", state: "" };
    const match = location.match(/^([^,]+),\s*([A-Za-z]{2})$/);
    if (match) return { city: match[1].trim(), state: match[2].trim() };
    return { city: location.trim(), state: "" };
  }

  function getInputHint(input) {
    // Label lookups must run in the input's OWN document (it may live inside
    // a same-origin iframe queryAllDeep descended into).
    const doc = input.ownerDocument ?? document;
    const id = input.getAttribute("id");
    if (id) {
      try {
        const label = doc.querySelector(`label[for='${CSS.escape(id)}']`);
        if (label?.textContent) return normalizeHint(label.textContent);
      } catch (_) {
        /* invalid selector (id with special chars) — fall through */
      }
    }
    const parentLabel = input.closest("label");
    if (parentLabel?.textContent) return normalizeHint(parentLabel.textContent);
    const ariaLabel = input.getAttribute("aria-label");
    if (ariaLabel) return normalizeHint(ariaLabel);
    const placeholder = input.getAttribute("placeholder");
    if (placeholder) return normalizeHint(placeholder);
    const name = input.getAttribute("name");
    if (name) return normalizeHint(name);
    return "";
  }

  function getGroupHint(el) {
    const fieldset = el.closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend?.textContent) return normalizeHint(legend.textContent);
    }
    const group = el.closest("[role='group'], [role='radiogroup']");
    if (group) {
      const labelId = group.getAttribute("aria-labelledby");
      if (labelId) {
        const labelEl = (el.ownerDocument ?? document).getElementById(labelId);
        if (labelEl?.textContent) return normalizeHint(labelEl.textContent);
      }
      const ariaLabel = group.getAttribute("aria-label");
      if (ariaLabel) return normalizeHint(ariaLabel);
    }
    return getInputHint(el);
  }

  function findBestOption(options, candidates) {
    const normalized = candidates.map((c) => c.toLowerCase().trim());
    return options.find((opt) => {
      const text = normalizeHint(opt.textContent ?? opt.text ?? "");
      if (!text || text === "select" || text === "choose" || text === "please select") return false;
      return normalized.some((c) => text.includes(c) || c.includes(text));
    }) ?? null;
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

    if (hint.includes("salary") || hint.includes("compensation") || hint.includes("desired pay")) {
      return "Negotiable";
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

    if (hint.includes("current") && hint.includes("title")) {
      const lastJob = Array.isArray(profile?.work_history) && profile.work_history.length > 0
        ? profile.work_history[0] : null;
      return pickFirst(lastJob?.title, lastJob?.role) || null;
    }

    if (hint.includes("current employer") || hint.includes("current company") ||
        (isCompanyField && hint.includes("current"))) {
      const lastJob = Array.isArray(profile?.work_history) && profile.work_history.length > 0
        ? profile.work_history[0] : null;
      return pickFirst(lastJob?.company, lastJob?.organization, lastJob?.employer) || null;
    }

    if ((hint.includes("years") && hint.includes("experience")) ||
        hint.includes("years of experience")) {
      if (Array.isArray(profile?.work_history) && profile.work_history.length > 0) {
        return String(Math.min(profile.work_history.length * 2, 15));
      }
      return "3";
    }

    if (type === "email") return email;
    if (type === "tel") return phone;
    return "";
  }

  function fillTextInputs(defaultEmail, profile = null) {
    let filled = 0;
    const inputs = Array.from(
      queryAllDeep(
        "input[type='text'], input[type='email'], input[type='tel'], input:not([type])"
      )
    );

    inputs.forEach((input) => {
      if (input.value) return;
      if (input.disabled) return;
      // Never blind-set an ARIA combobox/typeahead: the value LOOKS filled but
      // the widget never commits it, hiding the miss from extractRequiredFields.
      // Left empty, it flows to the classify step, whose fillFieldsByLabel
      // drives it properly via fillComboboxByValue.
      if (isComboboxControl(input)) return;
      const type = input.getAttribute("type") || "text";
      const hint = getInputHint(input);
      const fillValue = resolveFieldValue(hint, type, profile ?? {}, defaultEmail);
      if (!fillValue) return;
      input.focus();
      setNativeValue(input, fillValue);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      filled += 1;
    });

    return filled;
  }

  function fillSelectInputs(defaultEmail, profile = null) {
    let filled = 0;
    const selects = Array.from(queryAllDeep("select"));

    selects.forEach((select) => {
      if (select.disabled) return;
      const firstOpt = select.options[0];
      const currentVal = select.value;
      const isDefault = !currentVal || currentVal === (firstOpt?.value ?? "");
      if (!isDefault) return;

      const hint = getInputHint(select);
      if (!hint) return;

      let candidates = null;

      // Sensitive / preference-bearing fields (work authorization, sponsorship,
      // EEO/demographics, relocation) are intentionally NOT answered here with
      // blind defaults — they are deferred to the screening-aware classify step
      // (/api/apply/classify-fields), which honors the seeker's configured
      // screening answers before applying any default.
      if (hint.includes("country")) {
        const country = pickFirst(profile?.address_country);
        const primary = country ? [country.toLowerCase()] : [];
        candidates = [...primary, "united states", "usa", "us", "united states of america"];
      } else if (hint.includes("years of experience") || (hint.includes("years") && hint.includes("experience"))) {
        candidates = ["3-5 years", "3 to 5", "5+ years", "5 years", "4 years", "3 years", "2-5", "1-3"];
      } else if (hint.includes("employment type") || hint.includes("job type") || hint.includes("work type")) {
        candidates = ["full-time", "full time", "permanent", "regular"];
      }

      if (!candidates) return;

      const options = Array.from(select.options);
      const best = findBestOption(options, candidates);
      if (best) {
        if (select.value === best.value) return;
        select.value = best.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        filled += 1;
      }
    });

    return filled;
  }

  // Radio groups are intentionally NOT answered here with blind local defaults.
  // Work authorization, sponsorship, relocation, and EEO/demographic groups (and
  // every other radio group) are deferred to the screening-aware server step:
  // extractRequiredFields()/enumerateFields() emit each radio group to
  // /api/apply/classify-fields, and fillFieldsByLabel()/fillRadioByLabel() apply
  // the returned answers. Answering radios locally here risked overriding the
  // seeker's configured screening answers, so this is a deliberate no-op kept
  // only to preserve the fillAllFields() aggregation shape.
  function fillRadioGroups() {
    return 0;
  }

  function fillCheckboxes() {
    let filled = 0;
    const checkboxes = Array.from(queryAllDeep("input[type='checkbox']"));
    const autoCheckKeywords = [
      "agree", "accept", "certify", "confirm", "acknowledge",
      "terms", "conditions", "correct", "authorize",
    ];

    checkboxes.forEach((checkbox) => {
      if (checkbox.checked) return;
      if (checkbox.disabled) return;
      const hint = getInputHint(checkbox);
      if (autoCheckKeywords.some((kw) => hint.includes(kw))) {
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        filled += 1;
      }
    });

    return filled;
  }

  function fillTextAreas(profile, job) {
    let filled = 0;
    const textareas = Array.from(queryAllDeep("textarea"));
    const fullName = pickFirst(profile?.full_name, profile?.name);
    const jobTitle = pickFirst(job?.title, "this position");
    const company = pickFirst(job?.company, "your company");

    let background = "my professional experience";
    if (Array.isArray(profile?.work_history) && profile.work_history.length > 0) {
      const latest = profile.work_history[0];
      background = pickFirst(latest?.title, latest?.role, background);
    }

    textareas.forEach((textarea) => {
      if (textarea.disabled) return;
      const hint = getInputHint(textarea);

      let fillValue = null;

      if (hint.includes("cover letter") || hint.includes("introduction") || hint.includes("letter")) {
        fillValue = `Dear Hiring Team,\n\nI am excited to apply for the ${jobTitle} role at ${company}. My background in ${background} makes me a strong fit for this position. I look forward to contributing to your team.\n\nBest regards,\n${fullName}`;
      } else if (hint.includes("why") || hint.includes("motivation") ||
                 hint.includes("interest") || hint.includes("reason")) {
        fillValue = `I am excited about the ${jobTitle} opportunity at ${company} because it aligns perfectly with my background and career goals.`;
      } else if (hint.includes("additional") || hint.includes("anything else")) {
        fillValue = "No additional information at this time.";
      }

      if (!fillValue && textarea.required) {
        fillValue =
          "I am excited about this role and confident my experience aligns with the position requirements.";
      }

      if (!fillValue) return;
      textarea.focus();
      setNativeValue(textarea, fillValue);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
      filled += 1;
    });

    return filled;
  }

  function fillAllFields(defaultEmail, profile, job) {
    const text = fillTextInputs(defaultEmail, profile);
    const selects = fillSelectInputs(defaultEmail, profile);
    const radios = fillRadioGroups(profile);
    const checkboxes = fillCheckboxes();
    const textareas = fillTextAreas(profile, job);
    return {
      text,
      selects,
      radios,
      checkboxes,
      textareas,
      total: text + selects + radios + checkboxes + textareas,
    };
  }

  const RESUME_MIME_BY_EXT = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    rtf: "application/rtf",
  };

  // Pick a filename + MIME type for the uploaded resume from the URL extension,
  // falling back to the fetched blob's type (then PDF). Uploading a .docx as
  // "resume.pdf"/application/pdf makes some ATS validators reject the file.
  function deriveResumeFileMeta(resumeUrl, blobType) {
    let ext = "";
    try {
      const path = new URL(resumeUrl, window.location.href).pathname.toLowerCase();
      const match = path.match(/\.([a-z0-9]+)$/);
      if (match) ext = match[1];
    } catch (_) {
      /* malformed URL — fall back to blob type below */
    }
    if (RESUME_MIME_BY_EXT[ext]) {
      return { fileName: `resume.${ext}`, mimeType: RESUME_MIME_BY_EXT[ext] };
    }
    const mimeType = blobType || "application/pdf";
    const extFromType =
      Object.keys(RESUME_MIME_BY_EXT).find((k) => RESUME_MIME_BY_EXT[k] === mimeType) || "pdf";
    return { fileName: `resume.${extFromType}`, mimeType };
  }

  async function uploadResume(resumeUrl) {
    const fileInputs = Array.from(queryAllDeep("input[type='file']"))
      .filter((input) => !input.disabled);
    const input =
      fileInputs.find((fileInput) => {
        const hint = getInputHint(fileInput);
        return (
          hint.includes("resume") ||
          hint.includes("cv") ||
          hint.includes("curriculum vitae")
        );
      }) ||
      fileInputs[0] ||
      null;
    if (!input || !resumeUrl) return { ok: false, reason: "NO_INPUT_OR_URL" };

    const response = await fetch(resumeUrl);
    if (!response.ok) {
      return { ok: false, reason: "FETCH_FAILED" };
    }

    const blob = await response.blob();
    const { fileName, mimeType } = deriveResumeFileMeta(resumeUrl, blob.type);
    const file = new File([blob], fileName, { type: mimeType });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  }

  // Decode a data: URL (e.g. from chrome.tabs.captureVisibleTab) into a Blob
  // suitable for multipart upload. Returns null on malformed input instead of
  // throwing — proof capture is always best-effort.
  function dataUrlToBlob(dataUrl) {
    try {
      const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl ?? ""));
      if (!match) return null;
      const mimeType = match[1] || "application/octet-stream";
      if (!match[2]) {
        return new Blob([decodeURIComponent(match[3])], { type: mimeType });
      }
      const binary = atob(match[3]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new Blob([bytes], { type: mimeType });
    } catch {
      return null;
    }
  }

  function cleanLabel(text) {
    return String(text || "").replace(/\s+/g, " ").trim().slice(0, 160);
  }

  function getLabelText(input) {
    // Resolve against the input's OWN document — it may live inside a
    // same-origin iframe that queryAllDeep descended into.
    const doc = input.ownerDocument ?? document;
    const id = input.getAttribute("id");
    if (id) {
      try {
        const label = doc.querySelector(`label[for='${CSS.escape(id)}']`);
        if (label?.textContent?.trim()) return cleanLabel(label.textContent);
      } catch (_) {
        /* invalid selector */
      }
    }

    const parentLabel = input.closest("label");
    if (parentLabel?.textContent?.trim()) return cleanLabel(parentLabel.textContent);

    // aria-labelledby → resolve the referenced element(s).
    const labelledBy = input.getAttribute("aria-labelledby");
    if (labelledBy) {
      const parts = labelledBy
        .split(/\s+/)
        .map((ref) => doc.getElementById(ref)?.textContent?.trim())
        .filter(Boolean);
      if (parts.length) return cleanLabel(parts.join(" "));
    }

    const ariaLabel = input.getAttribute("aria-label");
    if (ariaLabel?.trim()) return cleanLabel(ariaLabel);

    // Walk up the field's container (e.g. Ashby/React forms whose label isn't
    // linked via for/aria) and use the label scoped to just this control.
    let node = input.parentElement;
    for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
      const controls = node.querySelectorAll("input, textarea, select");
      if (controls.length > 1) break; // container now spans multiple fields
      const lbl = node.querySelector("label");
      if (lbl?.textContent?.trim()) return cleanLabel(lbl.textContent);
    }

    const placeholder = input.getAttribute("placeholder");
    if (placeholder?.trim()) return cleanLabel(placeholder);

    const name = input.getAttribute("name");
    return name?.trim() ? cleanLabel(name) : "Unknown field";
  }

  function isRequiredField(input) {
    return Boolean(input.matches?.("[required], [aria-required='true']"));
  }

  function hasEmptyValue(input) {
    const tag = input.tagName.toLowerCase();
    const type = normalizeHint(input.getAttribute("type") || "");

    if (type === "checkbox") {
      return !input.checked;
    }

    if (type === "file") {
      return !input.files || input.files.length === 0;
    }

    if (tag === "select") {
      return !String(input.value ?? "").trim();
    }

    return !String(input.value ?? "").trim();
  }

  function extractRequiredFields() {
    const requiredFields = [];
    const radioGroups = new Map();
    const inputs = Array.from(queryAllDeep("input, textarea, select"));

    inputs.forEach((input) => {
      if (input.disabled || !isRequiredField(input)) {
        return;
      }

      const type = normalizeHint(input.getAttribute("type") || input.tagName.toLowerCase());
      if (type === "radio") {
        const groupKey = input.getAttribute("name") || input.getAttribute("id") || getLabelText(input);
        if (!radioGroups.has(groupKey)) {
          radioGroups.set(groupKey, []);
        }
        radioGroups.get(groupKey).push(input);
        return;
      }

      if (!isElementVisible(input) && type !== "file") {
        return;
      }

      if (!hasEmptyValue(input)) {
        return;
      }

      let options = null;
      if (input.tagName.toLowerCase() === "select") {
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
    });

    for (const group of radioGroups.values()) {
      if (group.length === 0 || group.some((input) => input.checked)) {
        continue;
      }

      const visibleGroup = group.filter((input) => isElementVisible(input));
      const firstInput = visibleGroup[0] || group[0];
      requiredFields.push({
        label: getLabelText(firstInput),
        type: "radio",
        options: group
          .map((input) =>
            input.getAttribute("aria-label") ||
            input.getAttribute("value") ||
            getLabelText(input)
          )
          .filter(Boolean),
        required: true,
      });
    }

    return requiredFields;
  }

  function requiredFieldsMissing() {
    return extractRequiredFields().length > 0;
  }

  // Snapshot all fillable fields with their current values (for Mode 3 learning
  // diffs). Unlike extractRequiredFields this includes already-filled fields and
  // captures the value; password/hidden/file/submit inputs are skipped.
  function enumerateFields() {
    const fields = [];
    const radioGroups = new Map();
    const inputs = Array.from(queryAllDeep("input, textarea, select"));

    inputs.forEach((input) => {
      if (input.disabled) return;
      // Never enumerate the extension's own sidebar/editor inputs as form fields.
      if (input.closest && input.closest("#jobgenius-autofill-panel")) return;
      const rawType = normalizeHint(
        input.getAttribute("type") || input.tagName.toLowerCase()
      );
      if (
        ["submit", "button", "reset", "hidden", "image", "file", "password"].includes(rawType)
      ) {
        return;
      }

      if (rawType === "radio") {
        const groupKey =
          input.getAttribute("name") ||
          input.getAttribute("id") ||
          getLabelText(input);
        if (!radioGroups.has(groupKey)) radioGroups.set(groupKey, []);
        radioGroups.get(groupKey).push(input);
        return;
      }

      if (!isElementVisible(input)) return;

      if (rawType === "checkbox") {
        fields.push({
          label: getLabelText(input),
          type: "checkbox",
          options: null,
          value: input.checked ? "checked" : "",
        });
        return;
      }

      const tag = input.tagName.toLowerCase();
      let options = null;
      let value = String(input.value ?? "").trim();
      if (tag === "select") {
        options = Array.from(input.options)
          .map((o) => o.textContent?.trim())
          .filter(Boolean);
        const selected = input.options[input.selectedIndex];
        if (selected) {
          value = (selected.textContent?.trim() || String(input.value ?? "")).trim();
        }
      }

      fields.push({
        label: getLabelText(input),
        type: tag === "textarea" ? "textarea" : rawType,
        options,
        value,
      });
    });

    for (const group of radioGroups.values()) {
      const firstInput = group.find((i) => isElementVisible(i)) || group[0];
      const checked = group.find((i) => i.checked);
      const options = group
        .map(
          (i) =>
            i.getAttribute("aria-label") ||
            i.getAttribute("value") ||
            getLabelText(i)
        )
        .filter(Boolean);
      const value = checked
        ? checked.getAttribute("aria-label") ||
          checked.getAttribute("value") ||
          getLabelText(checked)
        : "";
      fields.push({
        label: getLabelText(firstInput),
        type: "radio",
        options,
        value,
      });
    }

    return fields;
  }

  function captureFlowFingerprint() {
    const headerText =
      document.querySelector("h1, h2, [role='heading']")?.textContent?.trim() ?? "";
    const requiredCount = extractRequiredFields().length;
    const buttonSnapshot = Array.from(
      queryAllDeep(
        "button, input[type='submit'], input[type='button'], [role='button']"
      )
    )
      .slice(0, 4)
      .map((button) => getButtonLabel(button))
      .filter(Boolean)
      .join("|");

    return [
      window.location.pathname,
      document.title ?? "",
      headerText.slice(0, 120),
      String(requiredCount),
      buttonSnapshot.slice(0, 240),
    ].join("::");
  }

  /**
   * Wait for the DOM to stop mutating before proceeding.
   * Resolves after `idleMs` of no mutations or `totalMs` timeout.
   */
  function waitForDomStable(idleMs = 800, totalMs = 8000) {
    return new Promise((resolve) => {
      let timer = null;
      const deadline = setTimeout(() => {
        if (observer) observer.disconnect();
        resolve();
      }, totalMs);

      const observer = new MutationObserver(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          observer.disconnect();
          clearTimeout(deadline);
          resolve();
        }, idleMs);
      });

      const target = document.body ?? document.documentElement;
      if (target) {
        observer.observe(target, {
          childList: true,
          subtree: true,
          attributes: true,
        });
      }

      timer = setTimeout(() => {
        observer.disconnect();
        clearTimeout(deadline);
        resolve();
      }, idleMs);
    });
  }

  /**
   * Dismiss common blocking overlays (cookie banners, modals).
   */
  function dismissOverlays() {
    let dismissed = false;

    // Cookie consent
    const cookieSelectors = [
      "button[id*='cookie' i][id*='accept' i]",
      "#onetrust-accept-btn-handler",
      ".cc-dismiss",
      ".cc-btn.cc-allow",
      "[data-testid='cookie-accept']",
    ];
    for (const sel of cookieSelectors) {
      const btn = queryDeep(sel);
      if (btn instanceof HTMLElement && btn.offsetParent !== null) {
        btn.click();
        dismissed = true;
        break;
      }
    }

    // Modal close
    const modalSelectors = [
      "[role='dialog'] button[aria-label*='close' i]",
      ".modal button.close",
      ".modal-close",
      "[data-dismiss='modal']",
    ];
    for (const sel of modalSelectors) {
      const btn = queryDeep(sel);
      if (btn instanceof HTMLElement && btn.offsetParent !== null) {
        btn.click();
        dismissed = true;
        break;
      }
    }

    return dismissed;
  }

  /**
   * Deep check for "we're already on/inside an application form" — unlike a
   * plain document.querySelector this sees into shadow roots and same-origin
   * iframes (embedded Greenhouse/Lever forms on company career pages).
   */
  function hasApplicationFormFields() {
    return (
      queryAllDeep(
        "form input, form textarea, form select, input[required], textarea[required], select[required], input[aria-required='true'], textarea[aria-required='true'], select[aria-required='true']"
      ).length > 0
    );
  }

  /**
   * Find a CROSS-ORIGIN iframe that likely hosts the application form, and
   * return its absolute src. Used by the generic adapter as a last resort:
   * same-origin frames are reachable via queryAllDeep's descend, and
   * known-ATS-host frames are handled by the frame election in
   * runner/index.js — this covers the remainder (unknown ATS, apply-ish
   * path) by letting the adapter NAVIGATE the tab to the iframe's src and
   * continue there (via ctx.rearmAfterNavigation).
   */
  function findApplicationIframeSrc() {
    const HOST_HINTS = [
      "greenhouse.io", "lever.co", "ashbyhq.com", "myworkdayjobs.com",
      "workday.com", "smartrecruiters.com", "icims.com", "jobvite.com",
      "workable.com", "breezy.hr", "bamboohr.com", "recruitee.com",
      "personio.com", "applytojob.com",
    ];
    const PATH_HINTS = ["job_app", "embed/job", "/apply", "/application"];

    for (const frame of queryAllDeep("iframe[src]")) {
      if (!isElementVisible(frame)) continue;

      // Same-origin frames are already reachable — never navigate for those.
      let reachable = false;
      try {
        reachable = Boolean(frame.contentDocument);
      } catch {
        reachable = false;
      }
      if (reachable) continue;

      let url;
      try {
        url = new URL(frame.getAttribute("src") ?? "", window.location.href);
      } catch {
        continue;
      }
      if (!/^https?:$/.test(url.protocol)) continue;

      const host = url.hostname.toLowerCase();
      const path = url.pathname.toLowerCase();
      const looksLikeApplication =
        HOST_HINTS.some((h) => host.includes(h)) ||
        PATH_HINTS.some((h) => path.includes(h));
      if (!looksLikeApplication) continue;

      // Skip widget-sized frames (chat bubbles, badges, trackers).
      const rect = frame.getBoundingClientRect();
      if (rect.width < 400 || rect.height < 300) continue;

      return url.href;
    }
    return null;
  }

  /**
   * Upload a file via drag-and-drop zone if standard input not found.
   */
  async function uploadViaDragDrop(resumeUrl) {
    if (!resumeUrl) return { ok: false, reason: "NO_INPUT_OR_URL" };

    // Try standard input first
    const fileInputs = Array.from(queryAllDeep("input[type='file']"))
      .filter((input) => !input.disabled);
    if (fileInputs.length > 0) {
      return uploadResume(resumeUrl); // Use existing method
    }

    // Look for drop zones
    const dropZone = queryDeep(
      "[class*='dropzone'], [class*='drop-zone'], [class*='upload-area'], " +
      "[class*='file-upload'], [class*='drag-drop'], " +
      ".dz-clickable, .filepond--root"
    );

    if (dropZone) {
      // Clicking often reveals a file input
      dropZone.click();
      await sleep(1000);
      const revealedInput = queryDeep("input[type='file']");
      if (revealedInput) {
        return uploadResume(resumeUrl);
      }
    }

    return { ok: false, reason: "NO_UPLOAD_ELEMENT" };
  }

  // ─── Shared fill brain: apply { label -> value } answers resolved by the
  //     server (/api/apply/classify-fields: learned rules → screening → LLM). ───

  function normLabel(value) {
    return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function setNativeValue(el, value) {
    const proto =
      el.tagName.toLowerCase() === "textarea"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
  }

  function setValueOnElement(el, value) {
    // Bring the field into view before touching it: improves reliability on
    // lazy-rendered forms and looks more human than instant off-screen edits.
    try {
      el.scrollIntoView({ block: "center" });
    } catch {
      /* not scrollable / detached — ignore */
    }
    const tag = el.tagName.toLowerCase();
    const type = normalizeHint(el.getAttribute("type") || tag);
    const text = String(value ?? "");

    if (tag === "select") {
      const options = Array.from(el.options);
      const match =
        options.find((o) => normLabel(o.textContent) === normLabel(text) || normLabel(o.value) === normLabel(text)) ||
        options.find((o) => normLabel(o.textContent) && normLabel(o.textContent).includes(normLabel(text))) ||
        options.find((o) => normLabel(o.textContent) && normLabel(text).includes(normLabel(o.textContent)));
      if (!match) return false;
      el.value = match.value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    if (type === "checkbox") {
      const affirmative = ["yes", "true", "1", "on", "agree", "i agree"].includes(normLabel(text));
      if (el.checked !== affirmative) el.click();
      return true;
    }

    el.focus();
    setNativeValue(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    if (typeof el.blur === "function") el.blur();
    return true;
  }

  // ─── ARIA combobox / typeahead driver ───────────────────────────────────
  //
  // Workday, Ashby, Greenhouse-React, and react-select render dropdowns as
  // ARIA comboboxes, not native <select>s. Setting .value on their input
  // *looks* filled but never commits — the widget's internal state (and the
  // hidden field the ATS actually submits) stays empty. The only reliable
  // path is to drive them like a user: open, type, wait for the option list
  // (usually portal-rendered at document root), and click the best match.

  function poll(predicate, timeoutMs = 2500, intervalMs = 120) {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const tick = () => {
        let result = null;
        try {
          result = predicate();
        } catch {
          /* predicate errors count as "not yet" */
        }
        if (result) return resolve(result);
        if (Date.now() - startedAt >= timeoutMs) return resolve(null);
        setTimeout(tick, intervalMs);
      };
      tick();
    });
  }

  function isComboboxControl(el) {
    if (!el || typeof el.getAttribute !== "function") return false;
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    if (tag === "select") return false; // native select — handled directly
    const role = normalizeHint(el.getAttribute("role"));
    if (role === "combobox") return true; // ARIA 1.2 (role on the input)
    if (el.getAttribute("aria-autocomplete")) return true;
    if (normalizeHint(el.getAttribute("aria-haspopup")) === "listbox") return true;
    // ARIA 1.1: container carries role=combobox, input sits inside it.
    if (el.closest && el.closest("[role='combobox']")) return true;
    return false;
  }

  function getVisibleComboOptions() {
    return queryAllDeep("[role='option']").filter(
      (option) => isElementVisible(option) && !isDisabled(option)
    );
  }

  const COMBO_PLACEHOLDER_TEXTS = new Set([
    "select", "choose", "please select", "select an option", "select one",
    "no results", "no results found", "no options", "loading", "loading...",
  ]);

  // Match quality between an option's text and the wanted value:
  //   4 exact | 3 starts-with | 2 contains | 1 option is a whole token of the
  //   value (e.g. option "senior" for value "senior engineer"). Token-level
  //   only for the reverse test — substring would make option "US" match
  //   value "aUStria". 0 = no match; the driver never clicks a 0.
  function scoreComboOption(optionText, wanted) {
    const option = normLabel(optionText);
    const target = normLabel(wanted);
    if (!option || !target) return 0;
    if (COMBO_PLACEHOLDER_TEXTS.has(option)) return 0;
    if (option === target) return 4;
    if (option.startsWith(target)) return 3;
    if (option.includes(target)) return 2;
    if (target.split(" ").includes(option)) return 1;
    return 0;
  }

  function pickBestComboOption(options, wanted) {
    let best = null;
    options.forEach((option) => {
      const text = option.textContent || option.getAttribute("aria-label") || "";
      const score = scoreComboOption(text, wanted);
      if (score === 0) return;
      if (
        !best ||
        score > best.score ||
        (score === best.score && text.trim().length < best.length)
      ) {
        best = { option, score, length: text.trim().length };
      }
    });
    return best;
  }

  function dispatchKey(el, key) {
    const opts = { key, bubbles: true, cancelable: true };
    try {
      el.dispatchEvent(new KeyboardEvent("keydown", opts));
      el.dispatchEvent(new KeyboardEvent("keyup", opts));
    } catch {
      /* KeyboardEvent unsupported — skip */
    }
  }

  /**
   * Drive an ARIA combobox/typeahead to `value`. `el` is the combobox input
   * (or a Workday-style aria-haspopup="listbox" trigger button). Returns true
   * only when a confidently-matching option was clicked — a wrong dropdown
   * answer is worse than leaving the field for the AM, so weak matches close
   * the popup (Escape) and return false.
   */
  async function fillComboboxByValue(el, value, opts = {}) {
    const wanted = String(value ?? "").trim();
    if (!el || !wanted) return false;
    const waitMs = Number.isFinite(opts.waitMs) ? opts.waitMs : 2500;

    try {
      el.scrollIntoView({ block: "center" });
    } catch {
      /* ignore */
    }

    // Open the widget. clickElement fires the full pointer sequence, which
    // is what react-select/Workday listen for.
    await clickElement(el);
    if (typeof el.focus === "function") el.focus();

    // Typeahead path: type the value so the widget filters its options.
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    const typeable =
      (tag === "input" || tag === "textarea") &&
      !el.readOnly &&
      normalizeHint(el.getAttribute("type") || "text") === "text";
    if (typeable) {
      setNativeValue(el, wanted);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }

    let options = await poll(() => {
      const visible = getVisibleComboOptions();
      return visible.length > 0 ? visible : null;
    }, waitMs);

    // Some widgets only open on ArrowDown (not click/typing).
    if (!options) {
      dispatchKey(el, "ArrowDown");
      options = await poll(() => {
        const visible = getVisibleComboOptions();
        return visible.length > 0 ? visible : null;
      }, Math.max(300, waitMs / 2));
    }

    // Typed filter may be too narrow ("United States of Amer…" truncations);
    // loosen to a prefix and let scoring pick from the wider list.
    if (!options && typeable && wanted.length > 3) {
      setNativeValue(el, wanted.slice(0, 3));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      options = await poll(() => {
        const visible = getVisibleComboOptions();
        return visible.length > 0 ? visible : null;
      }, Math.max(300, waitMs / 2));
    }

    if (!options) return false;

    const best = pickBestComboOption(options, wanted);
    if (!best) {
      dispatchKey(el, "Escape");
      return false;
    }

    await clickElement(best.option);
    await sleep(120); // let the widget commit its selection
    return true;
  }

  function fillRadioByLabel(target, value) {
    const radios = Array.from(queryAllDeep("input[type='radio']"));
    const groups = new Map();
    radios.forEach((r) => {
      const key = r.getAttribute("name") || r.getAttribute("id") || getLabelText(r);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });
    for (const group of groups.values()) {
      const rep = normLabel(getLabelText(group[0]) || getGroupHint(group[0]));
      if (rep !== target && !rep.includes(target) && !target.includes(rep)) continue;
      const pick = group.find((r) => {
        if (r.disabled) return false;
        const optText = normLabel(
          r.getAttribute("aria-label") || r.getAttribute("value") || getLabelText(r)
        );
        return optText === normLabel(value) || optText.includes(normLabel(value)) || normLabel(value).includes(optText);
      });
      if (pick) {
        pick.click();
        pick.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  async function fillFieldsByLabel(values) {
    if (!values || typeof values !== "object") return 0;
    const entries = Object.entries(values).filter(
      ([, v]) => v !== null && v !== undefined && String(v).trim()
    );
    if (entries.length === 0) return 0;

    const inputs = Array.from(queryAllDeep("input, textarea, select"));
    let filled = 0;

    for (const [label, value] of entries) {
      const target = normLabel(label);
      if (!target) continue;

      const el = inputs.find((i) => {
        if (i.disabled) return false;
        const type = normalizeHint(i.getAttribute("type") || i.tagName.toLowerCase());
        if (type === "radio" || type === "file") return false;
        return normLabel(getLabelText(i)) === target;
      });

      if (el) {
        // ARIA comboboxes must be driven (open/type/click option) — a plain
        // value set never commits to the widget's real state. Fall through to
        // the plain set only if driving fails (some "comboboxes" are really
        // free-text inputs with suggestions).
        if (isComboboxControl(el) && (await fillComboboxByValue(el, value))) {
          filled += 1;
          continue;
        }
        if (setValueOnElement(el, value)) {
          filled += 1;
          continue;
        }
      }

      if (fillRadioByLabel(target, value)) {
        filled += 1;
      }
    }

    return filled;
  }

  // Ask the server to classify a batch of fields (learned rules → screening →
  // LLM). Returns { map, resolved } WITHOUT filling anything, so callers can
  // review the AI's answers — and which layer produced each — before they land
  // on the page. `resolved` is [{ label, value, source, confidence }], source ∈
  // learned | screening | default | llm. Returns empty shapes on failure.
  async function classifyFields(ctx, fields) {
    const empty = { map: {}, resolved: [] };
    if (!ctx?.apiBaseUrl || !ctx?.authToken || !ctx?.jobSeekerId) return empty;
    if (!Array.isArray(fields) || fields.length === 0) return empty;
    try {
      const response = await fetch(`${ctx.apiBaseUrl}/api/apply/classify-fields`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ctx.authToken}`,
          "x-runner": "extension",
          "x-claim-token": ctx.claimToken ?? "",
        },
        body: JSON.stringify({
          job_seeker_id: ctx.jobSeekerId,
          ats_type: ctx.atsType ?? null,
          url_host: window.location.hostname,
          fields: fields.map((f) => ({ label: f.label, type: f.type, options: f.options })),
          job: ctx.job
            ? {
                title: ctx.job.title ?? null,
                company: ctx.job.company ?? null,
                job_post_id: ctx.job.job_post_id ?? ctx.job.id ?? null,
              }
            : null,
        }),
      });
      if (!response.ok) return empty;
      const data = await response.json();
      return {
        map: data?.map ?? {},
        resolved: Array.isArray(data?.resolved) ? data.resolved : [],
      };
    } catch (error) {
      console.warn("classifyFields failed:", error);
      return empty;
    }
  }

  async function classifyAndFill(ctx, fields) {
    const { map } = await classifyFields(ctx, fields);
    const filled = await fillFieldsByLabel(map);
    // Jittered pause so the follow-up submit doesn't fire instantly after a
    // burst of fills (less bot-like, lets validation/JS settle).
    if (filled > 0) await sleep(200 + Math.floor(Math.random() * 350));
    return filled;
  }

  // Robust "did the application actually submit?" check. The old approach —
  // document.body.innerText.includes("thank you"/"submitted") — false-positives
  // on any page whose body happens to contain those words (e.g. a "Thank you for
  // your interest" blurb next to the still-present form). Instead we require BOTH:
  //   1. a success phrase inside a *confined* success region (alert/status/
  //      heading/confirmation container), not anywhere in the page body, and
  //   2. the application form to be gone (no visible form fields left).
  function isConfirmationVisible(phrases) {
    const list =
      Array.isArray(phrases) && phrases.length
        ? phrases
        : window.JobGeniusPhrases?.confirmation ?? [
            "thank you",
            "application submitted",
            "submitted",
          ];

    const REGION_SELECTOR =
      "[role='alert'], [role='status'], [aria-live], " +
      "[class*='confirm'], [class*='success'], [class*='thank'], " +
      "[id*='confirm'], [id*='success'], h1, h2, h3";

    const hasSuccessSignal = Array.from(queryAllDeep(REGION_SELECTOR))
      .filter((el) => isElementVisible(el))
      .some((el) => {
        const text = normalizeHint(el.textContent);
        // Cap length so a whole-page container matching the selector can't be
        // treated as a "confined" signal.
        return text && text.length <= 400 && list.some((p) => text.includes(p));
      });
    if (!hasSuccessSignal) return false;

    // A genuine confirmation page no longer shows the application form.
    const formFields = Array.from(
      queryAllDeep(
        "form input:not([type='hidden']):not([type='submit']):not([type='button']), form textarea, form select"
      )
    ).filter((el) => isElementVisible(el));

    return formFields.length === 0;
  }

  window.JobGeniusDom = {
    sleep,
    findButtonByText,
    findClickableByText,
    clickElement,
    setValueOnElement,
    isComboboxControl,
    fillComboboxByValue,
    hasCaptcha,
    hasLoginWall,
    hasSmsOtp,
    hasEmailOtp,
    fillTextInputs,
    fillSelectInputs,
    fillRadioGroups,
    fillCheckboxes,
    fillTextAreas,
    fillAllFields,
    fillFieldsByLabel,
    classifyAndFill,
    classifyFields,
    enumerateFields,
    uploadResume,
    uploadViaDragDrop,
    findOtpInput,
    dataUrlToBlob,
    extractRequiredFields,
    requiredFieldsMissing,
    captureFlowFingerprint,
    isConfirmationVisible,
    resolveFieldValue,
    deriveResumeFileMeta,
    waitForDomStable,
    dismissOverlays,
    findApplicationIframeSrc,
    hasApplicationFormFields,
  };
})();
