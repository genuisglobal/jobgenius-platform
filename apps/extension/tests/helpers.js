// Shared helpers for the real-browser fixture tests: load the ACTUAL runner
// files (not copies) into a Playwright page, plus fixture HTML cloning the
// form structures of the ATSes we automate. If a selector/scoring regression
// ships in runner/dom.js or an adapter, these fixtures are what catch it
// under real layout, real pointer events, and real async rendering — the
// things the jsdom suites in apps/web/tests can only fake.
const path = require("path");

const RUNNER_DIR = path.resolve(__dirname, "..", "runner");

/** Load phrases + dom + adapter registry (+ named adapters) into the page. */
async function loadRunner(page, adapters = ["generic"]) {
  await page.addScriptTag({ path: path.join(RUNNER_DIR, "phrases.js") });
  await page.addScriptTag({ path: path.join(RUNNER_DIR, "dom.js") });
  await page.addScriptTag({ path: path.join(RUNNER_DIR, "adapters", "base.js") });
  for (const name of adapters) {
    await page.addScriptTag({
      path: path.join(RUNNER_DIR, "adapters", `${name}.js`),
    });
  }
}

// ─── Fixture pages ────────────────────────────────────────────────────────

/**
 * Greenhouse-style application form. Two-step: the form page itself (GH has
 * no separate "apply" click on hosted boards), then a confirmation swap on
 * submit. Includes the classic decoy controls a careless matcher clicks.
 */
const GREENHOUSE_FIXTURE = `
<form action="https://boards.greenhouse.io/acme/jobs/123" id="application_form">
  <nav>
    <button type="button" id="decoy-filters">Apply filters</button>
    <button type="button" id="decoy-clear">Clear form</button>
  </nav>
  <div><label for="first_name">First Name *</label>
    <input id="first_name" name="first_name" type="text" required></div>
  <div><label for="last_name">Last Name *</label>
    <input id="last_name" name="last_name" type="text" required></div>
  <div><label for="email">Email *</label>
    <input id="email" name="email" type="email" required></div>
  <div><label for="phone">Phone</label>
    <input id="phone" name="phone" type="tel"></div>
  <div><label for="resume">Resume/CV *</label>
    <input id="resume" name="resume" type="file" required></div>
  <button type="button" id="submit-app">Submit application</button>
</form>
<script>
  document.getElementById("submit-app").addEventListener("click", () => {
    const form = document.getElementById("application_form");
    const missing = Array.from(form.querySelectorAll("[required]")).filter((el) =>
      el.type === "file" ? el.files.length === 0 : !el.value.trim()
    );
    if (missing.length > 0) return; // real GH blocks submit on empty required
    document.body.innerHTML =
      '<div role="alert"><h2>Thank you</h2><p>Your application has been submitted.</p></div>';
  });
</script>`;

/**
 * Lever-style posting page: an "Apply for this job" entry link reveals the
 * form (Lever hosted postings scroll/reveal), then submit → confirmation.
 */
const LEVER_FIXTURE = `
<div id="posting">
  <a href="#apply" role="button" id="apply-entry">Apply for this job</a>
</div>
<div id="app-wrap" style="display:none">
  <form class="application-form">
    <div><label for="name">Full name *</label>
      <input id="name" name="name" type="text" required></div>
    <div><label for="email">Email *</label>
      <input id="email" name="email" type="email" required></div>
    <button type="button" id="submit-app">Submit application</button>
  </form>
</div>
<script>
  document.getElementById("apply-entry").addEventListener("click", () => {
    document.getElementById("app-wrap").style.display = "block";
  });
  document.getElementById("submit-app").addEventListener("click", () => {
    const form = document.querySelector(".application-form");
    const missing = Array.from(form.querySelectorAll("[required]")).filter(
      (el) => !el.value.trim()
    );
    if (missing.length > 0) return;
    document.body.innerHTML =
      '<div role="status">Application submitted — thank you!</div>';
  });
</script>`;

/**
 * Workday-style page: an aria-haspopup="listbox" trigger button whose options
 * render ASYNCHRONOUSLY into a portal at document root (Workday/React portal
 * behavior — this is what defeats naive same-container queries), plus a
 * "Create Account" block that must NOT read as a login wall.
 */
const WORKDAY_FIXTURE = `
<div id="create-account">
  <h2>Create Account</h2>
  <p>Create your account to continue applying.</p>
  <input type="email" aria-label="Email Address">
  <input type="password" aria-label="Password">
</div>
<div>
  <label id="country-label">Country *</label>
  <button id="country-trigger" aria-haspopup="listbox" aria-labelledby="country-label">
    Select One
  </button>
</div>
<div id="portal"></div>
<script>
  const trigger = document.getElementById("country-trigger");
  const portal = document.getElementById("portal");
  window.__committedCountry = "";
  trigger.addEventListener("click", () => {
    portal.innerHTML = "";
    // Async render — options appear on the next frame + delay, like Workday.
    setTimeout(() => {
      const listbox = document.createElement("ul");
      listbox.setAttribute("role", "listbox");
      ["Canada", "United States of America", "United Kingdom"].forEach((label) => {
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        li.textContent = label;
        li.addEventListener("click", () => {
          window.__committedCountry = label;
          trigger.textContent = label;
          portal.innerHTML = "";
        });
        listbox.appendChild(li);
      });
      portal.appendChild(listbox);
    }, 250);
  });
</script>`;

/**
 * LinkedIn Easy Apply-style flow: jobs page with an Easy Apply button that
 * opens a modal stepper (step 1 → Next → step 2 → Submit application), with
 * a decoy "Apply settings" control and an off-screen hidden duplicate button.
 */
const LINKEDIN_FIXTURE = `
<div id="job">
  <button id="decoy-settings" type="button">Apply settings</button>
  <button id="hidden-apply" aria-label="Easy Apply" style="display:none">Easy Apply</button>
  <button id="easy-apply" aria-label="Easy Apply to Acme">Easy Apply</button>
</div>
<div id="modal" style="display:none" role="dialog">
  <div id="step-1">
    <label for="li-email">Email address *</label>
    <input id="li-email" type="email" required>
    <button id="next-btn" type="button" aria-label="Continue to next step">Next</button>
  </div>
  <div id="step-2" style="display:none">
    <label for="li-phone">Mobile phone number *</label>
    <input id="li-phone" type="tel" required>
    <button id="li-submit" type="button" aria-label="Submit application">Submit application</button>
  </div>
</div>
<script>
  document.getElementById("easy-apply").addEventListener("click", () => {
    document.getElementById("modal").style.display = "block";
  });
  document.getElementById("next-btn").addEventListener("click", () => {
    if (!document.getElementById("li-email").value.trim()) return;
    document.getElementById("step-1").style.display = "none";
    document.getElementById("step-2").style.display = "block";
  });
  document.getElementById("li-submit").addEventListener("click", () => {
    if (!document.getElementById("li-phone").value.trim()) return;
    document.body.innerHTML =
      '<div role="alert"><h2>Application submitted</h2></div>';
  });
</script>`;

/**
 * Indeed job page: native Indeed Apply button (stable id), an external
 * "Apply on company site" alternative, and decoys. Clicking the native
 * button records a timestamp so tests can assert the background was armed
 * BEFORE the navigation-triggering click.
 */
const INDEED_JOB_FIXTURE = `
<div id="jobsearch">
  <button id="save-job" type="button">Save job</button>
  <button id="indeedApplyButton" type="button"><span>Apply now</span></button>
  <a id="external-apply" href="#external" role="button">Apply on company site</a>
</div>
<script>
  window.__nativeClickedAt = 0;
  window.__externalClickedAt = 0;
  document.getElementById("indeedApplyButton").addEventListener("click", () => {
    window.__nativeClickedAt = Date.now();
  });
  document.getElementById("external-apply").addEventListener("click", (e) => {
    e.preventDefault();
    window.__externalClickedAt = Date.now();
  });
</script>`;

/** Same page but external-only (employer disabled Indeed Apply). */
const INDEED_EXTERNAL_ONLY_FIXTURE = `
<div id="jobsearch">
  <button id="save-job" type="button">Save job</button>
  <a id="external-apply" href="#external" role="button">Apply on company site</a>
</div>
<script>
  window.__externalClickedAt = 0;
  document.getElementById("external-apply").addEventListener("click", (e) => {
    e.preventDefault();
    window.__externalClickedAt = Date.now();
  });
</script>`;

/**
 * SmartApply-style stepper (served via page.route on the REAL
 * smartapply.indeed.com hostname so detect()/isSmartApply run truthfully):
 * contact step → Continue → review step → "Submit your application" →
 * confirmation.
 */
const INDEED_SMARTAPPLY_FIXTURE = `<!doctype html><html><body>
<div id="step-contact">
  <label for="ia-email">Email address *</label>
  <input id="ia-email" type="email" required>
  <label for="ia-phone">Phone number *</label>
  <input id="ia-phone" type="tel" required>
  <button id="continue-btn" type="button">Continue</button>
</div>
<div id="step-review" style="display:none">
  <h2>Review your application</h2>
  <button id="submit-btn" type="button">Submit your application</button>
</div>
<script>
  document.getElementById("continue-btn").addEventListener("click", () => {
    if (!document.getElementById("ia-email").value.trim()) return;
    document.getElementById("step-contact").style.display = "none";
    document.getElementById("step-review").style.display = "block";
  });
  document.getElementById("submit-btn").addEventListener("click", () => {
    document.body.innerHTML =
      '<div role="alert"><h2>Your application has been submitted!</h2></div>';
  });
</script>
</body></html>`;

const PROFILE = {
  full_name: "Ada Lovelace",
  email: "ada@analytical.dev",
  phone: "+1 555 010 1234",
  location: "Austin, TX",
};

module.exports = {
  loadRunner,
  GREENHOUSE_FIXTURE,
  LEVER_FIXTURE,
  WORKDAY_FIXTURE,
  LINKEDIN_FIXTURE,
  INDEED_JOB_FIXTURE,
  INDEED_EXTERNAL_ONLY_FIXTURE,
  INDEED_SMARTAPPLY_FIXTURE,
  PROFILE,
};
