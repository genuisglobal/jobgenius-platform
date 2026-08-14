import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

// Loads the real apps/extension/runner/dom.js into jsdom and verifies its
// shadow-DOM piercing (extractRequiredFields + fillFieldsByLabel ride
// queryAllDeep). A true end-to-end check still needs the extension in a real
// browser (apps/extension/VERIFY.md) — this locks in the parsing/fill logic.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let JG: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let shadow: any;

beforeAll(() => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const domSrc = readFileSync(
    path.resolve(here, "../../extension/runner/dom.js"),
    "utf8"
  );

  const dom = new JSDOM(
    `<!DOCTYPE html><body><input id="light" aria-label="Full Name"></body>`,
    { runScripts: "outside-only" }
  );
  const { window } = dom;

  // jsdom doesn't lay out; force a non-zero box so visibility checks pass.
  window.Element.prototype.getBoundingClientRect = function () {
    return { width: 120, height: 24, top: 0, left: 0, right: 120, bottom: 24, x: 0, y: 0, toJSON() {} } as DOMRect;
  };

  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <input id="email" type="email" aria-label="Email" required>
    <select id="gender" aria-label="Gender" required>
      <option value=""></option>
      <option>Male</option>
      <option>Female</option>
      <option>Prefer not to answer</option>
    </select>
  `;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).eval(domSrc);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  JG = (window as any).JobGeniusDom;
});

describe("extension dom.js — shadow-DOM piercing", () => {
  it("exposes JobGeniusDom after load", () => {
    expect(JG).toBeTruthy();
  });

  it("extractRequiredFields detects fields inside a shadow root", () => {
    const labels = JG.extractRequiredFields().map((f: { label: string }) => f.label);
    expect(labels).toContain("Email");
    expect(labels).toContain("Gender");
  });

  it("fillFieldsByLabel fills shadow inputs and matches select options", async () => {
    // fillFieldsByLabel became async in v0.4.17 (combobox driving awaits).
    const filled = await JG.fillFieldsByLabel({
      Email: "tester@example.com",
      Gender: "Prefer not to answer",
    });
    expect(filled).toBeGreaterThanOrEqual(2);
    expect(shadow.getElementById("email").value).toBe("tester@example.com");
    const gender = shadow.getElementById("gender");
    expect(gender.value).toBeTruthy();
    expect(gender.options[gender.selectedIndex].textContent).toMatch(/prefer not/i);
  });
});
