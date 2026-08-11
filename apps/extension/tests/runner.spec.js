// Real-browser fixture tests for the extension runner (see helpers.js).
// These run the ACTUAL runner/{phrases,dom}.js and adapters in headless
// Chromium against fixture pages cloning Greenhouse / Lever / Workday /
// LinkedIn structures — asserting the behaviors jsdom can't: real layout
// visibility, real pointer-event handling, async portal rendering, and
// file inputs.
const { test, expect } = require("@playwright/test");
const {
  loadRunner,
  GREENHOUSE_FIXTURE,
  LEVER_FIXTURE,
  WORKDAY_FIXTURE,
  LINKEDIN_FIXTURE,
  INDEED_JOB_FIXTURE,
  INDEED_EXTERNAL_ONLY_FIXTURE,
  INDEED_SMARTAPPLY_FIXTURE,
  PROFILE,
} = require("./helpers");

test.describe("Greenhouse-style form", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(GREENHOUSE_FIXTURE);
    await loadRunner(page);
  });

  test("button scoring picks the real submit over decoy controls", async ({ page }) => {
    const pickedId = await page.evaluate(() => {
      const btn = window.JobGeniusDom.findButtonByText(
        window.JobGeniusPhrases.submit
      );
      return btn ? btn.id : null;
    });
    expect(pickedId).toBe("submit-app"); // not decoy-filters / decoy-clear
  });

  test("fillAllFields fills profile fields with real input events", async ({ page }) => {
    const summary = await page.evaluate((profile) => {
      return window.JobGeniusDom.fillAllFields("fallback@x.com", profile, null);
    }, PROFILE);
    expect(summary.text).toBeGreaterThanOrEqual(4);
    await expect(page.locator("#first_name")).toHaveValue("Ada");
    await expect(page.locator("#last_name")).toHaveValue("Lovelace");
    await expect(page.locator("#email")).toHaveValue("ada@analytical.dev");
    await expect(page.locator("#phone")).toHaveValue(PROFILE.phone);
  });

  test("uploadResume attaches a fetched file to the real file input", async ({ page }) => {
    await page.route("https://fixtures.test/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: { "access-control-allow-origin": "*" },
        body: Buffer.from("%PDF-1.4 fake resume"),
      })
    );
    const result = await page.evaluate(() =>
      window.JobGeniusDom.uploadResume("https://fixtures.test/resume.pdf")
    );
    expect(result.ok).toBe(true);
    const fileMeta = await page.evaluate(() => {
      const input = document.getElementById("resume");
      return input.files.length === 1
        ? { name: input.files[0].name, type: input.files[0].type }
        : null;
    });
    expect(fileMeta).toEqual({ name: "resume.pdf", type: "application/pdf" });
  });

  test("end-to-end: fill, upload, submit, confined confirmation detected", async ({ page }) => {
    await page.route("https://fixtures.test/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: { "access-control-allow-origin": "*" },
        body: Buffer.from("%PDF-1.4 fake resume"),
      })
    );
    const outcome = await page.evaluate(async (profile) => {
      const dom = window.JobGeniusDom;
      dom.fillAllFields("fallback@x.com", profile, null);
      await dom.uploadResume("https://fixtures.test/resume.pdf");
      const missingBefore = dom.extractRequiredFields().length;
      const submit = dom.findButtonByText(window.JobGeniusPhrases.submit);
      await dom.clickElement(submit);
      return { missingBefore };
    }, PROFILE);
    expect(outcome.missingBefore).toBe(0);

    await expect(page.locator("[role='alert']")).toContainText("Thank you");
    const confirmed = await page.evaluate(() =>
      window.JobGeniusDom.isConfirmationVisible(window.JobGeniusPhrases.confirmation)
    );
    expect(confirmed).toBe(true);
  });
});

test.describe("Lever-style posting", () => {
  test("generic adapter drives entry → fill → submit → confirm", async ({ page }) => {
    await page.setContent(LEVER_FIXTURE);
    await loadRunner(page);

    const result = await page.evaluate(async (profile) => {
      const dom = window.JobGeniusDom;
      const adapter = window.JobGeniusAdapterRegistry.getAdapter("GENERIC");
      const ctx = { profile, defaultEmail: "fallback@x.com", dryRun: false };

      const entry = await adapter.clickApplyEntry(ctx);
      const formVisible =
        document.getElementById("app-wrap").style.display === "block";

      const fill = await adapter.fillKnownFields(ctx);
      const missing = adapter.extractRequiredFields().length;
      const submit = await adapter.submit(ctx);
      const confirmed = adapter.confirm(ctx);

      return {
        entryOk: entry.ok,
        formVisible,
        fillOk: fill.ok,
        missing,
        submitOk: submit.ok,
        clickedLabel: submit.clickedLabel,
        confirmed,
      };
    }, PROFILE);

    expect(result.entryOk).toBe(true);
    expect(result.formVisible).toBe(true);
    expect(result.fillOk).toBe(true);
    expect(result.missing).toBe(0);
    expect(result.submitOk).toBe(true);
    expect(result.clickedLabel).toBe("Submit application");
    expect(result.confirmed).toBe(true);
  });
});

test.describe("Workday-style widgets", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(WORKDAY_FIXTURE);
    await loadRunner(page);
  });

  test("combobox driver selects from an async portal listbox", async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const trigger = document.getElementById("country-trigger");
      // Options render ~250ms after the open click — exercises the poll.
      return window.JobGeniusDom.fillComboboxByValue(
        trigger,
        "United States of America"
      );
    });
    expect(ok).toBe(true);
    const committed = await page.evaluate(() => window.__committedCountry);
    expect(committed).toBe("United States of America");
  });

  test("account-creation step is not misread as a login wall", async ({ page }) => {
    const wall = await page.evaluate(() =>
      window.JobGeniusDom.hasLoginWall("https://acme.wd5.myworkdayjobs.com/careers/job/123")
    );
    expect(wall).toBe(false);
  });
});

test.describe("Indeed adapter", () => {
  test("native Indeed Apply wins over decoys, arming the rearm BEFORE the click", async ({ page }) => {
    await page.setContent(INDEED_JOB_FIXTURE);
    await loadRunner(page, ["generic", "indeed"]);

    const result = await page.evaluate(async () => {
      window.__armedAt = 0;
      const adapter = window.JobGeniusAdapterRegistry.getAdapter("INDEED");
      const outcome = await adapter.clickApplyEntry({
        rearmAfterNavigation: async () => {
          window.__armedAt = Date.now();
        },
      });
      return {
        ok: outcome.ok,
        armedAt: window.__armedAt,
        nativeClickedAt: window.__nativeClickedAt,
        externalClickedAt: window.__externalClickedAt,
      };
    });

    expect(result.ok).toBe(true);
    expect(result.nativeClickedAt).toBeGreaterThan(0);
    expect(result.externalClickedAt).toBe(0); // external is the fallback, not a co-click
    // The background must be armed before the navigation-triggering click.
    expect(result.armedAt).toBeGreaterThan(0);
    expect(result.armedAt).toBeLessThanOrEqual(result.nativeClickedAt);
  });

  test("falls back to the external company-site branch with tab handoff", async ({ page }) => {
    await page.setContent(INDEED_EXTERNAL_ONLY_FIXTURE);
    await loadRunner(page, ["generic", "indeed"]);

    const result = await page.evaluate(async () => {
      let handoffRequested = false;
      const adapter = window.JobGeniusAdapterRegistry.getAdapter("INDEED");
      const outcome = await adapter.clickApplyEntry({
        handoffToNewTab: async () => {
          handoffRequested = true;
          return true;
        },
      });
      return {
        ok: outcome.ok,
        handoff: Boolean(outcome.handoff),
        handoffRequested,
        externalClickedAt: window.__externalClickedAt,
      };
    });

    expect(result.ok).toBe(true);
    expect(result.externalClickedAt).toBeGreaterThan(0);
    expect(result.handoffRequested).toBe(true);
    expect(result.handoff).toBe(true);
  });

  test("SmartApply stepper on the real hostname: detect → fill → continue → submit → confirm", async ({ page }) => {
    await page.route("https://smartapply.indeed.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: INDEED_SMARTAPPLY_FIXTURE })
    );
    await page.goto("https://smartapply.indeed.com/beta/indeedapply/form/contact-info");
    await loadRunner(page, ["generic", "indeed"]);

    const step1 = await page.evaluate(async (profile) => {
      const adapter = window.JobGeniusAdapterRegistry.getAdapter("INDEED");
      const detected = adapter.detect();
      const entry = await adapter.clickApplyEntry({}); // already in the form
      const fill = await adapter.fillKnownFields({
        defaultEmail: "fallback@x.com",
        profile,
      });
      const missing = adapter.extractRequiredFields().length;
      const advance = await adapter.submit({ dryRun: false, buttonHints: [] });
      return { detected, entryOk: entry.ok, fillOk: fill.ok, missing, advance };
    }, PROFILE);

    expect(step1.detected).toBe(true);
    expect(step1.entryOk).toBe(true);
    expect(step1.fillOk).toBe(true);
    expect(step1.missing).toBe(0);
    expect(step1.advance.ok).toBe(true);
    expect(step1.advance.clickedLabel).toBe("Continue");

    await expect(page.locator("#step-review")).toBeVisible();

    const step2 = await page.evaluate(async () => {
      const adapter = window.JobGeniusAdapterRegistry.getAdapter("INDEED");
      const submit = await adapter.submit({ dryRun: false, buttonHints: [] });
      const confirmed = adapter.confirm();
      return { submitOk: submit.ok, clickedLabel: submit.clickedLabel, confirmed };
    });

    expect(step2.submitOk).toBe(true);
    expect(step2.clickedLabel).toBe("Submit your application");
    expect(step2.confirmed).toBe(true);
  });
});

test.describe("Iframe handoff", () => {
  const EMBEDDED_FORM = `
    <div><label for='efn'>First Name *</label>
      <input id='efn' type='text' required></div>
    <div><label for='eem'>Email *</label>
      <input id='eem' type='email' required></div>
    <button type='button'>Submit application</button>`;

  test("same-origin embedded form: queryAllDeep descends into the iframe", async ({ page }) => {
    await page.setContent(`
      <h1>Careers at Acme</h1>
      <iframe id="gh-embed" srcdoc="${EMBEDDED_FORM.replace(/"/g, "&quot;")}"
              style="width:700px;height:500px"></iframe>`);
    // srcdoc loads asynchronously — wait for the inner form to exist.
    await page.waitForFunction(() =>
      document.querySelector("#gh-embed")?.contentDocument?.querySelector("#efn")
    );
    await loadRunner(page);

    const result = await page.evaluate(async (profile) => {
      const dom = window.JobGeniusDom;
      const adapter = window.JobGeniusAdapterRegistry.getAdapter("GENERIC");

      // No apply button on the top page, but the embedded form counts as
      // "already in the application".
      const entry = await adapter.clickApplyEntry({});

      const fillSummary = dom.fillAllFields("fallback@x.com", profile, null);
      const iframeDoc = document.querySelector("#gh-embed").contentDocument;
      const submit = dom.findButtonByText(["submit application", "submit"]);
      const missingLabels = dom.extractRequiredFields().map((f) => f.label);

      return {
        entryOk: entry.ok,
        filled: fillSummary.text,
        firstName: iframeDoc.getElementById("efn").value,
        email: iframeDoc.getElementById("eem").value,
        submitFound: Boolean(submit),
        submitInIframe: submit ? submit.ownerDocument === iframeDoc : false,
        missingLabels,
      };
    }, PROFILE);

    expect(result.entryOk).toBe(true);
    expect(result.filled).toBeGreaterThanOrEqual(2);
    expect(result.firstName).toBe("Ada"); // label[for] resolved inside the iframe doc
    expect(result.email).toBe("ada@analytical.dev");
    expect(result.submitFound).toBe(true);
    expect(result.submitInIframe).toBe(true);
    expect(result.missingLabels).toEqual([]); // required fields satisfied
  });

  test("cross-origin application iframe: adapter arms rearm and navigates to its src", async ({ page }) => {
    const IFRAME_SRC = "https://apply-vendor.test/application/123";
    await page.route("https://company.test/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <h1>Careers at Acme</h1>
          <iframe src="${IFRAME_SRC}" style="width:800px;height:600px"></iframe>
        </body></html>`,
      })
    );
    await page.route("https://apply-vendor.test/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body><form><input aria-label="Email" required></form></body></html>`,
      })
    );

    await page.goto("https://company.test/careers/role");
    await loadRunner(page);

    const consoleMessages = [];
    page.on("console", (message) => consoleMessages.push(message.text()));

    // The navigation destroys the evaluate context — that's expected.
    await page
      .evaluate(async () => {
        const adapter = window.JobGeniusAdapterRegistry.getAdapter("GENERIC");
        await adapter.clickApplyEntry({
          rearmAfterNavigation: async () => {
            console.log("JG_REARM_ARMED");
          },
        });
      })
      .catch(() => {});

    await page.waitForURL("https://apply-vendor.test/**", { timeout: 10000 });
    expect(page.url()).toBe(IFRAME_SRC);
    expect(consoleMessages).toContain("JG_REARM_ARMED"); // armed BEFORE navigating
  });

  test("widget-sized cross-origin iframes never trigger navigation", async ({ page }) => {
    await page.route("https://company.test/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <h1>Careers</h1>
          <iframe src="https://apply-vendor.test/application/chat-widget"
                  style="width:120px;height:80px"></iframe>
        </body></html>`,
      })
    );
    await page.goto("https://company.test/careers");
    await loadRunner(page);

    const result = await page.evaluate(async () => {
      const adapter = window.JobGeniusAdapterRegistry.getAdapter("GENERIC");
      return adapter.clickApplyEntry({});
    });

    // Too small to be an application — correct outcome is a clean pause.
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("APPLY_BUTTON_MISSING");
    expect(page.url()).toContain("company.test");
  });
});

test.describe("LinkedIn Easy Apply-style modal", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(LINKEDIN_FIXTURE);
    await loadRunner(page);
  });

  test("real-layout visibility: hidden duplicate and decoy are skipped", async ({ page }) => {
    const pickedId = await page.evaluate(() => {
      const btn = window.JobGeniusDom.findButtonByText(["easy apply"]);
      return btn ? btn.id : null;
    });
    // Not #hidden-apply (display:none — jsdom can't verify this, Chromium can)
    // and not #decoy-settings ("Apply settings").
    expect(pickedId).toBe("easy-apply");
  });

  test("modal stepper: entry → step 1 → Next → step 2 → submit → confirmation", async ({ page }) => {
    await page.evaluate(async (profile) => {
      const dom = window.JobGeniusDom;
      // Entry
      await dom.clickElement(dom.findButtonByText(["easy apply"]));
      // Step 1: fill and advance. "Next" must win over the (hidden) submit.
      dom.fillAllFields("fallback@x.com", profile, null);
      await dom.clickElement(dom.findButtonByText(window.JobGeniusPhrases.submit));
    }, PROFILE);

    await expect(page.locator("#step-2")).toBeVisible();

    await page.evaluate(async (profile) => {
      const dom = window.JobGeniusDom;
      dom.fillAllFields("fallback@x.com", profile, null);
      await dom.clickElement(dom.findButtonByText(window.JobGeniusPhrases.submit));
    }, PROFILE);

    await expect(page.locator("[role='alert']")).toContainText("Application submitted");
    const confirmed = await page.evaluate(() =>
      window.JobGeniusDom.isConfirmationVisible(window.JobGeniusPhrases.confirmation)
    );
    expect(confirmed).toBe(true);
  });
});
