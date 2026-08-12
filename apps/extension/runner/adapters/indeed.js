(() => {
  const dom = window.JobGeniusDom;
  const registry = window.JobGeniusAdapterRegistry;

  // Indeed has two apply flows:
  //   1. Indeed Apply (native): the job page's "Apply now"/"Easily apply"
  //      button navigates THIS tab to smartapply.indeed.com — a multi-step
  //      SPA form (contact → resume → questions → review → submit). The
  //      navigation destroys this content-script instance, so we arm the
  //      background (ctx.rearmAfterNavigation) to re-inject the runner once
  //      the SmartApply page settles; the fresh instance detects it and
  //      continues the plan there.
  //   2. "Apply on company site": opens the employer's ATS in a new tab —
  //      handled with the existing child-tab handoff.

  const DEFAULT_SUBMIT_BUTTONS = window.JobGeniusPhrases?.submit ?? [
    "next",
    "continue",
    "review",
    "submit application",
    "submit",
  ];

  const NATIVE_APPLY_BUTTONS = ["apply now", "easily apply", "apply"];

  const EXTERNAL_APPLY_BUTTONS = [
    "apply on company site",
    "apply on company website",
    "apply on employer site",
  ];

  // SmartApply advance labels come before the generic list so "Continue"
  // beats a stray "Apply" elsewhere on the page.
  const SMARTAPPLY_SUBMIT_BUTTONS = [
    "submit your application",
    "review your application",
    "continue",
  ];

  function host() {
    return window.location.hostname.toLowerCase();
  }

  function isSmartApply() {
    return host().includes("smartapply.indeed.com");
  }

  registry.registerAdapter("INDEED", {
    detect() {
      return host().includes("indeed.com");
    },

    async clickApplyEntry(ctx) {
      // Already inside the SmartApply form (post-navigation re-arm, or the
      // run was launched directly on a smartapply URL).
      if (isSmartApply()) {
        return { ok: true };
      }

      // Native Indeed Apply — stable id first, then text. A text match whose
      // label is really the external control ("Apply on company site" starts
      // with "apply") is rerouted to the external branch below.
      let nativeButton =
        document.querySelector(
          "#indeedApplyButton, button[id*='indeedApplyButton']"
        ) || dom.findButtonByText(NATIVE_APPLY_BUTTONS);
      let externalCandidate = null;
      if (nativeButton) {
        const label = (
          nativeButton.textContent ||
          nativeButton.getAttribute("aria-label") ||
          ""
        ).toLowerCase();
        if (/company site|company website|employer site/.test(label)) {
          externalCandidate = nativeButton;
          nativeButton = null;
        }
      }

      if (nativeButton) {
        // Arm the background BEFORE the click: the navigation to
        // smartapply.indeed.com kills this script, so someone outside the
        // page must restart the runner there.
        if (ctx?.rearmAfterNavigation) {
          await ctx.rearmAfterNavigation();
        }
        if (dom.clickElement) await dom.clickElement(nativeButton);
        else nativeButton.click();
        await dom.sleep(1500);
        // If we're still alive the flow opened in-place (modal variant) —
        // continue here; otherwise the re-armed instance takes over.
        return { ok: true };
      }

      // External branch: employer ATS in a new tab → child-tab handoff.
      const externalButton =
        externalCandidate || dom.findClickableByText(EXTERNAL_APPLY_BUTTONS);
      if (externalButton) {
        if (dom.clickElement) await dom.clickElement(externalButton);
        else externalButton.click();
        await dom.sleep(1500);
        if (ctx?.handoffToNewTab) {
          const handoff = await ctx.handoffToNewTab();
          if (handoff) return { ok: true, handoff: true };
        }
        return { ok: true };
      }

      const alreadyInApplication = Boolean(
        document.querySelector("form input, form textarea, form select")
      );
      if (alreadyInApplication) return { ok: true };
      return { ok: false, reason: "APPLY_BUTTON_MISSING" };
    },

    async fillKnownFields(ctx) {
      const fillSummary = dom.fillAllFields(ctx.defaultEmail, ctx.profile, ctx.job);
      if (ctx.resumeUrl) {
        // SmartApply's resume step is a drop zone; standard input first,
        // drag-drop reveal as fallback.
        let upload = await dom.uploadResume(ctx.resumeUrl);
        if (!upload.ok && dom.uploadViaDragDrop) {
          upload = await dom.uploadViaDragDrop(ctx.resumeUrl);
        }
        if (
          !upload.ok &&
          upload.reason !== "NO_INPUT_OR_URL" &&
          upload.reason !== "NO_UPLOAD_ELEMENT"
        ) {
          return { ok: false, reason: "RESUME_UPLOAD_FAILED" };
        }
      }
      return { ok: true, fillSummary };
    },

    extractRequiredFields() {
      return dom.extractRequiredFields();
    },

    async submit(ctx) {
      const hints = Array.isArray(ctx?.buttonHints) ? ctx.buttonHints : [];
      const submitButton = dom.findButtonByText([
        ...hints,
        ...SMARTAPPLY_SUBMIT_BUTTONS,
        ...DEFAULT_SUBMIT_BUTTONS,
      ]);
      if (!submitButton) return { ok: false, reason: "SUBMIT_BUTTON_MISSING" };
      if (ctx.dryRun) return { ok: false, reason: "DRY_RUN_CONFIRM_SUBMIT" };
      const clickedLabel =
        submitButton.textContent?.trim() ||
        submitButton.getAttribute("aria-label") ||
        "Continue";
      if (dom.clickElement) await dom.clickElement(submitButton);
      else submitButton.click();
      await dom.sleep(1500);
      return { ok: true, clickedLabel };
    },

    confirm() {
      return dom.isConfirmationVisible
        ? dom.isConfirmationVisible(window.JobGeniusPhrases?.confirmation)
        : false;
    },
  });
})();
