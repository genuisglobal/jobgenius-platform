// Real-browser fixture verification for the deep Workday adapter.
//
// Drives the ACTUAL src/adapters/workday.js through a fixture page cloning a
// Workday tenant's structures (data-automation-ids, auth wall with account
// creation, ARIA listbox with async portal options, wizard Next validation
// with error banner, success page):
//
//   node tests/workday-fixture.mjs        (requires: npx playwright install chromium)
//
// Exits non-zero on the first failed assertion. This is the offline half of
// the ticket-7 acceptance; the staging half (3 real postings E2E) is in
// README.md → "Staging verification".
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { workdayAdapter } from "../src/adapters/workday.js";

const FIXTURE = `
<div id="stage-job">
  <h1>Senior Analytical Engine Operator</h1>
  <button data-automation-id="adventureButton">Apply</button>
</div>

<div id="stage-chooser" style="display:none">
  <button data-automation-id="autofillWithResume">Autofill with Resume</button>
  <button data-automation-id="applyManually">Apply Manually</button>
</div>

<div id="stage-auth" style="display:none">
  <div id="auth-error" data-automation-id="errorMessage" style="display:none"></div>
  <label>Email Address</label>
  <input data-automation-id="email" type="text">
  <label>Password</label>
  <input data-automation-id="password" type="password">
  <label>Verify New Password</label>
  <input data-automation-id="verifyPassword" type="password">
  <input data-automation-id="createAccountCheckbox" type="checkbox">
  <button data-automation-id="createAccountSubmitButton">Create Account</button>
  <button data-automation-id="signInLink">Sign In</button>
</div>

<div id="stage-app" style="display:none">
  <div id="app-error" data-automation-id="errorBanner" style="display:none">
    Please fix the errors below.
  </div>
  <div data-automation-id="legalNameSection">
    <label for="fn">First Name *</label>
    <input id="fn" data-automation-id="legalNameSection_firstName" type="text" required>
    <label for="ln">Last Name *</label>
    <input id="ln" data-automation-id="legalNameSection_lastName" type="text" required>
  </div>
  <div data-automation-id="addressSection_countryRegion_container">
    <label id="country-label">Country *</label>
    <button data-automation-id="addressSection_countryRegion" aria-haspopup="listbox"
            aria-labelledby="country-label">Select One</button>
  </div>
  <div id="portal"></div>
  <button data-automation-id="bottom-navigation-next-button">Next</button>
</div>

<div id="stage-review" style="display:none">
  <h2>Review</h2>
  <button data-automation-id="bottom-navigation-next-button">Submit</button>
</div>

<div id="stage-done" style="display:none">
  <h2>You've successfully applied!</h2>
</div>

<script>
  const show = (id) => {
    for (const stage of document.querySelectorAll("[id^='stage-']")) {
      stage.style.display = stage.id === id ? "block" : "none";
    }
  };
  window.__committedCountry = "";

  document.querySelector("[data-automation-id='adventureButton']")
    .addEventListener("click", () => show("stage-chooser"));
  document.querySelector("[data-automation-id='applyManually']")
    .addEventListener("click", () => show("stage-auth"));

  document.querySelector("[data-automation-id='createAccountSubmitButton']")
    .addEventListener("click", () => {
      const email = document.querySelector("[data-automation-id='email']").value.trim();
      const pw = document.querySelector("[data-automation-id='password']").value;
      const verify = document.querySelector("[data-automation-id='verifyPassword']").value;
      const err = document.getElementById("auth-error");
      // Workday-ish validation: email + matching complex password required.
      const complex = pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw)
        && /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw);
      if (!email || !complex || pw !== verify) {
        err.textContent = "Password does not meet requirements.";
        err.style.display = "block";
        return;
      }
      show("stage-app");
    });

  const trigger = document.querySelector("[data-automation-id='addressSection_countryRegion']");
  const portal = document.getElementById("portal");
  trigger.addEventListener("click", () => {
    portal.innerHTML = "";
    setTimeout(() => {  // async render, like Workday's portal
      const listbox = document.createElement("ul");
      listbox.setAttribute("role", "listbox");
      for (const label of ["Canada", "United States of America", "United Kingdom"]) {
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        li.textContent = label;
        li.addEventListener("click", () => {
          window.__committedCountry = label;
          trigger.textContent = label;
          portal.innerHTML = "";
        });
        listbox.appendChild(li);
      }
      portal.appendChild(listbox);
    }, 200);
  });

  document.querySelector("#stage-app [data-automation-id='bottom-navigation-next-button']")
    .addEventListener("click", () => {
      const err = document.getElementById("app-error");
      const fn = document.getElementById("fn").value.trim();
      const ln = document.getElementById("ln").value.trim();
      if (!fn || !ln || !window.__committedCountry) {
        err.style.display = "block";  // Workday validates on Next
        return;
      }
      err.style.display = "none";
      show("stage-review");
    });

  document.querySelector("#stage-review [data-automation-id='bottom-navigation-next-button']")
    .addEventListener("click", () => show("stage-done"));
</script>`;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(FIXTURE);

  let markFailedCalled = false;
  let snapshots = 0;
  const ctx = {
    runId: "fixture-run",
    currentStep: "AUTO_ADVANCE",
    dryRun: false,
    buttonHints: [],
    profile: {
      full_name: "Ada Lovelace",
      email: "ada@analytical.dev",
      phone: "+1 555 010 1234",
      address_country: "United States",
    },
    atsAccount: {
      email: "ada@analytical.dev",
      password: "Xk7$mQp2!vRw9Tz",
      created: true, // fresh row → adapter tries create-account first
      markFailed: async () => {
        markFailedCalled = true;
      },
    },
    captureSnapshot: async () => {
      snapshots += 1;
    },
  };

  // 1. Entry: Apply → Apply Manually → create account with stored creds.
  const entry = await workdayAdapter.clickApplyEntry(page, ctx);
  assert.equal(entry.ok, true, `clickApplyEntry failed: ${JSON.stringify(entry)}`);
  assert.equal(
    await page.locator("#stage-app").isVisible(),
    true,
    "expected the application wizard after account creation"
  );
  assert.equal(markFailedCalled, false, "markFailed must not fire on success");
  console.log("PASS entry + account creation");

  // 2. Premature Next (nothing filled) → adapter surfaces the error banner.
  const rejected = await workdayAdapter.submit(page, ctx);
  assert.equal(rejected.ok, false, "empty wizard page must not advance");
  assert.equal(rejected.reason, "REQUIRED_FIELDS");
  assert.match(rejected.meta?.workday_error_banner ?? "", /fix the errors/i);
  console.log("PASS error-banner detection");

  // 3. Fill: automation-id inputs + listbox (async portal) via the driver.
  const fill = await workdayAdapter.fillKnownFields(page, ctx);
  assert.equal(fill.ok, true);
  assert.equal(await page.locator("#fn").inputValue(), "Ada");
  assert.equal(await page.locator("#ln").inputValue(), "Lovelace");
  const committed = await page.evaluate(() => window.__committedCountry);
  assert.equal(
    committed,
    "United States of America",
    "country listbox should commit via the combobox driver"
  );
  console.log("PASS automation-id fill + listbox driver");

  // 4. Nothing required remains (the listbox is set, so it isn't reported).
  const missing = await workdayAdapter.extractRequiredFields(page);
  assert.equal(missing.length, 0, `unexpected missing: ${JSON.stringify(missing)}`);
  console.log("PASS extractRequiredFields clean");

  // 5. Advance through Review to submission; confirm() goes true only then.
  assert.equal((await workdayAdapter.submit(page, ctx)).ok, true);
  assert.equal(await workdayAdapter.confirm(page), false, "Review page is not a confirmation");
  assert.equal((await workdayAdapter.submit(page, ctx)).ok, true);
  assert.equal(await workdayAdapter.confirm(page), true, "success page must confirm");
  assert.ok(snapshots >= 2, `expected per-step snapshots, got ${snapshots}`);
  console.log("PASS wizard traversal + confirmation + per-step snapshots");

  await browser.close();
  console.log("\nAll Workday fixture checks passed.");
}

main().catch((error) => {
  console.error("FIXTURE FAILURE:", error.message);
  process.exit(1);
});
