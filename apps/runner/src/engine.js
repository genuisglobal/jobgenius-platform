import { hasCaptcha, hasEmailOtp, hasSmsOtp } from "./signals.js";
import {
  extractRequiredFields,
  uploadResume,
  fillComboboxByValue,
  findComboboxByLabel,
} from "./adapters/base.js";
import { logLine } from "./logger.js";
import {
  sendEvent,
  pauseRun,
  completeRun,
  retryRun,
  fetchVerificationCode,
} from "./api.js";
import { solveCaptcha, isCaptchaServiceConfigured } from "./captcha.js";
import { captureFailureScreenshot } from "./screenshots.js";
import { classifyFields } from "./field-classifier.js";
import { waitForDomStable, dismissOverlays, uploadViaDragDrop } from "./dom-stability.js";

function toBoundedInt(value, fallback, min = 1, max = 20) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

async function capturePageFingerprint(page) {
  return page.evaluate(() => {
    const heading =
      document.querySelector("h1, h2, [role='heading']")?.textContent?.trim() ?? "";
    const requiredCount = document.querySelectorAll(
      "input[required], textarea[required], select[required], input[aria-required='true'], textarea[aria-required='true'], select[aria-required='true']"
    ).length;
    const buttons = Array.from(
      document.querySelectorAll(
        "button, input[type='submit'], input[type='button'], [role='button']"
      )
    )
      .slice(0, 4)
      .map((el) =>
        (
          el.textContent ||
          el.getAttribute("value") ||
          el.getAttribute("aria-label") ||
          el.getAttribute("title") ||
          ""
        )
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
      .join("|");

    return [
      window.location.pathname,
      document.title ?? "",
      heading.slice(0, 120),
      String(requiredCount),
      buttons.slice(0, 240),
    ].join("::");
  });
}

async function emitLearningSignal({
  apiBaseUrl,
  authToken,
  claimToken,
  runnerId,
  ctx,
  page,
  stepName,
  payload,
}) {
  try {
    await sendEvent(
      apiBaseUrl,
      {
        run_id: ctx.runId,
        event_type: "LEARNING_SIGNAL",
        step: stepName,
        message: "Captured automation signal.",
        last_seen_url: page.url(),
        ...payload,
      },
      authToken,
      claimToken,
      runnerId
    );
  } catch (error) {
    logLine({
      level: "WARN",
      runId: ctx.runId,
      step: stepName,
      msg: `Learning signal failed: ${error?.message ?? "unknown error"}`,
    });
  }
}

async function ensureOtpReady({
  apiBaseUrl,
  authToken,
  claimToken,
  runnerId,
  ctx,
  page,
  stepName,
  onProgress,
}) {
  if (await hasSmsOtp(page)) {
    await pauseRun(
      apiBaseUrl,
      {
        run_id: ctx.runId,
        reason: "OTP_SMS",
        message: "SMS verification required.",
        last_seen_url: page.url(),
        step: stepName,
      },
      authToken,
      claimToken,
      runnerId
    );
    onProgress?.({
      type: "PAUSED",
      reason: "OTP_SMS",
      runId: ctx.runId,
      atsType: ctx.atsType,
      step: stepName,
    });
    return false;
  }

  if (!(await hasEmailOtp(page))) {
    return true;
  }

  const code = await fetchVerificationCode(
    apiBaseUrl,
    ctx.jobSeekerId,
    authToken,
    runnerId
  );

  if (!code) {
    await pauseRun(
      apiBaseUrl,
      {
        run_id: ctx.runId,
        reason: "OTP_EMAIL",
        message: "Email verification required and no code was found.",
        last_seen_url: page.url(),
        step: stepName,
      },
      authToken,
      claimToken,
      runnerId
    );
    onProgress?.({
      type: "PAUSED",
      reason: "OTP_EMAIL",
      runId: ctx.runId,
      atsType: ctx.atsType,
      step: stepName,
    });
    return false;
  }

  const otpInput = await page.$(
    'input[type="text"][name*="code"], input[type="text"][name*="otp"], input[type="text"][name*="verif"], input[type="number"][name*="code"], input[autocomplete="one-time-code"]'
  );

  if (!otpInput) {
    await pauseRun(
      apiBaseUrl,
      {
        run_id: ctx.runId,
        reason: "OTP_EMAIL",
        message: "Verification input not found.",
        last_seen_url: page.url(),
        step: stepName,
      },
      authToken,
      claimToken,
      runnerId
    );
    onProgress?.({
      type: "PAUSED",
      reason: "OTP_EMAIL",
      runId: ctx.runId,
      atsType: ctx.atsType,
      step: stepName,
    });
    return false;
  }

  await otpInput.fill(code);
  const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
  if (submitBtn) {
    await submitBtn.click();
    await page.waitForTimeout(3000);
  }

  logLine({
    level: "INFO",
    runId: ctx.runId,
    step: stepName,
    msg: "Verification code entered.",
  });

  return true;
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

async function runAutoAdvance({
  apiBaseUrl,
  authToken,
  claimToken,
  runnerId,
  page,
  adapter,
  ctx,
  step,
  onProgress,
}) {
  const { maxIterations, maxNoProgressRounds } = getAutomationConfig(ctx, step);
  let noProgressRounds = 0;

  for (let attempt = 1; attempt <= maxIterations; attempt += 1) {
    if (adapter.confirm && (await adapter.confirm(page, ctx))) {
      return { status: "APPLIED" };
    }

    if (await hasCaptcha(page)) {
      if (isCaptchaServiceConfigured()) {
        const solveResult = await solveCaptcha(page);
        if (solveResult.solved) {
          await page.waitForTimeout(2000);
          // Re-check if captcha is gone
          if (!(await hasCaptcha(page))) {
            continue; // CAPTCHA solved, continue auto-advance loop
          }
        }
      }
      return {
        status: "NEEDS_ATTENTION",
        reason: "CAPTCHA",
        meta: { attempt },
      };
    }

    const otpReady = await ensureOtpReady({
      apiBaseUrl,
      authToken,
      claimToken,
      runnerId,
      ctx,
      page,
      stepName: step.name,
      onProgress,
    });
    if (!otpReady) {
      return { status: "STOPPED" };
    }

    const fillResult = await adapter.fillKnownFields(page, ctx);
    if (fillResult?.ok === false) {
      return {
        status: "NEEDS_ATTENTION",
        reason: fillResult.reason ?? "FILL_FAILED",
        meta: { attempt },
      };
    }

    let missingFields = adapter.extractRequiredFields
      ? await adapter.extractRequiredFields(page)
      : await extractRequiredFields(page);

    if (missingFields.length > 0) {
      // Resolve via learned-rule cache → screening answers → LLM, and learn
      // from any LLM result so the next application is a cache hit.
      let urlHost = "";
      try {
        urlHost = new URL(page.url()).hostname.toLowerCase();
      } catch {
        urlHost = "";
      }
      const classifiedValues = await classifyFields(
        missingFields,
        ctx.profile,
        ctx.screeningAnswers ?? [],
        ctx.job ?? null,
        { apiBaseUrl, authToken, claimToken, runnerId, atsType: ctx.atsType, urlHost }
      );
      if (Object.keys(classifiedValues).length > 0) {
        await fillClassifiedFields(page, classifiedValues);
        await page.waitForTimeout(500);
        // Re-check
        missingFields = adapter.extractRequiredFields
          ? await adapter.extractRequiredFields(page)
          : await extractRequiredFields(page);
      }
    }

    if (missingFields.length > 0) {
      return {
        status: "NEEDS_ATTENTION",
        reason: "REQUIRED_FIELDS",
        meta: {
          attempt,
          missing_fields: missingFields,
        },
      };
    }

    if (ctx.dryRun) {
      return {
        status: "NEEDS_ATTENTION",
        reason: "DRY_RUN_CONFIRM_SUBMIT",
        meta: { attempt },
      };
    }

    const beforeFingerprint = await capturePageFingerprint(page);
    const submitResult = await adapter.submit(page, ctx);

    if (submitResult?.ok === false) {
      if (submitResult.reason === "SUBMIT_BUTTON_MISSING") {
        break;
      }
      return {
        status: "NEEDS_ATTENTION",
        reason: submitResult.reason ?? "SUBMIT_BUTTON_MISSING",
        meta: { attempt },
      };
    }

    await page.waitForTimeout(1300);
    await waitForDomStable(page);
    await dismissOverlays(page);
    const afterFingerprint = await capturePageFingerprint(page);
    const progressed = beforeFingerprint !== afterFingerprint;

    await emitLearningSignal({
      apiBaseUrl,
      authToken,
      claimToken,
      runnerId,
      ctx,
      page,
      stepName: step.name,
      payload: {
        meta: {
          ats: ctx.atsType,
          attempt,
          progressed,
          no_progress_rounds: noProgressRounds,
          automation_mode: "cloud_autofill",
        },
      },
    });

    if (!progressed) {
      noProgressRounds += 1;
      if (noProgressRounds >= maxNoProgressRounds) {
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

  if (adapter.confirm && (await adapter.confirm(page, ctx))) {
    return { status: "APPLIED" };
  }

  return { status: "REVIEW_REQUIRED" };
}

async function fillClassifiedFields(page, classifiedValues) {
  for (const [label, value] of Object.entries(classifiedValues)) {
    if (!value) continue;
    try {
      // Find input by label text
      const input = await page.evaluateHandle(
        ({ label }) => {
          const labels = Array.from(document.querySelectorAll("label"));
          for (const lbl of labels) {
            if (lbl.textContent?.trim().toLowerCase().includes(label.toLowerCase())) {
              const forId = lbl.getAttribute("for");
              if (forId) {
                const target = document.getElementById(forId);
                if (target) return target;
              }
              const input = lbl.querySelector("input, textarea, select");
              if (input) return input;
            }
          }
          // Fallback: aria-label match
          const all = document.querySelectorAll("input, textarea, select");
          for (const el of all) {
            const aria = el.getAttribute("aria-label") ?? "";
            const name = el.getAttribute("name") ?? "";
            const placeholder = el.getAttribute("placeholder") ?? "";
            const hint = [aria, name, placeholder].join(" ").toLowerCase();
            if (hint.includes(label.toLowerCase())) return el;
          }
          return null;
        },
        { label }
      );

      const element = input.asElement();
      if (!element) {
        // No native input/select matched — the field may be an ARIA
        // combobox/listbox widget (Workday, Ashby, react-select), which must
        // be driven open→option-click rather than value-set.
        const combo = await findComboboxByLabel(page, label);
        if (combo) await fillComboboxByValue(page, combo, value);
        continue;
      }

      const isComboInput = await element
        .evaluate((el) => {
          const role = (el.getAttribute("role") || "").toLowerCase();
          return (
            role === "combobox" ||
            Boolean(el.getAttribute("aria-autocomplete")) ||
            (el.getAttribute("aria-haspopup") || "").toLowerCase() === "listbox" ||
            Boolean(el.closest("[role='combobox']"))
          );
        })
        .catch(() => false);
      if (isComboInput) {
        // fill() alone LOOKS filled but never commits to the widget's state.
        if (await fillComboboxByValue(page, element, value)) continue;
      }

      const tagName = await element.evaluate((el) => el.tagName.toLowerCase());
      if (tagName === "select") {
        await element.selectOption({ label: value }).catch(() =>
          element.selectOption({ value }).catch(() => null)
        );
      } else {
        await element.fill(value);
      }
    } catch {
      // Best-effort fill
    }
  }
}

export async function runPlan({
  apiBaseUrl,
  authToken,
  defaultEmail,
  runnerId,
  run,
  claimToken,
  plan,
  adapter,
  fallbackAdapter,
  page,
  context,
  dryRun,
  onProgress,
  resumePath,
  profile,
  screeningAnswers,
  job,
  atsAccount,
}) {
  void context;

  const automation = plan?.metadata?.automation ?? {};

  const ctx = {
    runId: run.run_id,
    jobSeekerId: run.job_seeker_id,
    atsType: run.ats_type,
    currentStep: "INIT",
    defaultEmail: defaultEmail ?? "",
    dryRun,
    resumePath: resumePath ?? null,
    profile: profile ?? null,
    screeningAnswers: screeningAnswers ?? [],
    job: job ?? run.job ?? null,
    // Per-tenant ATS credentials (Workday): { email, password, created,
    // markFailed() }. Fetched by the worker from /api/apply/ats-account.
    atsAccount: atsAccount ?? null,
    // Bound snapshot helper so adapters can capture per-wizard-page evidence
    // (Workday's multi-step flow) without holding API credentials themselves.
    captureSnapshot: (step, reason) =>
      captureFailureScreenshot(page, {
        runId: run.run_id,
        step: step ?? "SNAPSHOT",
        reason: reason ?? "STEP_SNAPSHOT",
        apiBaseUrl,
        authToken,
        runnerId,
      }).catch(() => null),
    automation: {
      maxAutoAdvanceSteps: toBoundedInt(
        automation.max_auto_advance_steps,
        7,
        1,
        20
      ),
      maxNoProgressRounds: toBoundedInt(
        automation.max_no_progress_rounds,
        2,
        1,
        5
      ),
      buttonHints: Array.isArray(automation.button_hints)
        ? automation.button_hints
        : [],
      applyEntryHints: Array.isArray(automation.apply_entry_hints)
        ? automation.apply_entry_hints
        : [],
      requiresApplyEntry: Boolean(automation.requires_apply_entry),
      preferPopupHandoff: Boolean(automation.prefer_popup_handoff),
      hostRuleId:
        typeof automation.rule_id === "string" ? automation.rule_id : null,
      urlHost:
        typeof automation.url_host === "string" ? automation.url_host : null,
    },
  };

  ctx.buttonHints = ctx.automation.buttonHints;
  ctx.applyEntryHints = ctx.automation.applyEntryHints;
  let activeAdapter = adapter ?? null;
  const genericFallback =
    fallbackAdapter && fallbackAdapter.name !== activeAdapter?.name
      ? fallbackAdapter
      : null;

  if (!activeAdapter && genericFallback) {
    activeAdapter = genericFallback;
    ctx.atsType = genericFallback.name;
  }

  await sendEvent(
    apiBaseUrl,
    {
      run_id: ctx.runId,
      event_type: "RUNNER_STARTED",
      message: `Cloud runner started on ${ctx.atsType}.`,
      step: ctx.currentStep,
      last_seen_url: page.url(),
    },
    authToken,
    claimToken,
    runnerId
  );
  onProgress?.({
    type: "RUNNER_STARTED",
    runId: ctx.runId,
    atsType: ctx.atsType,
    step: ctx.currentStep,
  });

  if (!activeAdapter) {
    await pauseRun(
      apiBaseUrl,
      {
        run_id: ctx.runId,
        reason: "UNKNOWN_ATS",
        message: "Adapter not found.",
        last_seen_url: page.url(),
        step: "DETECT_ATS",
      },
      authToken,
      claimToken,
      runnerId
    );
    onProgress?.({
      type: "PAUSED",
      reason: "UNKNOWN_ATS",
      runId: ctx.runId,
      atsType: ctx.atsType,
      step: "DETECT_ATS",
    });
    return;
  }

  // Dismiss any overlays (cookie banners, modals) before starting
  await dismissOverlays(page);
  await waitForDomStable(page);

  if (await hasCaptcha(page)) {
    let captchaSolved = false;
    if (isCaptchaServiceConfigured()) {
      const solveResult = await solveCaptcha(page);
      captchaSolved = solveResult.solved;
      if (captchaSolved) await page.waitForTimeout(2000);
    }
    if (!captchaSolved || (await hasCaptcha(page))) {
      await captureFailureScreenshot(page, {
        runId: ctx.runId, step: "DETECT_ATS", reason: "CAPTCHA",
        apiBaseUrl, authToken, runnerId,
      });
      await pauseRun(
        apiBaseUrl,
        {
          run_id: ctx.runId,
          reason: "CAPTCHA",
          message: "Captcha detected.",
          last_seen_url: page.url(),
          step: "DETECT_ATS",
        },
        authToken,
        claimToken,
        runnerId
      );
      onProgress?.({
        type: "PAUSED",
        reason: "CAPTCHA",
        runId: ctx.runId,
        atsType: ctx.atsType,
        step: "DETECT_ATS",
      });
      return;
    }
  }

  const otpReady = await ensureOtpReady({
    apiBaseUrl,
    authToken,
    claimToken,
    runnerId,
    ctx,
    page,
    stepName: "DETECT_ATS",
    onProgress,
  });
  if (!otpReady) {
    return;
  }

  for (const step of plan.steps ?? []) {
    ctx.currentStep = step.name;
    await sendEvent(
      apiBaseUrl,
      {
        run_id: ctx.runId,
        event_type: "STEP_STARTED",
        step: step.name,
        message: `Starting ${step.name}.`,
        last_seen_url: page.url(),
      },
      authToken,
      claimToken,
      runnerId
    );
    onProgress?.({
      type: "STEP_STARTED",
      runId: ctx.runId,
      atsType: ctx.atsType,
      step: step.name,
    });

    if (step.name === "OPEN_URL") {
      await waitForDomStable(page);
      await dismissOverlays(page);
      continue;
    }

    if (step.name === "DETECT_ATS") {
      const detected = await activeAdapter.detect(page);
      if (!detected) {
        if (genericFallback) {
          activeAdapter = genericFallback;
          ctx.atsType = genericFallback.name;
          await sendEvent(
            apiBaseUrl,
            {
              run_id: ctx.runId,
              event_type: "INFO",
              step: step.name,
              message: `Falling back to ${genericFallback.name} adapter.`,
              last_seen_url: page.url(),
            },
            authToken,
            claimToken,
            runnerId
          );
          continue;
        }
        await pauseRun(
          apiBaseUrl,
          {
            run_id: ctx.runId,
            reason: "UNKNOWN_ATS",
            message: "ATS not detected.",
            last_seen_url: page.url(),
            step: step.name,
          },
          authToken,
          claimToken,
          runnerId
        );
        onProgress?.({
          type: "PAUSED",
          reason: "UNKNOWN_ATS",
          runId: ctx.runId,
          atsType: ctx.atsType,
          step: step.name,
        });
        return;
      }
      continue;
    }

    if (step.name === "TRY_APPLY_ENTRY") {
      const result = await activeAdapter.clickApplyEntry(page, ctx);
      if (result?.ok === false) {
        await captureFailureScreenshot(page, {
          runId: ctx.runId, step: step.name, reason: result.reason ?? "APPLY_BUTTON_MISSING",
          apiBaseUrl, authToken, runnerId,
        });
        await pauseRun(
          apiBaseUrl,
          {
            run_id: ctx.runId,
            reason: result.reason ?? "APPLY_BUTTON_MISSING",
            message: "Apply entry not found.",
            last_seen_url: page.url(),
            step: step.name,
          },
          authToken,
          claimToken,
          runnerId
        );
        onProgress?.({
          type: "PAUSED",
          reason: result.reason ?? "APPLY_BUTTON_MISSING",
          runId: ctx.runId,
          atsType: ctx.atsType,
          step: step.name,
        });
        return;
      }
      if (result?.nextPage) {
        page = result.nextPage;
        await sendEvent(
          apiBaseUrl,
          {
            run_id: ctx.runId,
            event_type: "INFO",
            step: step.name,
            message: "Switched to application tab after apply entry click.",
            last_seen_url: page.url(),
          },
          authToken,
          claimToken,
          runnerId
        );
      }
      continue;
    }

    if (step.name === "EXTRACT_FIELDS") {
      ctx.missingFields = activeAdapter.extractRequiredFields
        ? await activeAdapter.extractRequiredFields(page)
        : await extractRequiredFields(page);
      continue;
    }

    if (step.name === "FILL_KNOWN") {
      const result = await activeAdapter.fillKnownFields(page, ctx);
      if (result?.ok === false) {
        await pauseRun(
          apiBaseUrl,
          {
            run_id: ctx.runId,
            reason: result.reason ?? "FILL_FAILED",
            message: "Failed to fill fields.",
            last_seen_url: page.url(),
            step: step.name,
          },
          authToken,
          claimToken,
          runnerId
        );
        onProgress?.({
          type: "PAUSED",
          reason: result.reason ?? "FILL_FAILED",
          runId: ctx.runId,
          atsType: ctx.atsType,
          step: step.name,
        });
        return;
      }
      if (ctx.resumePath) {
        let uploadResult = activeAdapter.uploadResume
          ? await activeAdapter.uploadResume(page, ctx)
          : await uploadResume(page, ctx.resumePath);
        // Fallback to drag-and-drop upload if standard file input not found
        if (uploadResult?.ok === false && uploadResult.reason === "NO_INPUT_OR_URL") {
          uploadResult = await uploadViaDragDrop(page, ctx.resumePath);
        }
        if (
          uploadResult?.ok === false &&
          uploadResult.reason !== "NO_INPUT_OR_URL" &&
          uploadResult.reason !== "NO_UPLOAD_ELEMENT"
        ) {
          logLine({
            level: "WARN",
            runId: ctx.runId,
            step: step.name,
            msg: `Resume upload failed (${uploadResult.reason}).`,
          });
        }
      }
      continue;
    }

    if (step.name === "CHECK_REQUIRED") {
      let missingFields = activeAdapter.extractRequiredFields
        ? await activeAdapter.extractRequiredFields(page)
        : await extractRequiredFields(page);
      // Try LLM classifier + screening answers before pausing
      if (missingFields.length > 0) {
        const classifiedValues = await classifyFields(
          missingFields,
          ctx.profile,
          ctx.screeningAnswers ?? [],
          ctx.job ?? null
        );
        if (Object.keys(classifiedValues).length > 0) {
          await fillClassifiedFields(page, classifiedValues);
          await page.waitForTimeout(500);
          missingFields = activeAdapter.extractRequiredFields
            ? await activeAdapter.extractRequiredFields(page)
            : await extractRequiredFields(page);
        }
      }
      if (missingFields.length > 0) {
        await captureFailureScreenshot(page, {
          runId: ctx.runId, step: step.name, reason: "REQUIRED_FIELDS",
          apiBaseUrl, authToken, runnerId,
        });
        await pauseRun(
          apiBaseUrl,
          {
            run_id: ctx.runId,
            reason: "REQUIRED_FIELDS",
            message: "Required fields missing.",
            last_seen_url: page.url(),
            step: step.name,
            meta: {
              missing_fields: missingFields,
              ats: ctx.atsType,
              step: step.name,
            },
          },
          authToken,
          claimToken,
          runnerId
        );
        onProgress?.({
          type: "PAUSED",
          reason: "REQUIRED_FIELDS",
          runId: ctx.runId,
          atsType: ctx.atsType,
          step: step.name,
          meta: { missing_fields: missingFields },
        });
        return;
      }
      continue;
    }

    if (step.name === "TRY_SUBMIT") {
      if (dryRun) {
        await pauseRun(
          apiBaseUrl,
          {
            run_id: ctx.runId,
            reason: "DRY_RUN_CONFIRM_SUBMIT",
            message: "Dry run enabled.",
            last_seen_url: page.url(),
            step: step.name,
          },
          authToken,
          claimToken,
          runnerId
        );
        onProgress?.({
          type: "PAUSED",
          reason: "DRY_RUN_CONFIRM_SUBMIT",
          runId: ctx.runId,
          atsType: ctx.atsType,
          step: step.name,
        });
        return;
      }
      const result = await activeAdapter.submit(page, ctx);
      if (result?.ok === false) {
        await captureFailureScreenshot(page, {
          runId: ctx.runId, step: step.name, reason: result.reason ?? "SUBMIT_BUTTON_MISSING",
          apiBaseUrl, authToken, runnerId,
        });
        await pauseRun(
          apiBaseUrl,
          {
            run_id: ctx.runId,
            reason: result.reason ?? "SUBMIT_BUTTON_MISSING",
            message: "Submit not available.",
            last_seen_url: page.url(),
            step: step.name,
          },
          authToken,
          claimToken,
          runnerId
        );
        onProgress?.({
          type: "PAUSED",
          reason: result.reason ?? "SUBMIT_BUTTON_MISSING",
          runId: ctx.runId,
          atsType: ctx.atsType,
          step: step.name,
        });
        return;
      }
      continue;
    }

    if (step.name === "AUTO_ADVANCE") {
      const advanceResult = await runAutoAdvance({
        apiBaseUrl,
        authToken,
        claimToken,
        runnerId,
        page,
        adapter: activeAdapter,
        ctx,
        step,
        onProgress,
      });

      if (advanceResult.status === "STOPPED") {
        return;
      }

      if (advanceResult.status === "APPLIED") {
        await completeRun(
          apiBaseUrl,
          {
            run_id: ctx.runId,
            note: "Application submitted by cloud autofill agent.",
            last_seen_url: page.url(),
          },
          authToken,
          claimToken,
          runnerId
        );
        onProgress?.({
          type: "COMPLETED",
          runId: ctx.runId,
          atsType: ctx.atsType,
          step: step.name,
        });
        logLine({ level: "INFO", runId: ctx.runId, step: step.name, msg: "Applied" });
        return;
      }

      if (advanceResult.status === "NEEDS_ATTENTION") {
        await captureFailureScreenshot(page, {
          runId: ctx.runId, step: step.name, reason: advanceResult.reason ?? "REQUIRES_REVIEW",
          apiBaseUrl, authToken, runnerId,
        });
        await pauseRun(
          apiBaseUrl,
          {
            run_id: ctx.runId,
            reason: advanceResult.reason ?? "REQUIRES_REVIEW",
            message: "Autofill agent hit a wall.",
            last_seen_url: page.url(),
            step: step.name,
            meta: {
              ats: ctx.atsType,
              ...(advanceResult.meta ?? {}),
            },
          },
          authToken,
          claimToken,
          runnerId
        );
        onProgress?.({
          type: "PAUSED",
          reason: advanceResult.reason ?? "REQUIRES_REVIEW",
          runId: ctx.runId,
          atsType: ctx.atsType,
          step: step.name,
          meta: advanceResult.meta ?? undefined,
        });
        return;
      }

      continue;
    }

    if (step.name === "CONFIRM") {
      const confirmed = activeAdapter.confirm
        ? await activeAdapter.confirm(page, ctx)
        : false;
      if (confirmed) {
        await completeRun(
          apiBaseUrl,
          {
            run_id: ctx.runId,
            note: "Application submitted by cloud runner.",
            last_seen_url: page.url(),
          },
          authToken,
          claimToken,
          runnerId
        );
        onProgress?.({
          type: "COMPLETED",
          runId: ctx.runId,
          atsType: ctx.atsType,
          step: step.name,
        });
        logLine({ level: "INFO", runId: ctx.runId, step: step.name, msg: "Applied" });
        return;
      }

      await captureFailureScreenshot(page, {
        runId: ctx.runId, step: step.name, reason: "REQUIRES_REVIEW",
        apiBaseUrl, authToken, runnerId,
      });
      await pauseRun(
        apiBaseUrl,
        {
          run_id: ctx.runId,
          reason: "REQUIRES_REVIEW",
          message: "Confirmation not detected.",
          last_seen_url: page.url(),
          step: step.name,
        },
        authToken,
        claimToken,
        runnerId
      );
      onProgress?.({
        type: "PAUSED",
        reason: "REQUIRES_REVIEW",
        runId: ctx.runId,
        atsType: ctx.atsType,
        step: step.name,
      });
      return;
    }
  }

  await retryRun(
    apiBaseUrl,
    {
      run_id: ctx.runId,
      note: "Plan exhausted without confirmation.",
    },
    authToken,
    claimToken,
    runnerId
  );
  onProgress?.({
    type: "RETRIED",
    reason: "PLAN_EXHAUSTED",
    runId: ctx.runId,
    atsType: ctx.atsType,
  });
}
