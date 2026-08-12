(() => {
  const dom = window.JobGeniusDom;
  const registry = window.JobGeniusAdapterRegistry;

  // Shared, i18n-seeded phrase lists (runner/phrases.js); inline fallbacks keep
  // the adapter working if that file isn't present.
  const DEFAULT_SUBMIT_BUTTONS = window.JobGeniusPhrases?.submit ?? [
    "next",
    "continue",
    "save and continue",
    "proceed",
    "submit application",
    "submit",
    "apply",
    "begin application",
  ];

  const APPLY_ENTRY_BUTTONS = window.JobGeniusPhrases?.apply ?? [
    "easy apply",
    "apply now",
    "apply on company site",
    "apply on company website",
    "apply",
    "start application",
    "begin application",
    "continue application",
    "continue applying",
    "continue to application",
    "go to application",
    "view application",
    "external apply",
    "visit employer site",
  ];

  registry.registerAdapter("GENERIC", {
    detect() {
      return true;
    },

    async clickApplyEntry(ctx) {
      const entryHints =
        Array.isArray(ctx?.applyEntryHints) && ctx.applyEntryHints.length > 0
          ? ctx.applyEntryHints
          : APPLY_ENTRY_BUTTONS;
      const applyButton = dom.findClickableByText
        ? dom.findClickableByText(entryHints)
        : dom.findButtonByText(entryHints);
      if (!applyButton) {
        // Deep check: sees into shadow roots and same-origin iframes, so an
        // embedded Greenhouse/Lever form on a company career page counts as
        // "already in the application".
        const alreadyInApplication = dom.hasApplicationFormFields
          ? dom.hasApplicationFormFields()
          : Boolean(
              document.querySelector(
                "form input, form textarea, form select, form input[type='file'], input[required], textarea[required], select[required], input[aria-required='true'], textarea[aria-required='true'], select[aria-required='true']"
              )
            );
        if (alreadyInApplication) {
          return { ok: true };
        }

        // Last resort: the application may live in a CROSS-ORIGIN iframe on
        // an unknown host (same-origin frames are reachable via
        // queryAllDeep's descend; known-ATS frames self-elect their own
        // runner). Navigate the tab to the iframe's src and continue there —
        // rearmAfterNavigation restarts the runner after the navigation
        // destroys this instance.
        const iframeSrc = dom.findApplicationIframeSrc?.();
        if (iframeSrc) {
          if (ctx?.rearmAfterNavigation) {
            await ctx.rearmAfterNavigation();
          }
          window.location.href = iframeSrc;
          await dom.sleep(3000); // navigation kills this instance
          return { ok: true };
        }

        return { ok: false, reason: "APPLY_BUTTON_MISSING" };
      }

      const beforeUrl = window.location.href;
      if (dom.clickElement) await dom.clickElement(applyButton);
      else applyButton.click();
      await dom.sleep(1200);

      if (window.location.href !== beforeUrl) {
        return { ok: true };
      }

      if (ctx?.handoffToNewTab) {
        const handoff = await ctx.handoffToNewTab();
        if (handoff) {
          return { ok: true, handoff: true };
        }
      }

      return { ok: true };
    },

    async fillKnownFields(ctx) {
      const fillSummary = dom.fillAllFields(ctx.defaultEmail, ctx.profile, ctx.job);
      if (ctx.resumeUrl) {
        let upload = await dom.uploadResume(ctx.resumeUrl);
        if (!upload.ok && dom.uploadViaDragDrop) {
          upload = await dom.uploadViaDragDrop(ctx.resumeUrl);
        }
        if (!upload.ok && upload.reason !== "NO_INPUT_OR_URL" && upload.reason !== "NO_UPLOAD_ELEMENT") {
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
        ...DEFAULT_SUBMIT_BUTTONS,
      ]);
      if (!submitButton) {
        return { ok: false, reason: "SUBMIT_BUTTON_MISSING" };
      }
      if (ctx.dryRun) {
        return { ok: false, reason: "DRY_RUN_CONFIRM_SUBMIT" };
      }
      const clickedLabel =
        submitButton.textContent?.trim() ||
        submitButton.getAttribute("aria-label") ||
        submitButton.getAttribute("value") ||
        "Continue";
      if (dom.clickElement) await dom.clickElement(submitButton);
      else submitButton.click();
      await dom.sleep(1400);
      return { ok: true, clickedLabel };
    },

    confirm() {
      return dom.isConfirmationVisible
        ? dom.isConfirmationVisible(window.JobGeniusPhrases?.confirmation)
        : false;
    },

    async runFallback(ctx) {
      const entryResult = await this.clickApplyEntry(ctx);
      if (entryResult?.ok === false) {
        return {
          status: "NEEDS_ATTENTION",
          reason: entryResult.reason ?? "APPLY_BUTTON_MISSING",
        };
      }
      if (entryResult?.handoff) {
        return { status: "HANDOFF" };
      }

      const maxSteps = Number(ctx?.automation?.maxAutoAdvanceSteps ?? 8);
      let noProgressRounds = 0;

      for (let step = 0; step < maxSteps; step += 1) {
        if (this.confirm()) return { status: "APPLIED" };
        if (dom.hasCaptcha()) return { status: "NEEDS_ATTENTION", reason: "CAPTCHA" };

        const fillResult = await this.fillKnownFields(ctx);
        if (!fillResult.ok) {
          return { status: "NEEDS_ATTENTION", reason: fillResult.reason };
        }

        let missing = this.extractRequiredFields();
        if (missing.length > 0) {
          // Ask the server's shared fill brain (learned rules → screening →
          // LLM) to resolve the remaining required fields, then re-check.
          const classifiedCount = await dom.classifyAndFill?.(ctx, missing);
          if (classifiedCount > 0) {
            await dom.sleep(400);
            missing = this.extractRequiredFields();
          }
          if (missing.length > 0) {
            return {
              status: "NEEDS_ATTENTION",
              reason: "REQUIRED_FIELDS",
              missing_fields: missing,
            };
          }
        }

        if (ctx.dryRun) {
          return { status: "NEEDS_ATTENTION", reason: "DRY_RUN_CONFIRM_SUBMIT" };
        }

        const before = dom.captureFlowFingerprint?.() ?? window.location.href;
        const submitResult = await this.submit(ctx);
        if (!submitResult.ok) {
          return { status: "NEEDS_ATTENTION", reason: submitResult.reason };
        }

        await dom.sleep(1200);
        const after = dom.captureFlowFingerprint?.() ?? window.location.href;
        if (after === before) {
          noProgressRounds += 1;
          if (noProgressRounds >= 2) break;
        } else {
          noProgressRounds = 0;
        }
      }

      if (this.confirm()) return { status: "APPLIED" };
      return { status: "NEEDS_ATTENTION", reason: "REQUIRES_REVIEW" };
    },
  });
})();
