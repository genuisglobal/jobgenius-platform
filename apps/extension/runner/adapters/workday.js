(() => {
  const dom = window.JobGeniusDom;
  const registry = window.JobGeniusAdapterRegistry;
  const DEFAULT_SUBMIT_BUTTONS = [
    "next",
    "continue",
    "save and continue",
    "review",
    "submit application",
    "submit",
  ];

  registry.registerAdapter("WORKDAY", {
    detect() {
      return window.location.hostname.toLowerCase().includes("workday");
    },
    async clickApplyEntry(ctx) {
      const applyButton = dom.findButtonByText([
        "apply",
        "apply now",
        "start application",
      ]);
      if (applyButton) {
        if (dom.clickElement) await dom.clickElement(applyButton);
        else applyButton.click();
        await dom.sleep(1500);
      }
      return { ok: true };
    },
    async fillKnownFields(ctx) {
      const fillSummary = dom.fillAllFields(ctx.defaultEmail, ctx.profile, ctx.job);
      if (ctx.resumeUrl) {
        const upload = await dom.uploadResume(ctx.resumeUrl);
        if (!upload.ok) {
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
      const nextButton = dom.findButtonByText([
        ...hints,
        ...DEFAULT_SUBMIT_BUTTONS,
      ]);
      if (!nextButton) {
        return { ok: false, reason: "SUBMIT_BUTTON_MISSING" };
      }
      if (ctx.dryRun) {
        return { ok: false, reason: "DRY_RUN_CONFIRM_SUBMIT" };
      }
      const clickedLabel =
        nextButton.textContent?.trim() ||
        nextButton.getAttribute("aria-label") ||
        nextButton.getAttribute("value") ||
        "Continue";
      if (dom.clickElement) await dom.clickElement(nextButton);
      else nextButton.click();
      await dom.sleep(1500);
      return { ok: true, clickedLabel };
    },
    confirm() {
      return dom.isConfirmationVisible
        ? dom.isConfirmationVisible(window.JobGeniusPhrases?.confirmation)
        : false;
    },
    async runFallback(ctx) {
      if (dom.hasSmsOtp()) {
        return { status: "NEEDS_ATTENTION", reason: "OTP_SMS" };
      }

      await this.clickApplyEntry(ctx);

      if (document.body?.innerText?.toLowerCase().includes("sign in")) {
        return { status: "NEEDS_ATTENTION", reason: "LOGIN_REQUIRED" };
      }

      const maxSteps = Number(ctx?.automation?.maxAutoAdvanceSteps ?? 8);
      let noProgressRounds = 0;

      for (let step = 0; step < maxSteps; step += 1) {
        if (this.confirm()) return { status: "APPLIED" };
        if (dom.hasSmsOtp()) return { status: "NEEDS_ATTENTION", reason: "OTP_SMS" };
        if (dom.hasCaptcha()) return { status: "NEEDS_ATTENTION", reason: "CAPTCHA" };

        const fillResult = await this.fillKnownFields(ctx);
        if (!fillResult.ok) return { status: "NEEDS_ATTENTION", reason: fillResult.reason };

        let missing = this.extractRequiredFields();
        if (missing.length > 0) {
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

        const before = dom.captureFlowFingerprint?.() ?? window.location.href;
        const submitResult = await this.submit(ctx);
        if (!submitResult.ok) {
          return { status: "NEEDS_ATTENTION", reason: submitResult.reason };
        }

        await dom.sleep(1400);
        const after = dom.captureFlowFingerprint?.() ?? window.location.href;
        if (after === before) {
          noProgressRounds += 1;
          if (noProgressRounds >= 2) {
            break;
          }
        } else {
          noProgressRounds = 0;
        }
      }

      if (this.confirm()) return { status: "APPLIED" };
      return { status: "NEEDS_ATTENTION", reason: "REQUIRES_REVIEW" };
    },
  });
})();
