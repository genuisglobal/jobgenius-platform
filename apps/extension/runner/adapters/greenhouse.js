(() => {
  const dom = window.JobGeniusDom;
  const registry = window.JobGeniusAdapterRegistry;
  const DEFAULT_SUBMIT_BUTTONS = [
    "next",
    "continue",
    "review",
    "submit application",
    "submit",
  ];

  registry.registerAdapter("GREENHOUSE", {
    detect() {
      return Boolean(document.querySelector("form[action*='greenhouse']"));
    },
    async clickApplyEntry(ctx) {
      const applyButton = dom.findButtonByText(["apply", "apply now"]);
      if (applyButton) {
        if (dom.clickElement) await dom.clickElement(applyButton);
        else applyButton.click();
        await dom.sleep(1200);
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
      await dom.sleep(1500);
      return { ok: true, clickedLabel };
    },
    confirm() {
      return dom.isConfirmationVisible
        ? dom.isConfirmationVisible(window.JobGeniusPhrases?.confirmation)
        : false;
    },
    async runFallback(ctx) {
      await this.clickApplyEntry(ctx);
      const maxSteps = Number(ctx?.automation?.maxAutoAdvanceSteps ?? 6);
      let noProgressRounds = 0;

      for (let step = 0; step < maxSteps; step += 1) {
        if (this.confirm()) return { status: "APPLIED" };
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

        await dom.sleep(1200);
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
