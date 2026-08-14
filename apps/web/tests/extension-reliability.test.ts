import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

// Loads the real apps/extension/runner/{phrases,dom}.js into jsdom and locks in
// the reliability logic touched by the "quick wins" pass: field resolution,
// resume MIME derivation, the confined confirmation check (isConfirmationVisible),
// and flow fingerprinting. A true end-to-end check still needs the extension in a
// real browser (apps/extension/VERIFY.md).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let JG: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let win: any;

beforeAll(() => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const read = (rel: string) =>
    readFileSync(path.resolve(here, "../../extension", rel), "utf8");

  const dom = new JSDOM(`<!DOCTYPE html><body></body>`, {
    runScripts: "outside-only",
  });
  win = dom.window;

  // jsdom doesn't lay out; force a non-zero box so visibility checks pass.
  win.Element.prototype.getBoundingClientRect = function () {
    return { width: 120, height: 24, top: 0, left: 0, right: 120, bottom: 24, x: 0, y: 0, toJSON() {} } as DOMRect;
  };

  // phrases.js must load before dom.js so window.JobGeniusPhrases is available.
  win.eval(read("runner/phrases.js"));
  win.eval(read("runner/dom.js"));
  JG = win.JobGeniusDom;
});

beforeEach(() => {
  win.document.body.innerHTML = "";
});

describe("phrases.js — i18n phrase table", () => {
  it("exposes intent-keyed lowercase phrase lists with non-English seeds", () => {
    const P = win.JobGeniusPhrases;
    expect(P).toBeTruthy();
    for (const key of ["apply", "submit", "confirmation", "captcha", "otpEmail", "otpSms"]) {
      expect(Array.isArray(P[key])).toBe(true);
      expect(P[key].every((s: string) => s === s.toLowerCase())).toBe(true);
    }
    // A few non-English seeds so international ATS pages don't hard-fail.
    expect(P.apply).toContain("postuler"); // fr
    expect(P.submit).toContain("enviar"); // es
    expect(P.confirmation).toContain("vielen dank"); // de
  });
});

describe("dom.js — resolveFieldValue", () => {
  const profile = {
    full_name: "Ada Lovelace",
    email: "ada@analytical.dev",
    work_history: [{ company: "Analytical Engines" }, {}, {}],
  };

  it("splits the applicant's name", () => {
    expect(JG.resolveFieldValue("first name", "text", profile, "x@y.com")).toBe("Ada");
    expect(JG.resolveFieldValue("last name", "text", profile, "x@y.com")).toBe("Lovelace");
    expect(JG.resolveFieldValue("full name", "text", profile, "x@y.com")).toBe("Ada Lovelace");
  });

  it("resolves email and the canned defaults", () => {
    expect(JG.resolveFieldValue("email address", "email", profile, "fallback@x.com")).toBe(
      "ada@analytical.dev"
    );
    expect(JG.resolveFieldValue("desired salary expectation", "text", profile, "")).toBe(
      "Negotiable"
    );
    expect(JG.resolveFieldValue("notice period", "text", profile, "")).toBe("2 weeks");
  });

  it("derives years of experience from work history (2 per role, capped at 15)", () => {
    expect(JG.resolveFieldValue("years of experience", "text", profile, "")).toBe("6");
  });

  it("does not fill a company field with the applicant's name", () => {
    expect(JG.resolveFieldValue("company name", "text", profile, "")).not.toBe("Ada Lovelace");
  });
});

describe("dom.js — deriveResumeFileMeta", () => {
  const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  it("derives filename + MIME from the URL extension", () => {
    expect(JG.deriveResumeFileMeta("https://cdn.x.com/a/resume.docx", "")).toEqual({
      fileName: "resume.docx",
      mimeType: DOCX,
    });
    expect(JG.deriveResumeFileMeta("https://cdn.x.com/a/cv.pdf?token=abc", "")).toEqual({
      fileName: "resume.pdf",
      mimeType: "application/pdf",
    });
  });

  it("falls back to the blob type, then PDF, when the URL has no extension", () => {
    expect(JG.deriveResumeFileMeta("https://cdn.x.com/download", "application/msword")).toEqual({
      fileName: "resume.doc",
      mimeType: "application/msword",
    });
    expect(JG.deriveResumeFileMeta("https://cdn.x.com/download", "")).toEqual({
      fileName: "resume.pdf",
      mimeType: "application/pdf",
    });
  });
});

describe("dom.js — isConfirmationVisible (confined confirmation)", () => {
  it("returns true for a success banner with the form gone", () => {
    win.document.body.innerHTML = `<div role="status">Your application was submitted</div>`;
    expect(JG.isConfirmationVisible()).toBe(true);
  });

  it("ignores a success phrase that only appears in ordinary body text", () => {
    // The OLD body-substring check returned true here (false positive).
    win.document.body.innerHTML = `
      <p>Thank you for your interest in this role.</p>
      <form><input aria-label="Email" required></form>`;
    expect(JG.isConfirmationVisible()).toBe(false);
  });

  it("requires the application form to be gone even with a success heading", () => {
    win.document.body.innerHTML = `
      <h2>Thank you</h2>
      <form><input aria-label="Email" required></form>`;
    expect(JG.isConfirmationVisible()).toBe(false);
  });
});

describe("dom.js — findButtonByText / findClickableByText (scored selection)", () => {
  const labelOf = (el: HTMLElement | null) =>
    el ? (el.textContent || el.getAttribute("aria-label") || "").trim() : null;

  it("prefers an exact match over a looser substring match", () => {
    win.document.body.innerHTML = `
      <button>Submit feedback form</button>
      <button>Submit</button>`;
    const el = JG.findButtonByText(["submit application", "submit"]);
    expect(labelOf(el)).toBe("Submit");
  });

  it("respects target priority order (Next chosen over Submit)", () => {
    // Submit appears first in the DOM; the old first-match logic would pick it.
    win.document.body.innerHTML = `
      <button>Submit</button>
      <button>Next</button>`;
    const el = JG.findButtonByText(["next", "continue", "submit"]);
    expect(labelOf(el)).toBe("Next");
  });

  it("does not click a negative 'Apply filters' control over the real Apply", () => {
    win.document.body.innerHTML = `
      <button>Apply filters</button>
      <button>Apply now</button>`;
    const el = JG.findButtonByText(["easy apply", "apply now", "apply"]);
    expect(labelOf(el)).toBe("Apply now");
  });

  it("returns null when the only match is a negative-label control", () => {
    win.document.body.innerHTML = `<button>Clear form</button>`;
    expect(JG.findButtonByText(["next", "continue", "submit"])).toBeNull();
  });

  it("matches an exact 'save and continue' over its 'continue' substring", () => {
    win.document.body.innerHTML = `<button>Save and continue</button>`;
    const el = JG.findButtonByText(["next", "continue", "save and continue"]);
    expect(labelOf(el)).toBe("Save and continue");
  });

  it("findClickableByText also considers anchors acting as buttons", () => {
    win.document.body.innerHTML = `<a href="/apply" role="button">Apply now</a>`;
    const el = JG.findClickableByText(["apply now", "apply"]);
    expect(labelOf(el)).toBe("Apply now");
  });

  it("skips disabled controls", () => {
    win.document.body.innerHTML = `
      <button disabled>Submit</button>
      <button>Submit application</button>`;
    const el = JG.findButtonByText(["submit application", "submit"]);
    expect(labelOf(el)).toBe("Submit application");
  });
});

describe("dom.js — setValueOnElement (React-safe fill) + clickElement", () => {
  it("sets an input value via the native setter and fires input+change", () => {
    win.document.body.innerHTML = `<input aria-label="Email" type="text">`;
    const input = win.document.querySelector("input") as HTMLInputElement;
    const events: string[] = [];
    input.addEventListener("input", () => events.push("input"));
    input.addEventListener("change", () => events.push("change"));

    const ok = JG.setValueOnElement(input, "ada@analytical.dev");
    expect(ok).toBe(true);
    expect(input.value).toBe("ada@analytical.dev");
    expect(events).toEqual(["input", "change"]);
  });

  it("selects a matching <select> option by visible text", () => {
    win.document.body.innerHTML = `
      <select aria-label="Country">
        <option value="">Select</option>
        <option value="us">United States</option>
        <option value="ca">Canada</option>
      </select>`;
    const select = win.document.querySelector("select") as HTMLSelectElement;
    const ok = JG.setValueOnElement(select, "United States");
    expect(ok).toBe(true);
    expect(select.value).toBe("us");
  });

  it("clickElement dispatches a real click on the target", async () => {
    win.document.body.innerHTML = `<button>Submit</button>`;
    const button = win.document.querySelector("button") as HTMLButtonElement;
    let clicked = 0;
    button.addEventListener("click", () => (clicked += 1));
    const dispatched = await JG.clickElement(button);
    expect(dispatched).toBe(true);
    expect(clicked).toBe(1);
  });
});

describe("dom.js — hasLoginWall (SESSION_EXPIRED detection)", () => {
  const JOB_URL = "https://boards.greenhouse.io/acme/jobs/123";

  it("detects auth-wall URLs by path segment", () => {
    expect(JG.hasLoginWall("https://www.linkedin.com/authwall?return=x")).toBe(true);
    expect(JG.hasLoginWall("https://www.linkedin.com/checkpoint/lg/login-submit")).toBe(true);
    expect(JG.hasLoginWall("https://secure.indeed.com/account/login")).toBe(true);
    expect(JG.hasLoginWall("https://acme.wd5.myworkdayjobs.com/careers/login")).toBe(true);
  });

  it("does not match job pages whose slugs merely contain auth words", () => {
    expect(JG.hasLoginWall("https://boards.greenhouse.io/acme/jobs/signin-specialist")).toBe(false);
    expect(JG.hasLoginWall(JOB_URL)).toBe(false);
  });

  it("detects a password field + sign-in copy", () => {
    win.document.body.innerHTML = `
      <h1>Sign in to your account</h1>
      <input type="email"><input type="password">
      <button>Sign in</button>`;
    expect(JG.hasLoginWall(JOB_URL)).toBe(true);
  });

  it("does NOT flag an ATS account-creation step (Workday-style)", () => {
    win.document.body.innerHTML = `
      <h1>Create Account</h1>
      <p>Create your account to continue applying.</p>
      <input type="email"><input type="password">
      <button>Create Account</button>`;
    expect(JG.hasLoginWall(JOB_URL)).toBe(false);
  });

  it("ignores pages without a password field", () => {
    win.document.body.innerHTML = `
      <p>Please sign in to see salary details.</p>
      <form><input aria-label="Email" type="email"></form>`;
    expect(JG.hasLoginWall(JOB_URL)).toBe(false);
  });
});

describe("dom.js — ARIA combobox driver", () => {
  // Minimal react-select-style widget: options render into a portal on
  // input/click, filtered by the typed value; clicking an option commits it.
  function mountTypeahead(optionsList: string[]) {
    win.document.body.innerHTML = `
      <label for="cb">Country</label>
      <input id="cb" type="text" role="combobox" aria-autocomplete="list">
      <div id="portal"></div>`;
    const input = win.document.getElementById("cb") as HTMLInputElement;
    const portal = win.document.getElementById("portal") as HTMLElement;
    let committed = "";
    const render = () => {
      const filter = (input.value || "").toLowerCase();
      portal.innerHTML = "";
      const listbox = win.document.createElement("div");
      listbox.setAttribute("role", "listbox");
      optionsList
        .filter((o: string) => o.toLowerCase().includes(filter))
        .forEach((o: string) => {
          const opt = win.document.createElement("div");
          opt.setAttribute("role", "option");
          opt.textContent = o;
          opt.addEventListener("click", () => {
            committed = o;
            input.value = o;
            portal.innerHTML = "";
          });
          listbox.appendChild(opt);
        });
      portal.appendChild(listbox);
    };
    input.addEventListener("input", render);
    input.addEventListener("click", render);
    return { input, getCommitted: () => committed };
  }

  it("drives a typeahead: open, type, click the matching option", async () => {
    const { input, getCommitted } = mountTypeahead([
      "United States",
      "Canada",
      "Mexico",
    ]);
    const ok = await JG.fillComboboxByValue(input, "Canada", { waitMs: 400 });
    expect(ok).toBe(true);
    expect(getCommitted()).toBe("Canada");
  });

  it("prefers the exact option over a longer partial match", async () => {
    const { input, getCommitted } = mountTypeahead([
      "United States Minor Outlying Islands",
      "United States",
    ]);
    const ok = await JG.fillComboboxByValue(input, "United States", { waitMs: 400 });
    expect(ok).toBe(true);
    expect(getCommitted()).toBe("United States");
  });

  it("refuses to click anything when no option matches", async () => {
    const { getCommitted, input } = mountTypeahead([
      "United States",
      "Canada",
    ]);
    const ok = await JG.fillComboboxByValue(input, "Wakanda", { waitMs: 150 });
    expect(ok).toBe(false);
    expect(getCommitted()).toBe("");
  });

  it("drives a Workday-style non-typeable listbox trigger", async () => {
    win.document.body.innerHTML = `
      <button id="trigger" aria-haspopup="listbox">Select one</button>
      <div id="portal"></div>`;
    const trigger = win.document.getElementById("trigger") as HTMLElement;
    const portal = win.document.getElementById("portal") as HTMLElement;
    let committed = "";
    trigger.addEventListener("click", () => {
      portal.innerHTML = "";
      ["Yes", "No"].forEach((o) => {
        const opt = win.document.createElement("div");
        opt.setAttribute("role", "option");
        opt.textContent = o;
        opt.addEventListener("click", () => {
          committed = o;
          portal.innerHTML = "";
        });
        portal.appendChild(opt);
      });
    });
    const ok = await JG.fillComboboxByValue(trigger, "Yes", { waitMs: 400 });
    expect(ok).toBe(true);
    expect(committed).toBe("Yes");
  });

  it("detects combobox controls (ARIA 1.1 + 1.2) and not plain fields", () => {
    win.document.body.innerHTML = `
      <input id="a" role="combobox">
      <button id="b" aria-haspopup="listbox">Open</button>
      <div role="combobox"><input id="c"></div>
      <input id="d" type="text">
      <select id="e"><option>x</option></select>`;
    const byId = (id: string) => win.document.getElementById(id);
    expect(JG.isComboboxControl(byId("a"))).toBe(true);
    expect(JG.isComboboxControl(byId("b"))).toBe(true);
    expect(JG.isComboboxControl(byId("c"))).toBe(true);
    expect(JG.isComboboxControl(byId("d"))).toBe(false);
    expect(JG.isComboboxControl(byId("e"))).toBe(false);
  });

  it("fillFieldsByLabel routes labeled comboboxes through the driver", async () => {
    const { getCommitted } = mountTypeahead(["United States", "Canada"]);
    const filled = await JG.fillFieldsByLabel({ Country: "Canada" });
    expect(filled).toBe(1);
    expect(getCommitted()).toBe("Canada");
  });

  it("fillTextInputs never blind-sets a combobox input", () => {
    win.document.body.innerHTML = `
      <label for="city">City</label>
      <input id="city" type="text" aria-autocomplete="list">`;
    const input = win.document.getElementById("city") as HTMLInputElement;
    JG.fillTextInputs("x@y.com", { location: "Austin, TX" });
    expect(input.value).toBe(""); // left for the classify → driver path
  });
});

describe("dom.js — dataUrlToBlob (proof screenshot upload)", () => {
  it("decodes a base64 data URL preserving MIME type and bytes", () => {
    // "SGVsbG8=" = "Hello" (5 bytes).
    const blob = JG.dataUrlToBlob("data:image/png;base64,SGVsbG8=");
    expect(blob).toBeTruthy();
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(5);
  });

  it("handles non-base64 data URLs and defaults the MIME type", () => {
    const blob = JG.dataUrlToBlob("data:,Hello%20world");
    expect(blob).toBeTruthy();
    expect(blob.size).toBe(11);
    expect(blob.type).toBe("application/octet-stream");
  });

  it("returns null for malformed input instead of throwing", () => {
    expect(JG.dataUrlToBlob("not-a-data-url")).toBeNull();
    expect(JG.dataUrlToBlob("data:image/png;base64,%%%")).toBeNull();
    expect(JG.dataUrlToBlob(null)).toBeNull();
  });
});

describe("dom.js — captureFlowFingerprint (no-progress detection)", () => {
  it("changes when the page advances and is stable for identical DOM", () => {
    const stateA = `<h1>Personal details</h1><input aria-label="Email" required>`;
    const stateB = `<h1>Review and submit</h1>`;

    win.document.body.innerHTML = stateA;
    const fpA = JG.captureFlowFingerprint();

    win.document.body.innerHTML = stateB;
    const fpB = JG.captureFlowFingerprint();

    win.document.body.innerHTML = stateA;
    const fpA2 = JG.captureFlowFingerprint();

    expect(fpA).not.toBe(fpB); // progressed
    expect(fpA2).toBe(fpA); // same page → same fingerprint
  });
});
