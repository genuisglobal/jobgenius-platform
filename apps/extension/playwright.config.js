// Playwright config for the extension runner's real-browser fixture tests.
// Chromium only: the runner ships as a Chrome (MV3) extension, so other
// engines would test an environment it never runs in.
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: true,
  // CI budget for the whole suite is < 5 minutes (workflow enforces it).
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    browserName: "chromium",
    headless: true,
  },
});
