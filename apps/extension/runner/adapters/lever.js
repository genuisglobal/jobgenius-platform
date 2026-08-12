(() => {
  const dom = window.JobGeniusDom;
  const registry = window.JobGeniusAdapterRegistry;

  const APPLY_BUTTONS = ["apply for this job", "apply now", "apply"];
  const DEFAULT_SUBMIT_BUTTONS = [
    "submit application",
    "submit",
    "apply",
    "next",
    "continue",
  ];

  registry.registerAdapter("LEVER", {
    detect() {
      const host = window.location.hostname.toLowerCase();
      return host.includes("lever.co") || host.includes("jobs.lever.co");
    },
    async clickApplyEntry(ctx) {
      const entryHints =
        Array.isArray(ctx?.applyEntryHints) && ctx.applyEntryHints.length > 0
          ? ctx.applyEntryHints
          : APPLY_BUTTONS;
      const applyButton = dom.findClickableByText
        ? dom.findClickableByText(entryHints)
        : dom.findButtonByText(entryHints);
      if (!applyButton) {
        const hasForm = Boolean(
          document.querySelector(
            "form input[name], form textarea, .application-form, .lever-application-form"
          )
        );
        if (hasForm) return { ok: true };
        return { ok: false, reason: "APPLY_BUTTON_MISSING" };
      }

      const beforeUrl = window.location.href;
      if (dom.clickElement) await dom.clickElement(applyButton);
      else applyButton.click();
      await dom.sleep(1200);

      if (window.location.href !== beforeUrl) return { ok: true };

      if (ctx?.handoffToNewTab) {
        const handoff = await ctx.handoffToNewTab();
        if (handoff) return { ok: true, handoff: true };
      }

      return { ok: true };
    },
    async fillKnownFields(ctx) {
      const fillSummary = dom.fillAllFields(ctx.defaultEmail, ctx.profile, ctx.job);
      if (ctx.resumeUrl) {
        const upload = await dom.uploadResume(ctx.resumeUrl);
        if (!upload.ok) return { ok: false, reason: "RESUME_UPLOAD_FAILED" };
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
    async runFallback(ctx) {
      const entryResult = await this.clickApplyEntry(ctx);
      if (entryResult?.ok === false) {
        return { status: "NEEDS_ATTENTION", reason: entryResult.reason };
      }
      if (entryResult?.handoff) return { status: "HANDOFF" };

      const maxSteps = Number(ctx?.automation?.maxAutoAdvanceSteps ?? 8);
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
            return { status: "NEEDS_ATTENTION", reason: "REQUIRED_FIELDS", missing_fields: missing };
          }
        }

        if (ctx.dryRun) return { status: "NEEDS_ATTENTION", reason: "DRY_RUN_CONFIRM_SUBMIT" };

        const before = dom.captureFlowFingerprint?.() ?? window.location.href;
        const submitResult = await this.submit(ctx);
        if (!submitResult.ok) return { status: "NEEDS_ATTENTION", reason: submitResult.reason };

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
