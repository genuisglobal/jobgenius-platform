import { chromium } from "playwright";

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

function readNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function createBrowserSession() {
  const headless = readBoolean(process.env.PLAYWRIGHT_HEADLESS, true);
  const slowMo = readNumber(process.env.PLAYWRIGHT_SLOW_MO_MS, 0);
  const navigationTimeoutMs = readNumber(process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT_MS, 45000);
  const actionTimeoutMs = readNumber(process.env.PLAYWRIGHT_ACTION_TIMEOUT_MS, 15000);

  const browser = await chromium.launch({
    headless,
    slowMo,
  });

  const context = await browser.newContext({
    acceptDownloads: false,
    viewport: { width: 1440, height: 1024 },
  });

  const page = await context.newPage();
  page.setDefaultNavigationTimeout(navigationTimeoutMs);
  page.setDefaultTimeout(actionTimeoutMs);

  return { browser, context, page };
}
