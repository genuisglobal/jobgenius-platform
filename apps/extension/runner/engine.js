(() => {
  const dom = window.JobGeniusDom;
  const sidebar = window.JobGeniusRunnerSidebar;

  function setSidebarStatus(status) {
    sidebar?.setStatus?.(status);
  }

  function setSidebarStep(step) {
    sidebar?.setStep?.(step);
  }

  function setSidebarAction(action) {
    sidebar?.setAction?.(action);
  }

  function sidebarLog(message, level = "info") {
    sidebar?.log?.(message, level);
  }

  function sidebarReportFill(fillSummary) {
    if (!fillSummary || typeof fillSummary !== "object") return;
    sidebar?.reportFill?.(fillSummary);
  }

  function sidebarReportMissing(missingFields) {
    const count = Array.isArray(missingFields) ? missingFields.length : 0;
    if (count > 0) {
      sidebar?.reportMissing?.(count);
    }
  }

  function sidebarReportClick(buttonLabel) {
    sidebar?.reportClick?.(buttonLabel);
  }

  function isStopRequested() {
    return Boolean(window.__JG_RUNNER_STOP_REQUESTED);
  }

  function toBoundedInt(value, fallback, min = 1, max = 15) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(parsed)));
  }

  async function postJson(url, payload, authToken) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-runner": "extension",
        Authorization: authToken ? `Bearer ${authToken}` : "",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status}).`);
    }

    return response.json();
  }

  async function getJson(url, authToken) {
    const response = await fetch(url, {
      headers: {
        "x-runner": "extension",
        Authorization: authToken ? `Bearer ${authToken}` : "",
      },
    });
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}).`);
    }
    return response.json();
  }

  // Fetch the server's remediation suggestions for the (ATS, error) that caused
  // a pause and surface them in the sidebar, so the AM gets actionable next
  // steps instead of a bare reason code. Best-effort — never throws.
  async function surfaceSuggestions(ctx, reason) {
    if (!ctx?.apiBaseUrl || !ctx?.authToken || !ctx?.atsType || !reason) return;
    try {
      const params = new URLSearchParams({ ats: ctx.atsType, error_code: reason });
      const data = await getJson(
        `${ctx.apiBaseUrl}/api/apply/suggestions?${params.toString()}`,
        ctx.authToken
      );
      const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
      for (const suggestion of suggestions.slice(0, 3)) {
        if (suggestion) sidebarLog(`Suggestion: ${suggestion}`, "info");
      }
    } catch (error) {
      console.warn("Fetch apply suggestions failed:", error);
    }
  }

  async function logEvent(ctx, payload) {
    return postJson(
      `${ctx.apiBaseUrl}/api/apply/event`,
      { ...payload, claim_token: ctx.claimToken },
      ctx.authToken
    );
  }

  // Capture the current tab via the background worker (content scripts can't
  // call captureVisibleTab) and upload it to /api/apply/screenshot, where it
  // lands in apply_run_screenshots and shows up in the AM run timeline.
  // Called with reason "SUBMIT_PROOF" on completion and with the pause reason
  // on pauses. Strictly best-effort: never throws, never blocks the run
  // outcome — a missing screenshot must not turn a submitted application
  // into a failure.
  async function captureProofScreenshot(ctx, step, reason) {
    if (!ctx?.apiBaseUrl || !ctx?.runId) return false;
    try {
      const capture = await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(
            { type: "CAPTURE_PROOF_SCREENSHOT" },
            (response) => {
              // Reading lastError keeps Chrome from logging an unchecked error.
              if (chrome.runtime.lastError) resolve(null);
              else resolve(response);
            }
          );
        } catch {
          resolve(null);
        }
      });

      if (!capture?.success || !capture.dataUrl) {
        if (capture?.reason) {
          sidebarLog(`Screenshot skipped (${capture.reason}).`, "info");
        }
        return false;
      }

      const blob = dom.dataUrlToBlob?.(capture.dataUrl);
      if (!blob) return false;

      const form = new FormData();
      form.append("file", blob, "proof.png");
      form.append("run_id", ctx.runId);
      form.append("step", step ?? ctx.currentStep ?? "");
      form.append("reason", reason ?? "SUBMIT_PROOF");
      form.append("url", window.location.href);

      const response = await fetch(`${ctx.apiBaseUrl}/api/apply/screenshot`, {
        method: "POST",
        headers: {
          "x-runner": "extension",
          Authorization: ctx.authToken ? `Bearer ${ctx.authToken}` : "",
        },
        body: form,
      });
      if (response.ok) {
        sidebarLog("Captured page screenshot for the run timeline.", "success");
      }
      return response.ok;
    } catch (error) {
      console.warn("Proof screenshot failed:", error);
      return false;
    }
  }

  async function pauseRun(ctx, reason, meta) {
    // Photograph the page in its stuck state BEFORE reporting the pause, so
    // the AM triages from a screenshot instead of reconstructing from logs.
    await captureProofScreenshot(ctx, meta?.step ?? ctx.currentStep, reason);
    const result = await postJson(
      `${ctx.apiBaseUrl}/api/apply/pause`,
      {
        run_id: ctx.runId,
        claim_token: ctx.claimToken,
        reason,
        message: meta?.message ?? "Runner needs attention.",
        last_seen_url: window.location.href,
        step: meta?.step,
        meta,
      },
      ctx.authToken
    );
    // Surface server remediation suggestions for this pause reason (best-effort).
    await surfaceSuggestions(ctx, reason);
    return result;
  }

  async function completeRun(ctx, note) {
    // Capture the confirmation page as submission proof while it's still
    // showing (the tab may navigate away after the run finishes).
    await captureProofScreenshot(ctx, ctx.currentStep, "SUBMIT_PROOF");
    return postJson(
      `${ctx.apiBaseUrl}/api/apply/complete`,
      {
        run_id: ctx.runId,
        claim_token: ctx.claimToken,
        note,
        last_seen_url: window.location.href,
      },
      ctx.authToken
    );
  }

  async function retryRun(ctx, note) {
    return postJson(
      `${ctx.apiBaseUrl}/api/apply/retry`,
      {
        run_id: ctx.runId,
        claim_token: ctx.claimToken,
        note,
      },
      ctx.authToken
    );
  }

  async function waitForEmailOtp(ctx, timeoutMs = 60000) {
    if (!ctx.jobSeekerId) {
      return null;
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      try {
        const response = await fetch(
          `${ctx.apiBaseUrl}/api/otp/latest?jobSeekerId=${encodeURIComponent(
            ctx.jobSeekerId
          )}`,
          {
            headers: {
              "x-runner": "extension",
              Authorization: ctx.authToken ? `Bearer ${ctx.authToken}` : "",
            },
          }
        );
        if (response.ok) {
          const data = await response.json();
          if (data?.code && data?.id) {
            return { code: data.code, id: data.id };
          }
        }
      } catch {
        // ignore polling errors
      }
      await dom.sleep(3000);
    }

    return null;
  }

  async function markOtpUsed(ctx, otpId) {
    if (!otpId) return;
    await postJson(
      `${ctx.apiBaseUrl}/api/otp/mark-used`,
      { otp_id: otpId },
      ctx.authToken
    );
  }

  async function ensureOtp(ctx) {
    if (dom.hasSmsOtp()) {
      setSidebarStatus("Waiting for SMS OTP");
      sidebarLog("SMS OTP detected. Human intervention required.", "warn");
      await pauseRun(ctx, "OTP_SMS", {
        step: ctx.currentStep,
        ats: ctx.atsType,
        message: "SMS verification required.",
      });
      return false;
    }

    if (dom.hasEmailOtp()) {
      setSidebarStatus("Looking for email OTP");
      sidebarLog("Email OTP detected. Fetching code...");
      const otp = await waitForEmailOtp(ctx);
      if (!otp?.code) {
        setSidebarStatus("Waiting for email OTP");
        sidebarLog("Email OTP not available yet. Human intervention required.", "warn");
        await pauseRun(ctx, "OTP_EMAIL", {
          step: ctx.currentStep,
          ats: ctx.atsType,
          message: "Email verification code required.",
        });
        return false;
      }

      const otpInput = dom.findOtpInput
        ? dom.findOtpInput()
        : (
          document.querySelector("input[autocomplete='one-time-code']") ||
          document.querySelector("input[name*='code']")
        );

      if (!otpInput) {
        setSidebarStatus("OTP input missing");
        sidebarLog("OTP input field not found.", "warn");
        await pauseRun(ctx, "OTP_EMAIL", {
          step: ctx.currentStep,
          ats: ctx.atsType,
          message: "OTP input not found.",
        });
        return false;
      }

      otpInput.focus();
      if (dom.setValueOnElement) {
        dom.setValueOnElement(otpInput, otp.code);
      } else {
        otpInput.value = otp.code;
        otpInput.dispatchEvent(new Event("input", { bubbles: true }));
        otpInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
      await markOtpUsed(ctx, otp.id);
      setSidebarAction("Filled email OTP");
      sidebarLog("Filled email OTP automatically.", "success");
    }

    return true;
  }

  // Login wall = the board's session died. Tell the background immediately
  // (badge + popup banner for the seeker, without waiting for the hourly
  // cookie check). The run itself pauses with SESSION_EXPIRED — which is in
  // AUTO_RESUME_REASONS, so it picks back up once the seeker logs in.
  function notifySessionExpired() {
    setSidebarStatus("Session expired");
    sidebarLog("Login wall detected — the board session has expired.", "warn");
    try {
      chrome.runtime.sendMessage({
        type: "SESSION_EXPIRED_DETECTED",
        host: window.location.hostname,
      });
    } catch {
      /* background unavailable — the hourly check will still catch it */
    }
  }

  async function pauseForSessionExpired(ctx, step) {
    notifySessionExpired();
    await pauseRun(ctx, "SESSION_EXPIRED", {
      step,
      ats: ctx.atsType,
      message: "Login required — the board session has expired.",
    });
  }

  async function handleMissingFields(ctx, adapter, stepName) {
    let missingFields = adapter.extractRequiredFields
      ? adapter.extractRequiredFields()
      : dom.extractRequiredFields();

    if (missingFields.length > 0) {
      // Resolve via the server's shared fill brain before pausing for a human.
      const classifiedCount = await dom.classifyAndFill?.(ctx, missingFields);
      if (classifiedCount > 0) {
        await dom.sleep(400);
        missingFields = adapter.extractRequiredFields
          ? adapter.extractRequiredFields()
          : dom.extractRequiredFields();
      }
    }

    if (missingFields.length > 0) {
      sidebarReportMissing(missingFields);
      await pauseRun(ctx, "REQUIRED_FIELDS", {
        step: stepName,
        ats: ctx.atsType,
        missing_fields: missingFields,
        message: "Required fields missing.",
      });
      return false;
    }

    return true;
  }

  async function emitLearningSignal(ctx, payload) {
    try {
      await logEvent(ctx, {
        run_id: ctx.runId,
        event_type: "LEARNING_SIGNAL",
        step: ctx.currentStep,
        message: "Captured automation signal.",
        ...payload,
      });
    } catch (error) {
      console.warn("Learning signal failed:", error);
    }
  }

  function getAutomationConfig(ctx, step) {
    const maxIterations = toBoundedInt(
      step?.max_iterations ?? ctx?.automation?.maxAutoAdvanceSteps,
      7,
      1,
      20
    );
    const maxNoProgressRounds = toBoundedInt(
      step?.max_no_progress_rounds ?? ctx?.automation?.maxNoProgressRounds,
      2,
      1,
      5
    );
    return { maxIterations, maxNoProgressRounds };
  }

  function injectCaptchaOverlay() {
    window.JobGeniusCaptchaOverlay?.inject();
  }

  function waitForCaptcha() {
    if (window.JobGeniusCaptchaOverlay?.waitForUser) {
      return window.JobGeniusCaptchaOverlay.waitForUser();
    }
    return Promise.resolve("STOP");
  }

  async function runAutoAdvance(ctx, step, adapter) {
    const { maxIterations, maxNoProgressRounds } = getAutomationConfig(ctx, step);
    let noProgressRounds = 0;

    for (let attempt = 1; attempt <= maxIterations; attempt += 1) {
      if (isStopRequested()) {
        return {
          status: "NEEDS_ATTENTION",
          reason: "MANUAL_STOP",
          meta: { attempt, message: "Runner stopped from sidebar." },
        };
      }

      setSidebarStatus(`Auto-advancing (${attempt}/${maxIterations})`);
      if (adapter.confirm ? adapter.confirm(ctx) : false) {
        return { status: "APPLIED" };
      }

      // A step click can land on a login wall mid-flow (session timed out
      // while applying) — stop cleanly instead of grinding to NO_PROGRESS.
      if (dom.hasLoginWall?.()) {
        notifySessionExpired();
        return {
          status: "NEEDS_ATTENTION",
          reason: "SESSION_EXPIRED",
          meta: { attempt, message: "Login required — the board session has expired." },
        };
      }

      if (dom.hasCaptcha()) {
        setSidebarStatus("Waiting for CAPTCHA solve");
        sidebarLog("CAPTCHA detected. Waiting for your action.", "warn");
        injectCaptchaOverlay();
        const captchaResult = await waitForCaptcha();
        if (captchaResult === "STOP") {
          return {
            status: "NEEDS_ATTENTION",
            reason: "CAPTCHA",
            meta: { attempt },
          };
        }
        continue;
      }

      const otpReady = await ensureOtp(ctx);
      if (!otpReady) {
        return { status: "STOPPED" };
      }

      if (adapter.fillKnownFields) {
        const fillResult = await adapter.fillKnownFields(ctx);
        if (fillResult && fillResult.ok === false) {
          return {
            status: "NEEDS_ATTENTION",
            reason: fillResult.reason ?? "FILL_FAILED",
            meta: { attempt },
          };
        }
        sidebarReportFill(fillResult?.fillSummary);
      } else {
        const fillSummary = dom.fillAllFields(ctx.defaultEmail, ctx.profile, ctx.job);
        sidebarReportFill(fillSummary);
      }

      let missingFields = adapter.extractRequiredFields
        ? adapter.extractRequiredFields()
        : dom.extractRequiredFields();

      if (missingFields.length > 0) {
        const classifiedCount = await dom.classifyAndFill?.(ctx, missingFields);
        if (classifiedCount > 0) {
          await dom.sleep(400);
          missingFields = adapter.extractRequiredFields
            ? adapter.extractRequiredFields()
            : dom.extractRequiredFields();
        }
      }

      if (missingFields.length > 0) {
        sidebarReportMissing(missingFields);
        return {
          status: "NEEDS_ATTENTION",
          reason: "REQUIRED_FIELDS",
          meta: { attempt, missing_fields: missingFields },
        };
      }

      if (ctx.dryRun) {
        return {
          status: "NEEDS_ATTENTION",
          reason: "DRY_RUN_CONFIRM_SUBMIT",
          meta: { attempt },
        };
      }

      const beforeFingerprint =
        dom.captureFlowFingerprint?.() ?? window.location.href;

      const submitResult = adapter.submit
        ? await adapter.submit(ctx)
        : { ok: false, reason: "SUBMIT_BUTTON_MISSING" };

      if (submitResult && submitResult.ok === false) {
        if (submitResult.reason === "SUBMIT_BUTTON_MISSING") {
          break;
        }
        return {
          status: "NEEDS_ATTENTION",
          reason: submitResult.reason ?? "SUBMIT_BUTTON_MISSING",
          meta: { attempt },
        };
      }
      sidebarReportClick(submitResult?.clickedLabel || "Continue");

      // Short nudge, then wait for the DOM to actually settle (waitForDomStable
      // caps at 8s / 800ms idle) rather than betting on a fixed 1.3s guess that
      // is too short for slow ATS pages and wasteful for fast ones.
      await dom.sleep(300);
      if (dom.waitForDomStable) await dom.waitForDomStable();
      dom.dismissOverlays?.();
      const afterFingerprint =
        dom.captureFlowFingerprint?.() ?? window.location.href;
      const progressed = beforeFingerprint !== afterFingerprint;

      await emitLearningSignal(ctx, {
        meta: {
          ats: ctx.atsType,
          attempt,
          progressed,
          no_progress_rounds: noProgressRounds,
          automation_mode: "extension_autofill",
        },
      });

      if (!progressed) {
        noProgressRounds += 1;
        if (noProgressRounds >= maxNoProgressRounds) {
          sidebarLog(
            `No progress after ${noProgressRounds} attempts. Human review required.`,
            "warn"
          );
          return {
            status: "NEEDS_ATTENTION",
            reason: "NO_PROGRESS",
            meta: {
              attempt,
              no_progress_rounds: noProgressRounds,
            },
          };
        }
      } else {
        noProgressRounds = 0;
      }
    }

    if (adapter.confirm ? adapter.confirm(ctx) : false) {
      return { status: "APPLIED" };
    }

    return { status: "REVIEW_REQUIRED" };
  }

  async function runPlan(ctx, plan, adapter) {
    sidebar?.show?.({
      atsType: ctx.atsType,
      jobTitle: ctx.job?.title ?? null,
      step: "INIT",
    });
    setSidebarStatus("Running");
    ctx.currentStep = "INIT";
    ctx.buttonHints = Array.isArray(ctx.buttonHints) ? ctx.buttonHints : [];

    // Dismiss overlays and wait for DOM to stabilize before starting
    dom.dismissOverlays?.();
    if (dom.waitForDomStable) await dom.waitForDomStable();

    await logEvent(ctx, {
      run_id: ctx.runId,
      event_type: "RUNNER_STARTED",
      message: `Runner started on ${ctx.atsType}.`,
      last_seen_url: window.location.href,
    });

    // A dead session shows a login wall instead of the job page — detect it
    // up front so the run pauses as SESSION_EXPIRED, not UNKNOWN_ATS.
    if (dom.hasLoginWall?.()) {
      await pauseForSessionExpired(ctx, "DETECT_ATS");
      sidebar?.finish?.("Needs Attention", "Board session expired — log in to resume.");
      return;
    }

    if (!adapter || !adapter.detect || !adapter.detect()) {
      await pauseRun(ctx, "UNKNOWN_ATS", {
        step: "DETECT_ATS",
        ats: ctx.atsType,
        message: "ATS type not recognized.",
      });
      sidebar?.finish?.("Needs Attention", "ATS type not recognized.");
      return;
    }

    if (dom.hasCaptcha()) {
      setSidebarStatus("Waiting for CAPTCHA solve");
      sidebarLog("CAPTCHA detected before run start.", "warn");
      injectCaptchaOverlay();
      const captchaResult = await waitForCaptcha();
      if (captchaResult === "STOP") {
        await pauseRun(ctx, "CAPTCHA", {
          step: "DETECT_ATS",
          ats: ctx.atsType,
          message: "Captcha detected.",
        });
        sidebar?.finish?.("Needs Attention", "CAPTCHA requires manual action.");
        return;
      }
    }

    const otpReady = await ensureOtp(ctx);
    if (!otpReady) {
      sidebar?.finish?.("Needs Attention", "OTP verification requires manual action.");
      return;
    }

    for (const step of plan.steps ?? []) {
      if (isStopRequested()) {
        await pauseRun(ctx, "MANUAL_STOP", {
          step: ctx.currentStep,
          ats: ctx.atsType,
          message: "Runner stopped from sidebar.",
        });
        sidebar?.finish?.("Stopped", "Runner stopped manually.");
        return;
      }

      ctx.currentStep = step.name;
      setSidebarStep(step.name);
      setSidebarAction(`Processing ${step.name}`);
      await logEvent(ctx, {
        run_id: ctx.runId,
        event_type: "STEP_STARTED",
        step: step.name,
        message: `Starting ${step.name}.`,
        last_seen_url: window.location.href,
      });

      if (step.name === "OPEN_URL") {
        continue;
      }

      if (step.name === "DETECT_ATS") {
        if (!adapter.detect || !adapter.detect()) {
          await pauseRun(ctx, "UNKNOWN_ATS", {
            step: step.name,
            ats: ctx.atsType,
          });
          sidebar?.finish?.("Needs Attention", "ATS detection failed.");
          return;
        }
        continue;
      }

      if (step.name === "TRY_APPLY_ENTRY") {
        if (adapter.clickApplyEntry) {
          const result = await adapter.clickApplyEntry(ctx);
          if (result && result.ok === false) {
            await pauseRun(ctx, result.reason ?? "APPLY_BUTTON_MISSING", {
              step: step.name,
              ats: ctx.atsType,
            });
            sidebar?.finish?.("Needs Attention", result.reason ?? "Apply button missing.");
            return;
          }
          if (result?.handoff) {
            setSidebarAction("Transferred to application tab");
            sidebarLog("Continuing in the newly opened application tab.");
            sidebar?.finish?.("Transferred", "Continuing in the application tab.");
            return;
          }
          setSidebarAction("Clicked Apply");
          sidebarLog("Clicked Apply entry.");
          // Let the application form/modal render before the next step reads it.
          dom.dismissOverlays?.();
          if (dom.waitForDomStable) await dom.waitForDomStable();
        }
        continue;
      }

      if (step.name === "EXTRACT_FIELDS") {
        ctx.missingFields = adapter.extractRequiredFields
          ? adapter.extractRequiredFields()
          : dom.extractRequiredFields();
        continue;
      }

      if (step.name === "FILL_KNOWN") {
        if (adapter.fillKnownFields) {
          const result = await adapter.fillKnownFields(ctx);
          if (result && result.ok === false) {
            await pauseRun(ctx, result.reason ?? "FILL_FAILED", {
              step: step.name,
              ats: ctx.atsType,
            });
            sidebar?.finish?.("Needs Attention", result.reason ?? "Failed to fill fields.");
            return;
          }
          sidebarReportFill(result?.fillSummary);
        } else {
          const fillSummary = dom.fillAllFields(ctx.defaultEmail, ctx.profile, ctx.job);
          sidebarReportFill(fillSummary);
        }
        continue;
      }

      if (step.name === "CHECK_REQUIRED") {
        const ok = await handleMissingFields(ctx, adapter, step.name);
        if (!ok) {
          sidebar?.finish?.("Needs Attention", "Required fields need manual input.");
          return;
        }
        continue;
      }

      if (step.name === "TRY_SUBMIT") {
        if (ctx.dryRun) {
          await pauseRun(ctx, "DRY_RUN_CONFIRM_SUBMIT", {
            step: step.name,
            ats: ctx.atsType,
            message: "Dry run enabled.",
          });
          sidebar?.finish?.("Needs Attention", "Dry run mode paused before submit.");
          return;
        }
        if (adapter.submit) {
          const result = await adapter.submit(ctx);
          if (result && result.ok === false) {
            await pauseRun(ctx, result.reason ?? "SUBMIT_BUTTON_MISSING", {
              step: step.name,
              ats: ctx.atsType,
            });
            sidebar?.finish?.("Needs Attention", result.reason ?? "Submit button missing.");
            return;
          }
          sidebarReportClick(result?.clickedLabel || "Continue");
          // Wait for the post-submit page/validation to settle before CONFIRM.
          dom.dismissOverlays?.();
          if (dom.waitForDomStable) await dom.waitForDomStable();
        }
        continue;
      }

      if (step.name === "AUTO_ADVANCE") {
        const advanceResult = await runAutoAdvance(ctx, step, adapter);

        if (advanceResult.status === "STOPPED") {
          sidebar?.finish?.("Needs Attention", "Runner paused for manual verification.");
          return;
        }

        if (advanceResult.status === "APPLIED") {
          await completeRun(ctx, "Application submitted by autofill agent.");
          sidebar?.finish?.("Applied", "Application submitted by autofill agent.");
          chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId: ctx.runId });
          return;
        }

        if (advanceResult.status === "NEEDS_ATTENTION") {
          await pauseRun(ctx, advanceResult.reason ?? "REQUIRES_REVIEW", {
            step: step.name,
            ats: ctx.atsType,
            ...(advanceResult.meta ?? {}),
          });
          sidebar?.finish?.(
            "Needs Attention",
            advanceResult.reason === "MANUAL_STOP"
              ? "Runner stopped manually."
              : "Human intervention required."
          );
          return;
        }

        continue;
      }

      if (step.name === "CONFIRM") {
        const confirmed = adapter.confirm ? adapter.confirm(ctx) : false;
        if (confirmed) {
          await completeRun(ctx, "Application submitted by runner.");
          sidebar?.finish?.("Applied", "Application submitted.");
          chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId: ctx.runId });
          return;
        }
        await pauseRun(ctx, "REQUIRES_REVIEW", {
          step: step.name,
          ats: ctx.atsType,
        });
        sidebar?.finish?.("Needs Attention", "Final confirmation requires review.");
        return;
      }
    }

    await retryRun(ctx, "Plan exhausted without confirmation.");
    sidebar?.finish?.("Retry queued", "Plan exhausted without confirmation.");
    chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId: ctx.runId });
  }

  window.JobGeniusEngine = {
    runPlan,
    retryRun,
    pauseRun,
    completeRun,
    logEvent,
  };
})();
