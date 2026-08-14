/**
 * DOM stability utilities for the cloud Playwright runner.
 *
 * Waits for the DOM to stabilize after navigation or interaction,
 * handles modals/overlays, and supports drag-and-drop uploads.
 */

import { logLine } from "./logger.js";

const STABILITY_TIMEOUT_MS = Number(process.env.DOM_STABILITY_TIMEOUT_MS ?? 8000);
const STABILITY_IDLE_MS = Number(process.env.DOM_STABILITY_IDLE_MS ?? 800);

/**
 * Wait for the DOM to stop mutating (no new nodes for STABILITY_IDLE_MS).
 * Much more reliable than fixed waitForTimeout for SPAs.
 */
export async function waitForDomStable(page, timeoutMs = STABILITY_TIMEOUT_MS) {
  try {
    await page.evaluate(
      ({ idleMs, totalMs }) => {
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

          observer.observe(document.body ?? document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
          });

          // Kick off the idle timer immediately in case DOM is already stable
          timer = setTimeout(() => {
            observer.disconnect();
            clearTimeout(deadline);
            resolve();
          }, idleMs);
        });
      },
      { idleMs: STABILITY_IDLE_MS, totalMs: timeoutMs }
    );
  } catch {
    // Page navigation or crash; safe to continue.
  }
}

/**
 * Detect and dismiss common blocking overlays/modals.
 * Returns true if a modal was dismissed.
 */
export async function dismissOverlays(page) {
  return page
    .evaluate(() => {
      let dismissed = false;

      // Cookie consent banners
      const cookieSelectors = [
        "button[id*='cookie' i][id*='accept' i]",
        "button[class*='cookie' i][class*='accept' i]",
        "button[aria-label*='accept' i][aria-label*='cookie' i]",
        "#onetrust-accept-btn-handler",
        ".cc-dismiss",
        ".cc-btn.cc-allow",
        "[data-testid='cookie-accept']",
      ];
      for (const sel of cookieSelectors) {
        const btn = document.querySelector(sel);
        if (btn instanceof HTMLElement && btn.offsetParent !== null) {
          btn.click();
          dismissed = true;
          break;
        }
      }

      // Generic close buttons on modals
      const modalCloseSelectors = [
        "[role='dialog'] button[aria-label*='close' i]",
        "[role='dialog'] button[aria-label*='dismiss' i]",
        ".modal button.close",
        ".modal-close",
        "[data-dismiss='modal']",
        "button[class*='modal-close']",
      ];
      for (const sel of modalCloseSelectors) {
        const btn = document.querySelector(sel);
        if (btn instanceof HTMLElement && btn.offsetParent !== null) {
          btn.click();
          dismissed = true;
          break;
        }
      }

      // Sign-in prompts (dismiss, don't sign in)
      const signInDismiss = document.querySelector(
        "[role='dialog'] button[aria-label*='dismiss' i], " +
        ".signin-prompt button.close, " +
        ".login-prompt button.close"
      );
      if (signInDismiss instanceof HTMLElement && signInDismiss.offsetParent !== null) {
        signInDismiss.click();
        dismissed = true;
      }

      return dismissed;
    })
    .catch(() => false);
}

/**
 * Upload a file via drag-and-drop zone detection.
 * Falls back to standard input[type='file'] if no drop zone found.
 */
export async function uploadViaDragDrop(page, filePath) {
  if (!filePath) return { ok: false, reason: "NO_FILE_PATH" };

  // First, try standard file input
  const standardInput = await page.$("input[type='file']");
  if (standardInput) {
    await standardInput.setInputFiles(filePath);
    return { ok: true, method: "file_input" };
  }

  // Detect drag-and-drop zones
  const dropZone = await page.$(
    "[class*='dropzone'], [class*='drop-zone'], [class*='upload-area'], " +
    "[class*='file-upload'], [class*='drag-drop'], " +
    "[data-testid*='upload'], [data-testid*='dropzone'], " +
    "[role='button'][aria-label*='upload' i], " +
    "[role='button'][aria-label*='drag' i], " +
    ".dz-clickable, .filepond--root"
  );

  if (dropZone) {
    try {
      // Create a DataTransfer-like event using Playwright's file chooser
      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null),
        dropZone.click(),
      ]);

      if (fileChooser) {
        await fileChooser.setFiles(filePath);
        return { ok: true, method: "drop_zone_click" };
      }

      // Direct dispatch approach
      await page.evaluate(
        async ({ selector }) => {
          const zone = document.querySelector(selector);
          if (!zone) return;
          // Trigger drag events to activate the drop zone
          const events = ["dragenter", "dragover", "drop"];
          for (const eventName of events) {
            zone.dispatchEvent(
              new DragEvent(eventName, { bubbles: true, cancelable: true })
            );
          }
        },
        {
          selector:
            "[class*='dropzone'], [class*='drop-zone'], [class*='upload-area'], " +
            "[class*='file-upload'], [class*='drag-drop']",
        }
      );

      // Check if a file input appeared after activating the drop zone
      await page.waitForTimeout(1000);
      const newInput = await page.$("input[type='file']");
      if (newInput) {
        await newInput.setInputFiles(filePath);
        return { ok: true, method: "drop_zone_revealed_input" };
      }

      return { ok: false, reason: "DROP_ZONE_NO_INPUT" };
    } catch (error) {
      logLine({
        level: "WARN",
        step: "UPLOAD",
        msg: `Drag-drop upload failed: ${error?.message ?? "unknown"}`,
      });
      return { ok: false, reason: "DROP_ZONE_ERROR" };
    }
  }

  return { ok: false, reason: "NO_UPLOAD_ELEMENT" };
}

/**
 * Enhanced page fingerprint that accounts for modals, overlays,
 * and visible section headings for better progress detection.
 */
export async function captureEnhancedFingerprint(page) {
  return page
    .evaluate(() => {
      const heading =
        document.querySelector("h1, h2, [role='heading']")?.textContent?.trim() ?? "";
      const requiredCount = document.querySelectorAll(
        "input[required], textarea[required], select[required], " +
        "input[aria-required='true'], textarea[aria-required='true'], select[aria-required='true']"
      ).length;
      const buttons = Array.from(
        document.querySelectorAll(
          "button, input[type='submit'], input[type='button'], [role='button']"
        )
      )
        .slice(0, 6)
        .map((el) =>
          (
            el.textContent ||
            el.getAttribute("value") ||
            el.getAttribute("aria-label") ||
            ""
          )
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
        .join("|");

      // Detect visible modals/dialogs
      const hasModal = Boolean(
        document.querySelector(
          "[role='dialog']:not([aria-hidden='true']), .modal.show, .modal.active"
        )
      );

      // Count filled vs total required fields
      const filledRequired = document.querySelectorAll(
        "input[required]:not(:placeholder-shown), " +
        "textarea[required]:not(:placeholder-shown), " +
        "select[required]"
      ).length;

      // Section labels visible on screen
      const sections = Array.from(document.querySelectorAll("h2, h3, legend, .section-title"))
        .slice(0, 3)
        .map((el) => el.textContent?.trim()?.slice(0, 40) ?? "")
        .filter(Boolean)
        .join("|");

      return [
        window.location.pathname + window.location.hash,
        document.title ?? "",
        heading.slice(0, 120),
        String(requiredCount),
        String(filledRequired),
        buttons.slice(0, 240),
        hasModal ? "MODAL" : "",
        sections.slice(0, 120),
      ].join("::");
    })
    .catch(() => "");
}
