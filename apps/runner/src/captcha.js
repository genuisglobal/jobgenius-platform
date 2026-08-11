/**
 * CAPTCHA solving service integration for the cloud runner.
 *
 * Supports 2Captcha / CapSolver / Anti-Captcha via a unified interface.
 * Set CAPTCHA_SERVICE (2captcha | capsolver | anticaptcha) and CAPTCHA_API_KEY.
 */

import { logLine } from "./logger.js";

const CAPTCHA_SERVICE = (process.env.CAPTCHA_SERVICE ?? "").toLowerCase();
const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY ?? "";
const CAPTCHA_TIMEOUT_MS = Number(process.env.CAPTCHA_TIMEOUT_MS ?? 120000);
const CAPTCHA_POLL_MS = Number(process.env.CAPTCHA_POLL_MS ?? 5000);

export function isCaptchaServiceConfigured() {
  return Boolean(CAPTCHA_API_KEY && CAPTCHA_SERVICE);
}

/**
 * Attempt to solve a CAPTCHA on the current page.
 * Returns { solved: true } if successful, { solved: false, reason } otherwise.
 */
export async function solveCaptcha(page) {
  if (!isCaptchaServiceConfigured()) {
    return { solved: false, reason: "CAPTCHA_SERVICE_NOT_CONFIGURED" };
  }

  const captchaInfo = await detectCaptchaType(page);
  if (!captchaInfo) {
    return { solved: false, reason: "CAPTCHA_TYPE_UNKNOWN" };
  }

  logLine({
    level: "INFO",
    step: "CAPTCHA",
    msg: `Detected ${captchaInfo.type} captcha, sending to ${CAPTCHA_SERVICE}.`,
  });

  try {
    if (captchaInfo.type === "recaptcha_v2") {
      return await solveRecaptchaV2(page, captchaInfo);
    }
    if (captchaInfo.type === "hcaptcha") {
      return await solveHCaptcha(page, captchaInfo);
    }
    if (captchaInfo.type === "turnstile") {
      return await solveTurnstile(page, captchaInfo);
    }
    return { solved: false, reason: "CAPTCHA_TYPE_UNSUPPORTED" };
  } catch (error) {
    logLine({
      level: "WARN",
      step: "CAPTCHA",
      msg: `CAPTCHA solve failed: ${error?.message ?? "unknown"}`,
    });
    return { solved: false, reason: "CAPTCHA_SOLVE_ERROR" };
  }
}

async function detectCaptchaType(page) {
  return page.evaluate(() => {
    // reCAPTCHA v2
    const recaptchaEl = document.querySelector(".g-recaptcha[data-sitekey]");
    if (recaptchaEl) {
      return {
        type: "recaptcha_v2",
        siteKey: recaptchaEl.getAttribute("data-sitekey"),
      };
    }

    const recaptchaIframe = document.querySelector(
      "iframe[src*='recaptcha/api2/anchor'], iframe[src*='recaptcha/enterprise']"
    );
    if (recaptchaIframe) {
      const src = recaptchaIframe.getAttribute("src") ?? "";
      const match = src.match(/[?&]k=([^&]+)/);
      return {
        type: "recaptcha_v2",
        siteKey: match?.[1] ?? null,
      };
    }

    // hCaptcha
    const hcaptchaEl = document.querySelector(".h-captcha[data-sitekey]");
    if (hcaptchaEl) {
      return {
        type: "hcaptcha",
        siteKey: hcaptchaEl.getAttribute("data-sitekey"),
      };
    }

    const hcaptchaIframe = document.querySelector("iframe[src*='hcaptcha.com']");
    if (hcaptchaIframe) {
      const src = hcaptchaIframe.getAttribute("src") ?? "";
      const match = src.match(/sitekey=([^&]+)/);
      return {
        type: "hcaptcha",
        siteKey: match?.[1] ?? null,
      };
    }

    // Turnstile
    const turnstileEl = document.querySelector(".cf-turnstile[data-sitekey]");
    if (turnstileEl) {
      return {
        type: "turnstile",
        siteKey: turnstileEl.getAttribute("data-sitekey"),
      };
    }

    return null;
  });
}

// ─── 2Captcha / CapSolver / Anti-Captcha API wrappers ───

function getApiEndpoints() {
  if (CAPTCHA_SERVICE === "capsolver") {
    return {
      create: "https://api.capsolver.com/createTask",
      result: "https://api.capsolver.com/getTaskResult",
    };
  }
  if (CAPTCHA_SERVICE === "anticaptcha") {
    return {
      create: "https://api.anti-captcha.com/createTask",
      result: "https://api.anti-captcha.com/getTaskResult",
    };
  }
  // Default: 2captcha (uses compatible JSON API)
  return {
    create: "https://api.2captcha.com/createTask",
    result: "https://api.2captcha.com/getTaskResult",
  };
}

async function createTask(taskPayload) {
  const endpoints = getApiEndpoints();
  const body = {
    clientKey: CAPTCHA_API_KEY,
    task: taskPayload,
  };
  const response = await fetch(endpoints.create, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (data.errorId && data.errorId !== 0) {
    throw new Error(`CAPTCHA create failed: ${data.errorDescription ?? data.errorCode ?? "unknown"}`);
  }
  return data.taskId;
}

async function pollTaskResult(taskId) {
  const endpoints = getApiEndpoints();
  const startedAt = Date.now();

  while (Date.now() - startedAt < CAPTCHA_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, CAPTCHA_POLL_MS));
    const response = await fetch(endpoints.result, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientKey: CAPTCHA_API_KEY, taskId }),
    });
    const data = await response.json();

    if (data.errorId && data.errorId !== 0) {
      throw new Error(`CAPTCHA poll failed: ${data.errorDescription ?? data.errorCode ?? "unknown"}`);
    }

    if (data.status === "ready") {
      return data.solution;
    }
  }

  throw new Error("CAPTCHA solve timed out.");
}

async function injectToken(page, token, type) {
  await page.evaluate(
    ({ token, type }) => {
      if (type === "recaptcha_v2") {
        const textarea = document.querySelector("#g-recaptcha-response, textarea[name='g-recaptcha-response']");
        if (textarea) {
          textarea.value = token;
          textarea.style.display = "block";
        }
        if (typeof window.___grecaptcha_cfg !== "undefined") {
          try {
            const callbacks = Object.values(window.___grecaptcha_cfg?.clients ?? {});
            for (const client of callbacks) {
              const cb = client?.rr?.l?.callback ?? client?.KN?.l?.callback;
              if (typeof cb === "function") cb(token);
            }
          } catch {}
        }
      } else if (type === "hcaptcha") {
        const textarea = document.querySelector("textarea[name='h-captcha-response'], textarea[name='g-recaptcha-response']");
        if (textarea) textarea.value = token;
        if (typeof window.hcaptcha !== "undefined") {
          try { window.hcaptcha.execute?.(); } catch {}
        }
      } else if (type === "turnstile") {
        const input = document.querySelector("input[name='cf-turnstile-response']");
        if (input) input.value = token;
        const callbacks = document.querySelectorAll("[data-callback]");
        for (const el of callbacks) {
          const fnName = el.getAttribute("data-callback");
          if (typeof window[fnName] === "function") window[fnName](token);
        }
      }

      // Try submitting the nearest form after injecting
      const form = document.querySelector("form");
      if (form) {
        const submit = form.querySelector("button[type='submit'], input[type='submit']");
        if (submit) submit.click();
      }
    },
    { token, type }
  );

  await page.waitForTimeout(2000);
  return { solved: true };
}

async function solveRecaptchaV2(page, info) {
  if (!info.siteKey) return { solved: false, reason: "RECAPTCHA_SITEKEY_MISSING" };
  const taskId = await createTask({
    type: CAPTCHA_SERVICE === "capsolver" ? "ReCaptchaV2TaskProxyLess" : "RecaptchaV2TaskProxyless",
    websiteURL: page.url(),
    websiteKey: info.siteKey,
  });
  const solution = await pollTaskResult(taskId);
  return injectToken(page, solution.gRecaptchaResponse ?? solution.token, "recaptcha_v2");
}

async function solveHCaptcha(page, info) {
  if (!info.siteKey) return { solved: false, reason: "HCAPTCHA_SITEKEY_MISSING" };
  const taskId = await createTask({
    type: CAPTCHA_SERVICE === "capsolver" ? "HCaptchaTaskProxyLess" : "HCaptchaTaskProxyless",
    websiteURL: page.url(),
    websiteKey: info.siteKey,
  });
  const solution = await pollTaskResult(taskId);
  return injectToken(page, solution.gRecaptchaResponse ?? solution.token, "hcaptcha");
}

async function solveTurnstile(page, info) {
  if (!info.siteKey) return { solved: false, reason: "TURNSTILE_SITEKEY_MISSING" };
  const taskId = await createTask({
    type: CAPTCHA_SERVICE === "capsolver" ? "AntiTurnstileTaskProxyLess" : "TurnstileTaskProxyless",
    websiteURL: page.url(),
    websiteKey: info.siteKey,
  });
  const solution = await pollTaskResult(taskId);
  return injectToken(page, solution.token ?? solution.gRecaptchaResponse, "turnstile");
}
