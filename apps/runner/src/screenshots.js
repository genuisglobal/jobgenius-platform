/**
 * Screenshot capture on failure for debugging.
 * Uploads to Supabase storage bucket `runner-screenshots` via API.
 */

import fs from "fs";
import path from "path";
import { logLine } from "./logger.js";

const SCREENSHOT_API_ENABLED = !["0", "false", "no", "off"].includes(
  String(process.env.RUNNER_SCREENSHOTS_ENABLED ?? "true").toLowerCase()
);

const STATE_DIR = process.env.STORAGE_STATE_PATH ?? path.join(process.cwd(), ".state");
const SCREENSHOTS_DIR = path.join(STATE_DIR, ".screenshots");

export async function captureFailureScreenshot(page, { runId, step, reason, apiBaseUrl, authToken, runnerId }) {
  if (!SCREENSHOT_API_ENABLED || !page) return null;

  try {
    if (!fs.existsSync(SCREENSHOTS_DIR)) {
      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    }

    const timestamp = Date.now();
    const filename = `${runId}_${step}_${timestamp}.png`;
    const filepath = path.join(SCREENSHOTS_DIR, filename);

    await page.screenshot({ path: filepath, fullPage: false });

    // Upload via API
    if (apiBaseUrl && authToken) {
      try {
        const fileBuffer = fs.readFileSync(filepath);
        const blob = new Blob([fileBuffer], { type: "image/png" });
        const formData = new FormData();
        formData.append("file", blob, filename);
        formData.append("run_id", runId);
        formData.append("step", step ?? "");
        formData.append("reason", reason ?? "");
        formData.append("url", page.url());

        await fetch(`${apiBaseUrl}/api/apply/screenshot`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authToken}`,
            "x-runner": "cloud",
            "x-runner-id": runnerId ?? "",
          },
          body: formData,
        });
      } catch (uploadError) {
        logLine({
          level: "WARN",
          runId,
          step: "SCREENSHOT",
          msg: `Upload failed: ${uploadError?.message ?? "unknown"}. Local file kept.`,
        });
      }
    }

    // Clean up local file after upload attempt
    try {
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    } catch {}

    logLine({
      level: "INFO",
      runId,
      step: "SCREENSHOT",
      msg: `Captured failure screenshot for ${step} (${reason}).`,
    });

    return filename;
  } catch (error) {
    logLine({
      level: "WARN",
      runId,
      step: "SCREENSHOT",
      msg: `Screenshot capture failed: ${error?.message ?? "unknown"}`,
    });
    return null;
  }
}
